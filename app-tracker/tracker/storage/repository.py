import sqlite3
from dataclasses import dataclass
from datetime import datetime


@dataclass
class Session:
    """A single tracked application session."""

    app: str
    category: str
    started_at: datetime
    ended_at: datetime
    duration: int  # seconds
    id: int | None = None


def insert_session(conn: sqlite3.Connection, session: Session) -> None:
    """Persist a completed session to the database."""
    conn.execute(
        """
        INSERT INTO sessions (started_at, ended_at, app, category, duration)
        VALUES (?, ?, ?, ?, ?)
        """,
        (
            session.started_at.isoformat(),
            session.ended_at.isoformat(),
            session.app,
            session.category,
            session.duration,
        ),
    )
    conn.commit()


def fetch_sessions_since(conn: sqlite3.Connection, since: datetime) -> list[Session]:
    """Return all sessions that started on or after `since`."""
    rows = conn.execute(
        "SELECT * FROM sessions WHERE started_at >= ? ORDER BY started_at",
        (since.isoformat(),),
    ).fetchall()
    return [
        Session(
            id=row["id"],
            app=row["app"],
            category=row["category"],
            started_at=datetime.fromisoformat(row["started_at"]),
            ended_at=datetime.fromisoformat(row["ended_at"]),
            duration=row["duration"],
        )
        for row in rows
    ]


def fetch_all_apps(conn: sqlite3.Connection) -> list[tuple[str, str]]:
    """Return distinct (app, category) pairs ordered alphabetically."""
    rows = conn.execute(
        "SELECT DISTINCT app, category FROM sessions ORDER BY app"
    ).fetchall()
    return [(row["app"], row["category"]) for row in rows]
