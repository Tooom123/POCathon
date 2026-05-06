from dataclasses import dataclass


@dataclass(frozen=True)
class Decor:
    id: str
    name: str
    emoji: str
    cost: float
    income_per_sec: float
    unlock_seconds: int


# Mirror of SHOP_DECORS in client/src/animals.ts.
CATALOG: list[Decor] = [
    Decor("plant",        "Plante",      "🌿", 50,    0.3,  0),
    Decor("flowers-tall", "Fleurs",      "🌷", 200,   1.5,  0),
    Decor("mushrooms",    "Champignons", "🍄", 500,   4.0,  60),
    Decor("tree-pine",    "Sapin",       "🌲", 1500,  12.0, 240),
]

_INDEX: dict[str, Decor] = {d.id: d for d in CATALOG}


def find_decor(decor_id: str) -> Decor | None:
    return _INDEX.get(decor_id)
