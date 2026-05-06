import sqlite3
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from server.coins.island import ISLAND_LEVELS, MAX_ISLAND_LEVEL, get_island_info
from server.main import app
from server.storage.db import _migrate
from server.storage.island_repository import get_island_record, set_island_level
from server.storage.pets_repository import add_pet
from server.storage.repository import StoredSession, upsert_session

USER_ID = "12345678-1234-5678-1234-567812345678"
T0 = datetime(2026, 5, 6, 10, 0, 0)


@pytest.fixture(autouse=True)
def _inject_db():
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    _migrate(conn)
    app.state.db = conn
    yield
    conn.close()


@pytest.fixture()
def client():
    return TestClient(app)


@pytest.fixture()
def db():
    return app.state.db


def _linked_bearer(client) -> str:
    token = client.post("/auth/token").json()["token"]
    client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    return token


def _add_productive_seconds(db, seconds: int, start: datetime = T0) -> None:
    upsert_session(db, StoredSession(
        user_id=USER_ID, app="Code", category="productive",
        started_at=start, ended_at=start + timedelta(seconds=seconds),
        duration=seconds, received_at=start,
    ))


def _give_balance(db, coins: float) -> None:
    """Add enough productive seconds to give approximately `coins` balance (0.2/s base)."""
    seconds = int(coins / 0.2) + 1
    _add_productive_seconds(db, seconds)


# ── unit: island catalog ──────────────────────────────────────────────────────

def test_level_1_capacity():
    assert get_island_info(1).capacity == 4


def test_level_6_capacity():
    assert get_island_info(6).capacity == 25


def test_level_6_no_upgrade_cost():
    assert get_island_info(6).upgrade_cost is None


def test_level_below_1_clamped():
    assert get_island_info(0).level == 1


def test_level_above_max_clamped():
    assert get_island_info(99).level == MAX_ISLAND_LEVEL


def test_all_levels_have_increasing_capacity():
    capacities = [get_island_info(i).capacity for i in range(1, MAX_ISLAND_LEVEL + 1)]
    assert capacities == sorted(capacities)


def test_upgrade_costs_are_increasing():
    costs = [
        get_island_info(i).upgrade_cost
        for i in range(1, MAX_ISLAND_LEVEL)  # exclude max
    ]
    assert costs == sorted(costs)


# ── unit: island repository ───────────────────────────────────────────────────

def test_get_island_record_default(db):
    record = get_island_record(db, USER_ID)
    assert record.level == 1
    assert record.spent_on_upgrades == 0.0


def test_set_island_level_upserts(db):
    set_island_level(db, USER_ID, new_level=2, additional_cost=500)
    record = get_island_record(db, USER_ID)
    assert record.level == 2
    assert record.spent_on_upgrades == 500.0


def test_set_island_level_accumulates_cost(db):
    set_island_level(db, USER_ID, new_level=2, additional_cost=500)
    set_island_level(db, USER_ID, new_level=3, additional_cost=3000)
    record = get_island_record(db, USER_ID)
    assert record.level == 3
    assert record.spent_on_upgrades == 3500.0


# ── API: GET /user/island ─────────────────────────────────────────────────────

def test_get_island_requires_auth(client):
    assert client.get("/user/island").status_code == 401


