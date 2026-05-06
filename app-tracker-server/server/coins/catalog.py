from dataclasses import dataclass


@dataclass(frozen=True)
class Animal:
    id: str
    name: str
    emoji: str
    cost: float
    income_per_sec: float
    rarity: str
    unlock_seconds: int


# Mirror of client/src/animals.ts — keep in sync when the client catalog changes.
CATALOG: list[Animal] = [
    # ── Common ──────────────────────────────────────────────────────────────
    Animal("chick",    "Poussin",      "🐥", 30,      0.5,   "common",    0),
    Animal("bunny",    "Lapin",        "🐰", 80,      1.0,   "common",    0),
    Animal("pig",      "Cochon",       "🐷", 200,     2.0,   "common",    120),
    Animal("cat",      "Chat",         "🐱", 400,     3.5,   "common",    240),
    # ── Uncommon ────────────────────────────────────────────────────────────
    Animal("dog",      "Chien",        "🐶", 900,     7.0,   "uncommon",  480),
    Animal("penguin",  "Pingouin",     "🐧", 1500,    12.0,  "uncommon",  720),
    Animal("beaver",   "Castor",       "🦫", 2500,    20.0,  "uncommon",  1080),
    Animal("fox",      "Renard",       "🦊", 4000,    32.0,  "uncommon",  1440),
    # ── Rare ────────────────────────────────────────────────────────────────
    Animal("panda",    "Panda",        "🐼", 8000,    55.0,  "rare",      2160),
    Animal("koala",    "Koala",        "🐨", 15000,   90.0,  "rare",      3000),
    Animal("deer",     "Cerf",         "🦌", 28000,   150.0, "rare",      4320),
    Animal("monkey",   "Singe",        "🐒", 50000,   240.0, "rare",      6000),
    # ── Epic ────────────────────────────────────────────────────────────────
    Animal("parrot",   "Perroquet",    "🦜", 100000,  400.0, "epic",      9000),
    Animal("tiger",    "Tigre",        "🐯", 180000,  650.0, "epic",      12600),
    Animal("lion",     "Lion",         "🦁", 300000,  1000.0,"epic",      18000),
    # ── Legendary ───────────────────────────────────────────────────────────
    Animal("elephant", "Éléphant",     "🐘", 600000,  1800.0,"legendary", 25200),
    Animal("giraffe",  "Girafe",       "🦒", 1200000, 3000.0,"legendary", 36000),
    Animal("polar",    "Ours polaire", "🐻‍❄️", 2500000, 5000.0,"legendary", 54000),
]

_INDEX: dict[str, Animal] = {a.id: a for a in CATALOG}


def find_animal(animal_id: str) -> Animal | None:
    """Return the animal with the given id, or None if unknown."""
    return _INDEX.get(animal_id)
