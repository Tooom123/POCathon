from dataclasses import dataclass

MAX_ISLAND_LEVEL = 6


@dataclass(frozen=True)
class IslandLevel:
    level: int
    capacity: int         # max pets
    decor_capacity: int   # max decors (separate slots)
    upgrade_cost: float | None  # None = max level


# Mirror of ISLAND_LEVELS in client/src/animals.ts.
ISLAND_LEVELS: list[IslandLevel] = [
    IslandLevel(level=1, capacity=4,  decor_capacity=2,  upgrade_cost=500),
    IslandLevel(level=2, capacity=6,  decor_capacity=4,  upgrade_cost=3_000),
    IslandLevel(level=3, capacity=9,  decor_capacity=6,  upgrade_cost=15_000),
    IslandLevel(level=4, capacity=13, decor_capacity=9,  upgrade_cost=70_000),
    IslandLevel(level=5, capacity=18, decor_capacity=13, upgrade_cost=300_000),
    IslandLevel(level=6, capacity=25, decor_capacity=18, upgrade_cost=None),
]

_BY_LEVEL: dict[int, IslandLevel] = {il.level: il for il in ISLAND_LEVELS}


def get_island_info(level: int) -> IslandLevel:
    """Return island level data, clamped to [1, MAX_ISLAND_LEVEL]."""
    clamped = min(max(level, 1), MAX_ISLAND_LEVEL)
    return _BY_LEVEL[clamped]