def test_get_island_default_level_1(client):
    token = _linked_bearer(client)
    body = client.get("/user/island", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["level"] == 1
    assert body["capacity"] == 4
    assert body["decor_capacity"] == 2
    assert body["upgrade_cost"] == 500.0
    assert body["pets_count"] == 0
    assert body["decors_count"] == 0


def test_get_island_shape(client):
    token = _linked_bearer(client)
    body = client.get("/user/island", headers={"Authorization": f"Bearer {token}"}).json()
    assert set(body.keys()) >= {
        "level", "capacity", "decor_capacity", "upgrade_cost",
        "pets_count", "decors_count", "balance",
    }


# ── API: POST /user/island/upgrade ────────────────────────────────────────────

def test_upgrade_requires_auth(client):
    assert client.post("/user/island/upgrade").status_code == 401


def test_upgrade_without_funds_returns_402(client):
    token = _linked_bearer(client)
    resp = client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 402


def test_upgrade_success(client, db):
    token = _linked_bearer(client)
    _give_balance(db, 600)  # level 1 upgrade costs 500
    resp = client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["level"] == 2
    assert body["capacity"] == 6


def test_upgrade_deducts_from_balance(client, db):
    token = _linked_bearer(client)
    _give_balance(db, 600)
    before = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"}).json()["coins"]
    client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    after = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"}).json()["coins"]
    assert abs((before - after) - 500.0) < 1.0   # 500 deducted (tolerance for base-rate rounding)


def test_upgrade_response_shape(client, db):
    token = _linked_bearer(client)
    _give_balance(db, 600)
    body = client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"}).json()
    assert set(body.keys()) >= {"level", "capacity", "upgrade_cost", "balance"}


def test_upgrade_increments_by_one(client, db):
    token = _linked_bearer(client)
    _give_balance(db, 600)
    resp = client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["level"] == 2


def test_upgrade_at_max_level_returns_403(client, db):
    token = _linked_bearer(client)
    set_island_level(db, USER_ID, MAX_ISLAND_LEVEL, additional_cost=0)
    resp = client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "max" in resp.json()["detail"].lower()


def test_upgrade_updates_island_endpoint(client, db):
    token = _linked_bearer(client)
    _give_balance(db, 600)
    client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    island = client.get("/user/island", headers={"Authorization": f"Bearer {token}"}).json()
    assert island["level"] == 2
    assert island["capacity"] == 6


def test_upgrade_appears_in_profile(client, db):
    token = _linked_bearer(client)
    _give_balance(db, 600)
    client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    profile = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert profile["island_level"] == 2
    assert profile["spent_island"] == 500.0


# ── island capacity caps pet purchases ───────────────────────────────────────

def test_buy_blocked_when_island_full(client, db):
    """Level-1 island holds 4 pets; trying to buy a 5th must return 403."""
    token = _linked_bearer(client)
    _give_balance(db, 10_000)
    # Add 4 pets directly via repository to fill the island
    for animal_id in ["chick", "bunny", "pig", "cat"]:
        add_pet(db, USER_ID, animal_id, 0, T0)
    resp = client.post("/shop/animals/dog/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "full" in resp.json()["detail"].lower()


def test_upgrade_then_buy_succeeds(client, db):
    """After upgrading island, the 5th pet slot opens up."""
    token = _linked_bearer(client)
    _give_balance(db, 10_000)
    for animal_id in ["chick", "bunny", "pig", "cat"]:
        add_pet(db, USER_ID, animal_id, 0, T0)
    # Upgrade island (level 1→2, capacity 4→6, cost 500)
    client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    # Now buy 5th pet (dog: cost 900, unlock 480s — need enough productive time)
    _add_productive_seconds(db, 600, start=T0 + timedelta(seconds=1))
    resp = client.post("/shop/animals/dog/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_shop_can_afford_false_when_island_full(client, db):
    """can_afford is False for all unowned animals when island is at capacity."""
    token = _linked_bearer(client)
    _give_balance(db, 10_000)
    for animal_id in ["chick", "bunny", "pig", "cat"]:
        add_pet(db, USER_ID, animal_id, 0, T0)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    unowned_affordable = [a for a in animals if not a["owned"] and a["can_afford"]]
    assert unowned_affordable == []


def test_profile_includes_island_fields(client):
    token = _linked_bearer(client)
    body = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["island_level"] == 1
    assert body["island_capacity"] == 4
    assert body["island_decor_capacity"] == 2
    assert body["island_upgrade_cost"] == 500.0
