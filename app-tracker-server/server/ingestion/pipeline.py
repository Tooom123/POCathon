import sqlite3
from datetime import datetime, timedelta, timezone

from server.models.schemas import IngestResponse, RejectedSession, ReportPayload, SessionPayload
from server.storage.repository import StoredSession, find_overlapping, upsert_session

RECENCY_WINDOW_MINUTES = 15
DURATION_TOLERANCE_SECONDS = 5  # allowed drift between duration field and timestamp diff


def _now_utc() -> datetime:
    return datetime.now(timezone.utc)


def _as_utc(dt: datetime) -> datetime:
    """Attach UTC if the datetime is naive (clients send local/naive ISO strings)."""
    if dt.tzinfo is None:
        return dt.replace(tzinfo=timezone.utc)
    return dt.astimezone(timezone.utc)


def ingest_report(
    conn: sqlite3.Connection, payload: ReportPayload, now: datetime | None = None
) -> IngestResponse:
    """Validate and persist all sessions in a report. Returns per-session accept/reject detail."""
    now = now or _now_utc()
    cutoff = now - timedelta(minutes=RECENCY_WINDOW_MINUTES)
    user_id = str(payload.user_id)
    received_at = now.replace(tzinfo=None)  # store as naive UTC

    accepted = 0
    rejected: list[RejectedSession] = []

    for session in payload.sessions:
        reason = _validate(session, now=now, cutoff=cutoff, conn=conn, user_id=user_id)
        if reason:
            rejected.append(
                RejectedSession(
                    app=session.app,
                    started_at=session.started_at,
                    ended_at=session.ended_at,
                    reason=reason,
                )
            )
            continue

        stored = StoredSession(
            user_id=user_id,
            app=session.app,
            category=session.category,
            started_at=session.started_at.replace(tzinfo=None),
            ended_at=session.ended_at.replace(tzinfo=None),
            duration=session.duration,
            received_at=received_at,
        )
        upsert_session(conn, stored)
        accepted += 1

    return IngestResponse(accepted=accepted, rejected=rejected)


def _validate(
    session: SessionPayload,
    *,
    now: datetime,
    cutoff: datetime,
    conn: sqlite3.Connection,
    user_id: str,
) -> str | None:
    """Return a rejection reason string, or None if the session is valid."""
    ended_utc = _as_utc(session.ended_at)
    started_utc = _as_utc(session.started_at)

    # 1. Recency — ended_at must be within the acceptance window
    if ended_utc < cutoff:
        return (
            f"too old: ended_at {session.ended_at.isoformat()} is outside "
            f"the {RECENCY_WINDOW_MINUTES}-minute acceptance window"
        )

    # 2. No future sessions
    if started_utc > now:
        return f"invalid: started_at {session.started_at.isoformat()} is in the future"

    # 3. Overlap with already-stored sessions for this user.
    # Exclude the session being upserted (same app + started_at) so that live
    # updates extending an in-progress session are never flagged as self-overlap.
    started_naive = session.started_at.replace(tzinfo=None)
    overlap = find_overlapping(
        conn,
        user_id,
        started_naive,
        session.ended_at.replace(tzinfo=None),
        exclude_app=session.app,
        exclude_started_at=started_naive,
    )
    if overlap:
        return (
            f"overlap: conflicts with existing session "
            f"[{overlap.app}] {overlap.started_at.isoformat()} → {overlap.ended_at.isoformat()}"
        )

    return None
