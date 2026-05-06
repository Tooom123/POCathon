import sqlite3
from dataclasses import dataclass
from datetime import datetime


@dataclass
class StoredSession:
    """A session as stored in the server database."""

    user_id: str
    app: str
    category: str
    started_at: datetime
    ended_at: datetime
    duration: int
    received_at: datetime
    id: int | None = None


def is_duplicate(conn: sqlite3.Connection, user_id: str, app: str, started_at: datetime) -> bool:
    """Return True if an identical session (same user, app, started_at) already exists."""
    row = conn.execute(
        "SELECT 1 FROM sessions WHERE user_id = ? AND app = ? AND started_at = ? LIMIT 1",
        (user_id, app, started_at.isoformat()),
    ).fetchone()
    return row is not None


def find_overlapping(
    conn: sqlite3.Connection,
    user_id: str,
    started_at: datetime,
    ended_at: datetime,
    exclude_app: str | None = None,
    exclude_started_at: datetime | None = None,
) -> StoredSession | None:
    """Return the first existing session for user_id that overlaps [started_at, ended_at].

    Pass exclude_app + exclude_started_at to skip the session being upserted (live updates).
    """
    if exclude_app is not None and exclude_started_at is not None:
        row = conn.execute(
            """
            SELECT * FROM sessions
            WHERE user_id = ?
              AND started_at < ?
              AND ended_at   > ?
              AND NOT (app = ? AND started_at = ?)
            LIMIT 1
            """,
            (
                user_id,
                ended_at.isoformat(),
                started_at.isoformat(),
                exclude_app,
                exclude_started_at.isoformat(),
            ),
        ).fetchone()
    else:
        row = conn.execute(
            """
            SELECT * FROM sessions
            WHERE user_id = ?
              AND started_at < ?
              AND ended_at   > ?
            LIMIT 1
            """,
            (user_id, ended_at.isoformat(), started_at.isoformat()),
        ).fetchone()
    if row is None:
        return None
    return _row_to_session(row)


def insert_session(conn: sqlite3.Connection, session: StoredSession) -> bool:
    """Insert a session. Returns False if it was an exact duplicate (dedup index hit)."""
    try:
        conn.execute(
            """
            INSERT INTO sessions
                (user_id, app, category, started_at, ended_at, duration, received_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)
            """,
            (
                session.user_id,
                session.app,
                session.category,
                session.started_at.isoformat(),
                session.ended_at.isoformat(),
                session.duration,
                session.received_at.isoformat(),
            ),
        )
        conn.commit()
        return True
    except sqlite3.IntegrityError:
        return False


def upsert_session(conn: sqlite3.Connection, session: StoredSession) -> None:
    """Insert or extend a session matched by (user_id, app, started_at).

    On conflict, updates ended_at/duration/received_at so a live in-progress
    session grows instead of creating duplicate rows.
    """
    conn.execute(
        """
        INSERT INTO sessions
            (user_id, app, category, started_at, ended_at, duration, received_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        ON CONFLICT(user_id, app, started_at) DO UPDATE SET
            ended_at    = excluded.ended_at,
            duration    = excluded.duration,
            received_at = excluded.received_at
        """,
        (
            session.user_id,
            session.app,
            session.category,
            session.started_at.isoformat(),
            session.ended_at.isoformat(),
            session.duration,
            session.received_at.isoformat(),
        ),
    )
    conn.commit()


def fetch_sessions_for_user(
    conn: sqlite3.Connection, user_id: str
) -> list[StoredSession]:
    """Return all sessions for a user ordered by start time."""
    rows = conn.execute(
        "SELECT * FROM sessions WHERE user_id = ? ORDER BY started_at",
        (user_id,),
    ).fetchall()
    return [_row_to_session(r) for r in rows]


def fetch_productive_sessions(
    conn: sqlite3.Connection, user_id: str
) -> list[StoredSession]:
    """Return all productive sessions for a user ordered by start time."""
    rows = conn.execute(
        "SELECT * FROM sessions WHERE user_id = ? AND category = 'productive' ORDER BY started_at",
        (user_id,),
    ).fetchall()
    return [_row_to_session(r) for r in rows]


def _row_to_session(row: sqlite3.Row) -> StoredSession:
    return StoredSession(
        id=row["id"],
        user_id=row["user_id"],
        app=row["app"],
        category=row["category"],
        started_at=datetime.fromisoformat(row["started_at"]),
        ended_at=datetime.fromisoformat(row["ended_at"]),
        duration=row["duration"],
        received_at=datetime.fromisoformat(row["received_at"]),
    )
