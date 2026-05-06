import sqlite3
from dataclasses import dataclass
from datetime import datetime


@dataclass
class OwnedDecor:
    id: int
    user_id: str
    decor_id: str
    cost: float
    bought_at: datetime


def get_owned_decors(conn: sqlite3.Connection, user_id: str) -> list[OwnedDecor]:
    """Return all decors owned by user_id, ordered by purchase date."""
    rows = conn.execute(
        "SELECT * FROM user_decors WHERE user_id = ? ORDER BY bought_at",
        (user_id,),
    ).fetchall()
    return [_row(r) for r in rows]


def count_owned_decors(conn: sqlite3.Connection, user_id: str) -> int:
    """Return the total number of decor slots used by user_id."""
    row = conn.execute(
        "SELECT COUNT(*) FROM user_decors WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    return row[0]


def add_decor(
    conn: sqlite3.Connection,
    user_id: str,
    decor_id: str,
    cost: float,
    bought_at: datetime,
) -> OwnedDecor:
    """Insert a new decor purchase (multi-purchase allowed)."""
    cursor = conn.execute(
        "INSERT INTO user_decors (user_id, decor_id, cost, bought_at) VALUES (?, ?, ?, ?)",
        (user_id, decor_id, cost, bought_at.isoformat()),
    )
    conn.commit()
    return OwnedDecor(
        id=cursor.lastrowid,
        user_id=user_id,
        decor_id=decor_id,
        cost=cost,
        bought_at=bought_at,
    )


def _row(row: sqlite3.Row) -> OwnedDecor:
    return OwnedDecor(
        id=row["id"],
        user_id=row["user_id"],
        decor_id=row["decor_id"],
        cost=row["cost"],
        bought_at=datetime.fromisoformat(row["bought_at"]),
    )
