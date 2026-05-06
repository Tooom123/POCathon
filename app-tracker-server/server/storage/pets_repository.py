import sqlite3
from dataclasses import dataclass
from datetime import datetime


@dataclass
class OwnedPet:
    id: int
    user_id: str
    animal_id: str
    cost: float
    bought_at: datetime


def get_owned_pets(conn: sqlite3.Connection, user_id: str) -> list[OwnedPet]:
    """Return all pets owned by user_id, ordered by purchase date."""
    rows = conn.execute(
        "SELECT * FROM user_pets WHERE user_id = ? ORDER BY bought_at",
        (user_id,),
    ).fetchall()
    return [_row_to_pet(r) for r in rows]


def owns_pet(conn: sqlite3.Connection, user_id: str, animal_id: str) -> bool:
    """Return True if the user already owns this pet."""
    return conn.execute(
        "SELECT 1 FROM user_pets WHERE user_id = ? AND animal_id = ? LIMIT 1",
        (user_id, animal_id),
    ).fetchone() is not None


def add_pet(
    conn: sqlite3.Connection,
    user_id: str,
    animal_id: str,
    cost: float,
    bought_at: datetime,
) -> OwnedPet | None:
    """Insert a new pet purchase. Returns the record, or None if already owned."""
    try:
        cursor = conn.execute(
            """
            INSERT INTO user_pets (user_id, animal_id, cost, bought_at)
            VALUES (?, ?, ?, ?)
            """,
            (user_id, animal_id, cost, bought_at.isoformat()),
        )
        conn.commit()
        return OwnedPet(
            id=cursor.lastrowid,
            user_id=user_id,
            animal_id=animal_id,
            cost=cost,
            bought_at=bought_at,
        )
    except sqlite3.IntegrityError:
        return None


def _row_to_pet(row: sqlite3.Row) -> OwnedPet:
    return OwnedPet(
        id=row["id"],
        user_id=row["user_id"],
        animal_id=row["animal_id"],
        cost=row["cost"],
        bought_at=datetime.fromisoformat(row["bought_at"]),
    )
