from dataclasses import dataclass, field

from server.coins.catalog import find_animal
from server.coins.decor_catalog import find_decor
from server.storage.decors_repository import OwnedDecor
from server.storage.pets_repository import OwnedPet
from server.storage.repository import StoredSession

COIN_RATE_BASE = 0.2
COIN_RATE_STEP = 0.2
STREAK_MILESTONE = 600
STREAK_GAP_TOLERANCE = 30


@dataclass
class CoinsResult:
    coins: float
    productive_seconds: int


@dataclass
class BalanceResult:
    balance: float
    earned_productivity: float
    earned_pets: float
    earned_decors: float
    spent_pets: float
    spent_decors: float
    spent_island: float
    productive_seconds: int
    income_per_sec: float
    pets: list[str] = field(default_factory=list)
    decors: list[str] = field(default_factory=list)


def compute_coins(sessions: list[StoredSession]) -> CoinsResult:
    """Compute productivity coins (base rate + streak bonuses).

    Only productive sessions earn coins. Consecutive productive sessions
    separated by ≤ STREAK_GAP_TOLERANCE seconds are treated as one streak.
    """
    productive = sorted(
        (s for s in sessions if s.category == "productive"),
        key=lambda s: s.started_at,
    )

    if not productive:
        return CoinsResult(coins=0.0, productive_seconds=0)

    total_coins = 0.0
    total_seconds = 0
    streak_duration = productive[0].duration

    for prev, curr in zip(productive, productive[1:]):
        gap = (curr.started_at - prev.ended_at).total_seconds()
        if gap <= STREAK_GAP_TOLERANCE:
            streak_duration += curr.duration
        else:
            total_coins += _coins_for_streak(streak_duration)
            total_seconds += streak_duration
            streak_duration = curr.duration

    total_coins += _coins_for_streak(streak_duration)
    total_seconds += streak_duration

    return CoinsResult(coins=round(total_coins, 4), productive_seconds=total_seconds)


def compute_balance(
    sessions: list[StoredSession],
    owned_pets: list[OwnedPet],
    owned_decors: list[OwnedDecor],
    island_spent: float = 0.0,
) -> BalanceResult:
    """Compute the full coin balance for a user.

    balance = earned_productivity + earned_pets + earned_decors
              - spent_pets - spent_decors - island_spent

    Pet and decor income only accrues from productive sessions that started
    AFTER the item was purchased (no retroactive income).
    """
    productivity = compute_coins(sessions)

    productive_sessions = sorted(
        (s for s in sessions if s.category == "productive"),
        key=lambda s: s.started_at,
    )

    earned_pets, spent_pets, pet_income = _item_income(productive_sessions, owned_pets, find_animal)
    earned_decors, spent_decors, decor_income = _item_income(productive_sessions, owned_decors, find_decor)

    balance = round(
        productivity.coins + earned_pets + earned_decors - spent_pets - spent_decors - island_spent,
        4,
    )

    return BalanceResult(
        balance=balance,
        earned_productivity=productivity.coins,
        earned_pets=round(earned_pets, 4),
        earned_decors=round(earned_decors, 4),
        spent_pets=spent_pets,
        spent_decors=spent_decors,
        spent_island=island_spent,
        productive_seconds=productivity.productive_seconds,
        income_per_sec=pet_income + decor_income,
        pets=[p.animal_id for p in owned_pets],
        decors=[d.decor_id for d in owned_decors],
    )


def _item_income(productive_sessions, owned_items, find_fn):
    """Compute (earned, spent, rate) for a list of purchased items (pets or decors)."""
    earned = 0.0
    spent = 0.0
    rate = 0.0
    for item in owned_items:
        catalog_entry = find_fn(item.animal_id if hasattr(item, "animal_id") else item.decor_id)
        if not catalog_entry:
            continue
        seconds = sum(
            s.duration for s in productive_sessions
            if s.started_at >= item.bought_at
        )
        earned += seconds * catalog_entry.income_per_sec
        spent += item.cost
        rate += catalog_entry.income_per_sec
    return earned, spent, rate


def _coins_for_streak(seconds: int) -> float:
    coins = 0.0
    remaining = seconds
    milestone = 0
    while remaining > 0:
        segment = min(STREAK_MILESTONE, remaining)
        coins += segment * (COIN_RATE_BASE + COIN_RATE_STEP * milestone)
        remaining -= segment
        milestone += 1
    return coins
