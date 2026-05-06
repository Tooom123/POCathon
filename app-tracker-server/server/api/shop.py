import sqlite3
from datetime import datetime, timezone

from fastapi import APIRouter, Depends, HTTPException, Request

from server.api.auth import require_linked_token
from server.coins.calculator import compute_balance
from server.coins.catalog import CATALOG, find_animal
from server.coins.decor_catalog import CATALOG as DECOR_CATALOG
from server.coins.decor_catalog import find_decor
from server.coins.island import get_island_info
from server.models.schemas import BuyResponse, ShopAnimal, ShopDecor
from server.storage.decors_repository import add_decor, get_owned_decors
from server.storage.island_repository import get_island_record
from server.storage.pets_repository import add_pet, get_owned_pets, owns_pet
from server.storage.repository import fetch_sessions_for_user
from server.storage.token_repository import AuthToken

router = APIRouter(prefix="/shop", tags=["shop"])


def _conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def _load_context(conn: sqlite3.Connection, user_id: str):
    """Return (sessions, pets, decors, balance_result, island_info)."""
    sessions = fetch_sessions_for_user(conn, user_id)
    pets = get_owned_pets(conn, user_id)
    decors = get_owned_decors(conn, user_id)
    island = get_island_record(conn, user_id)
    balance_result = compute_balance(
        sessions, pets, decors, island_spent=island.spent_on_upgrades
    )
    island_info = get_island_info(island.level)
    return sessions, pets, decors, balance_result, island_info


@router.get("/animals", response_model=list[ShopAnimal])
def list_animals(
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> list[ShopAnimal]:
    """Return the full animal catalog with per-user ownership and affordability context."""
    conn = _conn(request)
    _, pets, decors, balance_result, island_info = _load_context(conn, token.user_id)
    owned_ids = {p.animal_id for p in pets}
    island_full = len(pets) >= island_info.capacity

    return [
        ShopAnimal(
            id=a.id,
            name=a.name,
            emoji=a.emoji,
            cost=a.cost,
            income_per_sec=a.income_per_sec,
            rarity=a.rarity,
            unlock_seconds=a.unlock_seconds,
            owned=a.id in owned_ids,
            unlocked=balance_result.productive_seconds >= a.unlock_seconds,
            can_afford=(
                balance_result.balance >= a.cost
                and a.id not in owned_ids
                and not island_full
            ),
        )
        for a in CATALOG
    ]


@router.post("/animals/{animal_id}/buy", response_model=BuyResponse)
def buy_animal(
    animal_id: str,
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> BuyResponse:
    """Purchase a pet animal. Deducts its cost from the user's coin balance."""
    conn = _conn(request)

    animal = find_animal(animal_id)
    if not animal:
        raise HTTPException(status_code=404, detail=f"Unknown animal: {animal_id}")

    if owns_pet(conn, token.user_id, animal_id):
        raise HTTPException(status_code=409, detail="You already own this pet")

    sessions, pets, decors, balance_result, island_info = _load_context(conn, token.user_id)

    if len(pets) >= island_info.capacity:
        raise HTTPException(
            status_code=403,
            detail=f"Island is full (capacity {island_info.capacity}) — upgrade your island to add more pets",
        )

    if balance_result.productive_seconds < animal.unlock_seconds:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Not enough productive time to unlock {animal.name}: "
                f"need {animal.unlock_seconds}s, have {balance_result.productive_seconds}s"
            ),
        )

    if balance_result.balance < animal.cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient balance: need {animal.cost} coins, have {balance_result.balance}",
        )

    bought_at = datetime.now(timezone.utc).replace(tzinfo=None)
    add_pet(conn, token.user_id, animal_id, animal.cost, bought_at)

    pets_after = get_owned_pets(conn, token.user_id)
    island = get_island_record(conn, token.user_id)
    new_balance = compute_balance(sessions, pets_after, decors, island_spent=island.spent_on_upgrades).balance
    return BuyResponse(animal_id=animal_id, balance=new_balance)


# ── Decors ────────────────────────────────────────────────────────────────────

@router.get("/decors", response_model=list[ShopDecor])
def list_decors(
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> list[ShopDecor]:
    """Return the decor catalog with per-user count and affordability context.

    Unlike pets, each decor type can be purchased multiple times.
    can_buy is False when balance is insufficient or the decor slot cap is reached.
    """
    conn = _conn(request)
    _, _, decors, balance_result, island_info = _load_context(conn, token.user_id)
    decor_full = len(decors) >= island_info.decor_capacity
    from collections import Counter
    counts = Counter(d.decor_id for d in decors)

    return [
        ShopDecor(
            id=d.id,
            name=d.name,
            emoji=d.emoji,
            cost=d.cost,
            income_per_sec=d.income_per_sec,
            unlock_seconds=d.unlock_seconds,
            count=counts.get(d.id, 0),
            unlocked=balance_result.productive_seconds >= d.unlock_seconds,
            can_buy=(
                balance_result.balance >= d.cost
                and not decor_full
                and balance_result.productive_seconds >= d.unlock_seconds
            ),
        )
        for d in DECOR_CATALOG
    ]


@router.post("/decors/{decor_id}/buy", response_model=BuyResponse)
def buy_decor(
    decor_id: str,
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> BuyResponse:
    """Purchase a decor item. Multiple copies of the same decor are allowed."""
    conn = _conn(request)

    decor = find_decor(decor_id)
    if not decor:
        raise HTTPException(status_code=404, detail=f"Unknown decor: {decor_id}")

    sessions, pets, decors, balance_result, island_info = _load_context(conn, token.user_id)

    if len(decors) >= island_info.decor_capacity:
        raise HTTPException(
            status_code=403,
            detail=f"Decor slots full (capacity {island_info.decor_capacity}) — upgrade your island to add more decors",
        )

    if balance_result.productive_seconds < decor.unlock_seconds:
        raise HTTPException(
            status_code=403,
            detail=(
                f"Not enough productive time to unlock {decor.name}: "
                f"need {decor.unlock_seconds}s, have {balance_result.productive_seconds}s"
            ),
        )

    if balance_result.balance < decor.cost:
        raise HTTPException(
            status_code=402,
            detail=f"Insufficient balance: need {decor.cost} coins, have {balance_result.balance}",
        )

    bought_at = datetime.now(timezone.utc).replace(tzinfo=None)
    add_decor(conn, token.user_id, decor_id, decor.cost, bought_at)

    decors_after = get_owned_decors(conn, token.user_id)
    island = get_island_record(conn, token.user_id)
    new_balance = compute_balance(sessions, pets, decors_after, island_spent=island.spent_on_upgrades).balance
    return BuyResponse(animal_id=decor_id, balance=new_balance)
