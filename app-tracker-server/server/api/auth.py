import asyncio
import json
import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field
from uuid import UUID

from server.auth.service import (
    LINKED_TTL_HOURS,
    PENDING_TTL_MINUTES,
    generate_token,
    linked_expiry,
    pending_expiry,
    token_is_usable,
)
from server.storage.token_repository import AuthToken, create_token, get_token, link_token

router = APIRouter(prefix="/auth", tags=["auth"])

SSE_POLL_INTERVAL = 1.0   # seconds between DB checks in the SSE stream
SSE_MAX_SECONDS = PENDING_TTL_MINUTES * 60


# ── helpers ──────────────────────────────────────────────────────────────────

def _get_conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def _token_response(t: AuthToken) -> dict:
    return {
        "token": t.token,
        "status": t.status,
        "user_id": t.user_id,
        "expires_at": t.expires_at.isoformat(),
    }


# ── dependency: require a linked, non-expired token ──────────────────────────

def require_linked_token(
    request: Request,
    conn: sqlite3.Connection = Depends(_get_conn),
) -> AuthToken:
    """
    FastAPI dependency for leaderboard routes.
    Reads the token from the Authorization header: 'Bearer <token>'.
    Raises 401 if absent, 403 if invalid or expired.
    """
    auth = request.headers.get("Authorization", "")
    if not auth.startswith("Bearer "):
        raise HTTPException(status_code=401, detail="Missing Authorization header")
    raw_token = auth.removeprefix("Bearer ").strip()
    record = get_token(conn, raw_token)
    if not token_is_usable(record):
        raise HTTPException(status_code=403, detail="Token invalid, expired, or not yet linked")
    return record


# ── routes ───────────────────────────────────────────────────────────────────

@router.post("/token", status_code=201)
def request_token(conn: sqlite3.Connection = Depends(_get_conn)) -> dict:
    """
    Browser calls this to obtain a pending token to display to the user.
    The user must then run `tracker link <token>` on their PC within
    {PENDING_TTL_MINUTES} minutes.
    """
    token = generate_token()
    record = create_token(conn, token, expires_at=pending_expiry())
    return {
        **_token_response(record),
        "expires_in_seconds": PENDING_TTL_MINUTES * 60,
        "instructions": f"Run on your PC:  tracker link {token}",
    }


class LinkPayload(BaseModel):
    user_id: UUID
    token: str = Field(min_length=1, max_length=32)


@router.post("/link", status_code=200)
def link_session(
    body: LinkPayload,
    conn: sqlite3.Connection = Depends(_get_conn),
) -> dict:
    """
    PC client calls this to bind its persistent user_id to a pending browser token.
    On success the SSE stream for that token emits a 'linked' event.
    """
    record = link_token(conn, body.token, str(body.user_id))
    if record is None:
        raise HTTPException(
            status_code=404,
            detail="Token not found, already used, or expired",
        )
    # Extend expiry now that it's linked so the browser session stays alive
    conn.execute(
        "UPDATE auth_tokens SET expires_at = ? WHERE token = ?",
        (linked_expiry().isoformat(), record.token),
    )
    conn.commit()
    return {**_token_response(record), "expires_in_seconds": LINKED_TTL_HOURS * 3600}


@router.get("/token/{token}/status")
def token_status(
    token: str,
    conn: sqlite3.Connection = Depends(_get_conn),
) -> dict:
    """Polling alternative to the SSE stream."""
    record = get_token(conn, token)
    if record is None:
        raise HTTPException(status_code=404, detail="Token not found")
    if record.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
        raise HTTPException(status_code=410, detail="Token expired")
    return _token_response(record)


@router.get("/token/{token}/stream")
async def token_stream(
    token: str,
    request: Request,
    conn: sqlite3.Connection = Depends(_get_conn),
) -> StreamingResponse:
    """
    SSE endpoint — browser connects here and waits for the 'linked' event.
    Emits one event per second until linked, expired, or the client disconnects.
    """
    async def generate():
        elapsed = 0.0
        while elapsed < SSE_MAX_SECONDS:
            if await request.is_disconnected():
                return

            record = get_token(conn, token)

            if record is None:
                yield _sse({"status": "not_found"})
                return

            if record.expires_at < datetime.now(timezone.utc).replace(tzinfo=None):
                yield _sse({"status": "expired"})
                return

            yield _sse(_token_response(record))

            if record.status == "linked":
                return

            await asyncio.sleep(SSE_POLL_INTERVAL)
            elapsed += SSE_POLL_INTERVAL

        yield _sse({"status": "expired"})

    return StreamingResponse(generate(), media_type="text/event-stream")


def _sse(data: dict) -> str:
    return f"data: {json.dumps(data)}\n\n"
