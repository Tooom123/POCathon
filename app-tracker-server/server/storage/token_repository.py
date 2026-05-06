import sqlite3
from dataclasses import dataclass
from datetime import datetime, timezone


@dataclass
class AuthToken:
    token: str
    status: str          # "pending" | "linked"
    created_at: datetime
    expires_at: datetime
    user_id: str | None = None
    linked_at: datetime | None = None


def create_token(conn: sqlite3.Connection, token: str, expires_at: datetime) -> AuthToken:
    """Persist a new pending token."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    conn.execute(
        """
        INSERT INTO auth_tokens (token, status, created_at, expires_at)
        VALUES (?, 'pending', ?, ?)
        """,
        (token, now.isoformat(), expires_at.isoformat()),
    )
    conn.commit()
    return AuthToken(token=token, status="pending", created_at=now, expires_at=expires_at)


def get_token(conn: sqlite3.Connection, token: str) -> AuthToken | None:
    """Return the token record, or None if it does not exist."""
    row = conn.execute(
        "SELECT * FROM auth_tokens WHERE token = ?", (token,)
    ).fetchone()
    return _row_to_token(row) if row else None


def link_token(conn: sqlite3.Connection, token: str, user_id: str) -> AuthToken | None:
    """
    Associate user_id with a pending, non-expired token.
    Returns the updated record, or None if the token is invalid/already used.
    """
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cursor = conn.execute(
        """
        UPDATE auth_tokens
        SET status = 'linked', user_id = ?, linked_at = ?
        WHERE token = ?
          AND status = 'pending'
          AND expires_at > ?
        """,
        (user_id, now.isoformat(), token, now.isoformat()),
    )
    conn.commit()
    if cursor.rowcount == 0:
        return None
    return get_token(conn, token)


def purge_expired(conn: sqlite3.Connection) -> int:
    """Delete expired tokens. Returns the number of rows removed."""
    now = datetime.now(timezone.utc).replace(tzinfo=None)
    cursor = conn.execute(
        "DELETE FROM auth_tokens WHERE expires_at <= ?", (now.isoformat(),)
    )
    conn.commit()
    return cursor.rowcount


def _row_to_token(row: sqlite3.Row) -> AuthToken:
    return AuthToken(
        token=row["token"],
        status=row["status"],
        user_id=row["user_id"],
        created_at=datetime.fromisoformat(row["created_at"]),
        expires_at=datetime.fromisoformat(row["expires_at"]),
        linked_at=datetime.fromisoformat(row["linked_at"]) if row["linked_at"] else None,
    )
