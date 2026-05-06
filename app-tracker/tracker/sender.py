import json
import os
import urllib.error
import urllib.request
from dataclasses import dataclass
from datetime import datetime
from sqlite3 import Connection

from tracker.storage.repository import Session, fetch_sessions_since

SEND_INTERVAL = 300  # seconds — envoyé toutes les 5 minutes


@dataclass
class SendResult:
    accepted: int
    rejected: int
    error: str | None = None


def get_server_url() -> str | None:
    """Return APP_TRACKER_SERVER env var, or None if not configured (sync disabled)."""
    return os.environ.get("APP_TRACKER_SERVER")


def send_report(
    conn: Connection,
    user_id: str,
    since: datetime,
    server_url: str,
) -> tuple[SendResult, datetime]:
    """
    Fetch sessions stored since `since`, POST them to the server.
    Returns (result, new_cursor) — cursor advances only on success so
    failed sessions are retried on the next tick.
    """
    sessions = fetch_sessions_since(conn, since)
    if not sessions:
        return SendResult(accepted=0, rejected=0), since

    payload = _build_payload(user_id, sessions)
    url = f"{server_url.rstrip('/')}/webhook/report"
    req = urllib.request.Request(
        url,
        data=json.dumps(payload).encode(),
        headers={"Content-Type": "application/json"},
        method="POST",
    )

    try:
        with urllib.request.urlopen(req, timeout=10) as resp:
            body = json.loads(resp.read())
        result = SendResult(
            accepted=body.get("accepted", 0),
            rejected=len(body.get("rejected", [])),
        )
        return result, datetime.now()
    except urllib.error.HTTPError as exc:
        msg = f"HTTP {exc.code}"
        try:
            msg += f" — {json.loads(exc.read()).get('detail', '')}"
        except Exception:  # noqa: BLE001
            pass
        return SendResult(accepted=0, rejected=0, error=msg), since
    except (urllib.error.URLError, TimeoutError) as exc:
        return SendResult(accepted=0, rejected=0, error=str(exc)), since


def _build_payload(user_id: str, sessions: list[Session]) -> dict:
    return {
        "user_id": user_id,
        "sessions": [
            {
                "app": s.app,
                "category": s.category,
                "started_at": s.started_at.isoformat(),
                "ended_at": s.ended_at.isoformat(),
                "duration": s.duration,
            }
            for s in sessions
        ],
    }
