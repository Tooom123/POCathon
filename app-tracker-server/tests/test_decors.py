import sqlite3
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from server.coins.decor_catalog import CATALOG as DECOR_CATALOG, find_decor
from server.main import app
from server.storage.db import _migrate
from server.storage.decors_repository import add_decor, get_owned_decors
from server.storage.island_repository import set_island_level
from server.storage.repository import StoredSession, upsert_session

USER_ID = "12345678-1234-5678-1234-567812345678"
T0 = datetime(2026, 5, 6, 10, 0, 0)

PLANT       = find_decor("plant")        # cost=50,   income=0.3,  unlock=0s
FLOWERS     = find_decor("flowers-tall") # cost=200,  income=1.5,  unlock=0s
MUSHROOMS   = find_decor("mushrooms")    # cost=500,  income=4.0,  unlock=60s
TREE_PINE   = find_decor("tree-pine")    # cost=1500, income=12.0, unlock=240s


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


# ── GET /shop/decors ──────────────────────────────────────────────────────────

def test_list_decors_requires_auth(client):
    assert client.get("/shop/decors").status_code == 401


def test_list_decors_returns_all_catalog(client):
    token = _linked_bearer(client)
    body = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    assert len(body) == len(DECOR_CATALOG)


def test_list_decors_shape(client):
    token = _linked_bearer(client)
    decor = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()[0]
    assert set(decor.keys()) >= {
        "id", "name", "emoji", "cost", "income_per_sec",
        "unlock_seconds", "count", "unlocked", "can_buy",
    }


def test_list_decors_count_zero_by_default(client):
    token = _linked_bearer(client)
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    assert all(d["count"] == 0 for d in decors)


def test_list_decors_unlocked_when_unlock_seconds_zero(client):
    token = _linked_bearer(client)
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    free = [d for d in decors if d["unlock_seconds"] == 0]
    assert all(d["unlocked"] for d in free)


def test_list_decors_locked_without_enough_productive_time(client, db):
    """Mushrooms require 60s; user with none should see it locked."""
    token = _linked_bearer(client)
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    mushrooms = next(d for d in decors if d["id"] == "mushrooms")
    assert not mushrooms["unlocked"]
    assert not mushrooms["can_buy"]


def test_list_decors_unlocked_after_enough_productive_time(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, MUSHROOMS.unlock_seconds)
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    mushrooms = next(d for d in decors if d["id"] == "mushrooms")
    assert mushrooms["unlocked"]


def test_list_decors_can_buy_true_with_enough_balance(client, db):
    token = _linked_bearer(client)
    # Plant costs 50; 0.2/s × 500s = 100 coins
    _add_productive_seconds(db, 500)
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    plant = next(d for d in decors if d["id"] == "plant")
    assert plant["can_buy"]


def test_list_decors_can_buy_false_without_balance(client):
    token = _linked_bearer(client)
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    plant = next(d for d in decors if d["id"] == "plant")
    assert not plant["can_buy"]


def test_list_decors_count_reflects_purchases(client, db):
    token = _linked_bearer(client)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0 + timedelta(seconds=1))
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    plant = next(d for d in decors if d["id"] == "plant")
    assert plant["count"] == 2


# ── POST /shop/decors/{id}/buy ────────────────────────────────────────────────

def test_buy_decor_requires_auth(client):
    assert client.post("/shop/decors/plant/buy").status_code == 401


def test_buy_decor_unknown_returns_404(client):
    token = _linked_bearer(client)
    resp = client.post("/shop/decors/nonexistent/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


def test_buy_decor_locked_returns_403(client, db):
    """Mushrooms need 60s productive time; buying without it → 403."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 30)  # < 60s required
    resp = client.post("/shop/decors/mushrooms/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "productive time" in resp.json()["detail"].lower()


def test_buy_decor_without_funds_returns_402(client):
    token = _linked_bearer(client)
    resp = client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 402
    assert "balance" in resp.json()["detail"].lower()


def test_buy_decor_success_returns_updated_balance(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 500)  # 500 × 0.2 = 100 coins; plant costs 50
    resp = client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["animal_id"] == "plant"
    assert abs(body["balance"] - (100.0 - PLANT.cost)) < 1e-6


def test_buy_decor_allows_multiple_copies(client, db):
    """Unlike pets, same decor can be purchased twice."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 1000)  # 200 coins; plant costs 50 each
    resp1 = client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    resp2 = client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp1.status_code == 200
    assert resp2.status_code == 200
    decors = get_owned_decors(db, USER_ID)
    assert len([d for d in decors if d.decor_id == "plant"]) == 2


def test_buy_decor_appears_in_profile(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 500)
    client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    profile = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert "plant" in profile["decors"]
    assert profile["income_per_sec"] == PLANT.income_per_sec


def test_buy_decor_response_shape(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 500)
    body = client.post(
        "/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert set(body.keys()) >= {"animal_id", "balance"}


def test_buy_decor_income_accrues_from_purchase_time(client, db):
    """Decor income only counts sessions started AFTER purchase."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 300, start=T0)  # 60 coins, enough for plant (50)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0 + timedelta(seconds=300))
    _add_productive_seconds(db, 300, start=T0 + timedelta(seconds=400))

    profile = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert abs(profile["earned_decors"] - 300 * PLANT.income_per_sec) < 1e-6


# ── Decor slot capacity ───────────────────────────────────────────────────────

def test_buy_decor_blocked_when_slots_full(client, db):
    """Level-1 island holds 2 decor slots; trying to buy a 3rd → 403."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 5000)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0 + timedelta(seconds=1))
    resp = client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "full" in resp.json()["detail"].lower()


def test_buy_decor_can_buy_false_when_slots_full(client, db):
    """can_buy is False for all decors when slot capacity is reached."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 5000)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0 + timedelta(seconds=1))
    decors = client.get("/shop/decors", headers={"Authorization": f"Bearer {token}"}).json()
    assert all(not d["can_buy"] for d in decors)


def test_buy_decor_after_island_upgrade_opens_new_slot(client, db):
    """After upgrading island (level 1→2, decor_capacity 2→4), a 3rd decor can be bought."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 20_000)  # enough for upgrade + decors
    add_decor(db, USER_ID, "plant", PLANT.cost, T0)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0 + timedelta(seconds=1))
    # Upgrade island (costs 500)
    client.post("/user/island/upgrade", headers={"Authorization": f"Bearer {token}"})
    # Now slot opens
    resp = client.post("/shop/decors/plant/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200


def test_island_decors_count_in_island_endpoint(client, db):
    token = _linked_bearer(client)
    add_decor(db, USER_ID, "plant", PLANT.cost, T0)
    body = client.get("/user/island", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["decors_count"] == 1
    assert body["decor_capacity"] == 2
