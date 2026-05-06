import asyncio
import json
import sqlite3

from fastapi import APIRouter, Depends, HTTPException, Query, Request
from fastapi.responses import StreamingResponse

from server.api.auth import require_linked_token
from server.auth.service import token_is_usable
from server.coins.calculator import compute_balance
from server.coins.island import MAX_ISLAND_LEVEL, get_island_info
from server.models.schemas import (
    CoinsBalance,
    IslandInfo,
    IslandUpgradeResponse,
    UserProfile,
)
from server.storage.decors_repository import get_owned_decors
from server.storage.island_repository import get_island_record, set_island_level
from server.storage.pets_repository import get_owned_pets
from server.storage.repository import fetch_sessions_for_user
from server.storage.token_repository import AuthToken, get_token

router = APIRouter(prefix="/user", tags=["user"])

SSE_INTERVAL = 3.0  # seconds between profile pushes


def _conn(request: Request) -> sqlite3.Connection:
    return request.app.state.db


def _require_token_flexible(
    request: Request,
    t: str | None = Query(default=None, alias="token"),
) -> AuthToken:
    """Accept token from query param (EventSource) or Authorization header (fetch)."""
    conn = request.app.state.db
    raw = t or request.headers.get("Authorization", "").removeprefix("Bearer ").strip()
    if not raw:
        raise HTTPException(status_code=401, detail="Missing token")
    record = get_token(conn, raw)
    if not token_is_usable(record):
        raise HTTPException(status_code=403, detail="Token invalid or expired")
    return record


def _build_balance(conn: sqlite3.Connection, user_id: str):
    """Fetch all data needed for a balance computation and return (result, island_record)."""
    sessions = fetch_sessions_for_user(conn, user_id)
    pets = get_owned_pets(conn, user_id)
    decors = get_owned_decors(conn, user_id)
    island = get_island_record(conn, user_id)
    result = compute_balance(sessions, pets, decors, island_spent=island.spent_on_upgrades)
    return result, island


@router.get("/coins", response_model=CoinsBalance)
def get_coins_balance(
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> CoinsBalance:
    """Return the authenticated user's true coin balance (productivity + pets − spent)."""
    result, _ = _build_balance(_conn(request), token.user_id)
    return CoinsBalance(
        user_id=token.user_id,
        coins=result.balance,
        productive_seconds=result.productive_seconds,
        income_per_sec=result.income_per_sec,
    )


@router.get("/profile", response_model=UserProfile)
def get_profile(
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> UserProfile:
    """Return the full profile: balance breakdown, income rate, owned pets, and island state."""
    result, island = _build_balance(_conn(request), token.user_id)
    info = get_island_info(island.level)
    return UserProfile(
        user_id=token.user_id,
        balance=result.balance,
        earned_productivity=result.earned_productivity,
        earned_pets=result.earned_pets,
        earned_decors=result.earned_decors,
        spent_pets=result.spent_pets,
        spent_decors=result.spent_decors,
        spent_island=result.spent_island,
        productive_seconds=result.productive_seconds,
        income_per_sec=result.income_per_sec,
        pets=result.pets,
        decors=result.decors,
        island_level=island.level,
        island_capacity=info.capacity,
        island_decor_capacity=info.decor_capacity,
        island_upgrade_cost=info.upgrade_cost,
    )


@router.get("/island", response_model=IslandInfo)
def get_island(
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> IslandInfo:
    """Return the user's current island level, capacity, and upgrade cost."""
    conn = _conn(request)
    result, island = _build_balance(conn, token.user_id)
    info = get_island_info(island.level)
    return IslandInfo(
        level=island.level,
        capacity=info.capacity,
        decor_capacity=info.decor_capacity,
        upgrade_cost=info.upgrade_cost,
        pets_count=len(result.pets),
        decors_count=len(result.decors),
        balance=result.balance,
    )


@router.post("/island/upgrade", response_model=IslandUpgradeResponse)
def upgrade_island(
    request: Request,
    token: AuthToken = Depends(require_linked_token),
) -> IslandUpgradeResponse:
    """Upgrade the user's island to the next level. Deducts the upgrade cost from balance."""
    conn = _conn(request)
    result, island = _build_balance(conn, token.user_id)
    current_info = get_island_info(island.level)

    if current_info.upgrade_cost is None:
        raise HTTPException(status_code=403, detail="Island is already at max level")

    if result.balance < current_info.upgrade_cost:
        raise HTTPException(
            status_code=402,
            detail=(
                f"Insufficient balance: need {current_info.upgrade_cost} coins, "
                f"have {result.balance}"
            ),
        )

    new_level = island.level + 1
    set_island_level(conn, token.user_id, new_level, additional_cost=current_info.upgrade_cost)

    new_info = get_island_info(new_level)
    new_balance = round(result.balance - current_info.upgrade_cost, 4)

    return IslandUpgradeResponse(
        level=new_level,
        capacity=new_info.capacity,
        upgrade_cost=new_info.upgrade_cost,
        balance=new_balance,
    )


@router.get("/stream")
async def user_stream(
    request: Request,
    token: AuthToken = Depends(_require_token_flexible),
) -> StreamingResponse:
    """SSE stream — pushes the full user profile every {SSE_INTERVAL}s.

    Accepts the token as a query param (?token=...) because EventSource
    cannot set custom headers. Falls back to Authorization: Bearer header.
    """
    async def generate():
        while True:
            if await request.is_disconnected():
                return
            conn = request.app.state.db
            result, island = _build_balance(conn, token.user_id)
            info = get_island_info(island.level)
            payload = {
                "user_id": token.user_id,
                "balance": result.balance,
                "productive_seconds": result.productive_seconds,
                "income_per_sec": result.income_per_sec,
                "pets": result.pets,
                "decors": result.decors,
                "island_level": island.level,
                "island_capacity": info.capacity,
                "island_decor_capacity": info.decor_capacity,
                "island_upgrade_cost": info.upgrade_cost,
                # unused by initFromProfile but part of UserProfile shape
                "earned_productivity": result.earned_productivity,
                "earned_pets": result.earned_pets,
                "earned_decors": result.earned_decors,
                "spent_pets": result.spent_pets,
                "spent_decors": result.spent_decors,
                "spent_island": result.spent_island,
            }
            yield f"data: {json.dumps(payload)}\n\n"
            await asyncio.sleep(SSE_INTERVAL)

    return StreamingResponse(generate(), media_type="text/event-stream")
