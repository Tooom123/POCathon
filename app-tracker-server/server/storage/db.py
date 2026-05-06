import os
import sqlite3
from pathlib import Path

DEFAULT_DB_PATH = Path.home() / ".local" / "share" / "app-tracker-server" / "server.db"


def get_db_path() -> Path:
    """Return the database file path, respecting APP_TRACKER_SERVER_DB env var."""
    env = os.environ.get("APP_TRACKER_SERVER_DB")
    return Path(env) if env else DEFAULT_DB_PATH


def get_connection() -> sqlite3.Connection:
    """Open (and migrate) the SQLite database, returning a connection."""
    db_path = get_db_path()
    db_path.parent.mkdir(parents=True, exist_ok=True)
    conn = sqlite3.connect(db_path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    conn.execute("PRAGMA journal_mode=WAL")
    _migrate(conn)
    return conn


def _migrate(conn: sqlite3.Connection) -> None:
    """Run all schema migrations idempotently."""
    conn.executescript("""
        CREATE TABLE IF NOT EXISTS sessions (
            id          INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id     TEXT NOT NULL,
            app         TEXT NOT NULL,
            category    TEXT NOT NULL,
            started_at  TEXT NOT NULL,
            ended_at    TEXT NOT NULL,
            duration    INTEGER NOT NULL,
            received_at TEXT NOT NULL
        );

        -- Fast overlap lookups per user
        CREATE INDEX IF NOT EXISTS idx_user_time
            ON sessions(user_id, started_at, ended_at);

        -- Prevent exact duplicates (same user, same app, same start)
        CREATE UNIQUE INDEX IF NOT EXISTS idx_dedup
            ON sessions(user_id, app, started_at);

        CREATE TABLE IF NOT EXISTS auth_tokens (
            token       TEXT PRIMARY KEY,
            user_id     TEXT,               -- NULL until linked
            status      TEXT NOT NULL DEFAULT 'pending',
            created_at  TEXT NOT NULL,
            linked_at   TEXT,
            expires_at  TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_tokens_expires ON auth_tokens(expires_at);

        CREATE TABLE IF NOT EXISTS user_pets (
            id         INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id    TEXT NOT NULL,
            animal_id  TEXT NOT NULL,
            cost       REAL NOT NULL,
            bought_at  TEXT NOT NULL,
            UNIQUE(user_id, animal_id)
        );

        CREATE INDEX IF NOT EXISTS idx_pets_user ON user_pets(user_id);

        CREATE TABLE IF NOT EXISTS user_islands (
            user_id           TEXT PRIMARY KEY,
            island_level      INTEGER NOT NULL DEFAULT 1,
            spent_on_upgrades REAL    NOT NULL DEFAULT 0
        );

        -- Decors: multi-purchase allowed (no UNIQUE constraint).
        -- Each row is one purchased decor slot.
        CREATE TABLE IF NOT EXISTS user_decors (
            id        INTEGER PRIMARY KEY AUTOINCREMENT,
            user_id   TEXT NOT NULL,
            decor_id  TEXT NOT NULL,
            cost      REAL NOT NULL,
            bought_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_decors_user ON user_decors(user_id);
    """)
    conn.commit()
