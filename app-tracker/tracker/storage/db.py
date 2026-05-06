import os
import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path.home() / ".local" / "share" / "app-tracker" / "tracker.db"


def get_db_path() -> Path:
    """Return the database file path, respecting APP_TRACKER_DB env var."""
    env = os.environ.get("APP_TRACKER_DB")
    return Path(env) if env else DEFAULT_DB_PATH


def get_connection() -> sqlite3.Connection:
    """Open (and migrate) the SQLite database, returning a connection."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path)
    conn.row_factory = sqlite3.Row
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Run all schema migrations idempotently."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            started_at TEXT NOT NULL,
            ended_at   TEXT NOT NULL,
            app        TEXT NOT NULL,
            category   TEXT NOT NULL,
            duration   INTEGER NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
        CREATE INDEX IF NOT EXISTS idx_sessions_category   ON sessions(category);
    """)
    conn.commit()
