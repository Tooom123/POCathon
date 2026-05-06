import sqlite3
from dataclasses import dataclass


@dataclass
class IslandRecord:
    level: int
    spent_on_upgrades: float


def get_island_record(conn: sqlite3.Connection, user_id: str) -> IslandRecord:
    """Return the user's island record, defaulting to level 1 if not yet created."""
    row = conn.execute(
        "SELECT island_level, spent_on_upgrades FROM user_islands WHERE user_id = ?",
        (user_id,),
    ).fetchone()
    if row is None:
        return IslandRecord(level=1, spent_on_upgrades=0.0)
    return IslandRecord(level=row["island_level"], spent_on_upgrades=row["spent_on_upgrades"])


def set_island_level(
    conn: sqlite3.Connection,
    user_id: str,
    new_level: int,
    additional_cost: float,
) -> IslandRecord:
    """Upsert the island level and accumulate the upgrade cost paid."""
    conn.execute(
        """
        INSERT INTO user_islands (user_id, island_level, spent_on_upgrades)
        VALUES (?, ?, ?)
        ON CONFLICT(user_id) DO UPDATE SET
            island_level      = excluded.island_level,
            spent_on_upgrades = spent_on_upgrades + excluded.spent_on_upgrades
        """,
        (user_id, new_level, additional_cost),
    )
    conn.commit()
    return get_island_record(conn, user_id)
