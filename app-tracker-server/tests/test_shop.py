import sqlite3
from datetime import datetime, timedelta

import pytest
from fastapi.testclient import TestClient

from server.coins.catalog import CATALOG, find_animal
from server.main import app
from server.storage.db import _migrate
from server.storage.pets_repository import add_pet
from server.storage.repository import StoredSession, upsert_session

USER_ID = "12345678-1234-5678-1234-567812345678"
T0 = datetime(2026, 5, 6, 10, 0, 0)

# A cheap animal with unlock_seconds = 0 (always available)
CHICK = find_animal("chick")    # cost=30, income=0.5, unlock=0
BUNNY = find_animal("bunny")    # cost=80, income=1.0, unlock=0
PIG   = find_animal("pig")      # cost=200, income=2.0, unlock=120s


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


# ── GET /shop/animals ─────────────────────────────────────────────────────────

def test_shop_requires_auth(client):
    assert client.get("/shop/animals").status_code == 401


def test_shop_returns_all_catalog_animals(client):
    token = _linked_bearer(client)
    body = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    assert len(body) == len(CATALOG)


def test_shop_animal_shape(client):
    token = _linked_bearer(client)
    animal = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()[0]
    assert set(animal.keys()) >= {
        "id", "name", "emoji", "cost", "income_per_sec",
        "rarity", "unlock_seconds", "owned", "unlocked", "can_afford",
    }


def test_shop_not_owned_by_default(client):
    token = _linked_bearer(client)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    assert all(not a["owned"] for a in animals)


def test_shop_unlocked_when_unlock_seconds_zero(client, db):
    """Animals with unlock_seconds=0 are always unlocked even without any productive time."""
    token = _linked_bearer(client)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    free_unlock = [a for a in animals if a["unlock_seconds"] == 0]
    assert all(a["unlocked"] for a in free_unlock)


def test_shop_locked_without_enough_productive_time(client, db):
    """Pig requires 120s of productive time; user with none should see it locked."""
    token = _linked_bearer(client)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    pig = next(a for a in animals if a["id"] == "pig")
    assert not pig["unlocked"]


def test_shop_unlocked_after_enough_productive_time(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, PIG.unlock_seconds)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    pig = next(a for a in animals if a["id"] == "pig")
    assert pig["unlocked"]


def test_shop_can_afford_with_enough_balance(client, db):
    token = _linked_bearer(client)
    # Chick costs 30; 0.2 coins/s × 300s = 60 coins → can afford
    _add_productive_seconds(db, 300)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    chick = next(a for a in animals if a["id"] == "chick")
    assert chick["can_afford"]


def test_shop_cannot_afford_without_balance(client):
    token = _linked_bearer(client)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    chick = next(a for a in animals if a["id"] == "chick")
    assert not chick["can_afford"]


def test_shop_owned_animal_cannot_be_afforded(client, db):
    """Once owned, can_afford is False regardless of balance (can't buy twice)."""
    token = _linked_bearer(client)
    _add_productive_seconds(db, 600)
    add_pet(db, USER_ID, "chick", CHICK.cost, T0)
    animals = client.get("/shop/animals", headers={"Authorization": f"Bearer {token}"}).json()
    chick = next(a for a in animals if a["id"] == "chick")
    assert chick["owned"]
    assert not chick["can_afford"]


# ── POST /shop/animals/{id}/buy ───────────────────────────────────────────────

def test_buy_requires_auth(client):
    assert client.post("/shop/animals/chick/buy").status_code == 401


def test_buy_unknown_animal_returns_404(client):
    token = _linked_bearer(client)
    resp = client.post("/shop/animals/dragon/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 404


def test_buy_locked_animal_returns_403(client, db):
    """Pig needs 120s of productive time; buying without it → 403."""
    token = _linked_bearer(client)
    # Give enough coins but not enough productive time
    _add_productive_seconds(db, 60)   # < 120s required
    # Manually top up the balance via a non-productive trick is not possible,
    # so just test that 60s < 120s fails
    resp = client.post("/shop/animals/pig/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403
    assert "productive time" in resp.json()["detail"].lower()


def test_buy_without_funds_returns_402(client):
    """Balance = 0, trying to buy chick (cost 30) → 402."""
    token = _linked_bearer(client)
    resp = client.post("/shop/animals/chick/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 402
    assert "balance" in resp.json()["detail"].lower()


def test_buy_already_owned_returns_409(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 600)
    add_pet(db, USER_ID, "chick", CHICK.cost, T0)
    resp = client.post("/shop/animals/chick/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 409


def test_buy_success_returns_updated_balance(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 600)  # 600s × 0.2 = 120 coins
    resp = client.post("/shop/animals/chick/buy", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["animal_id"] == "chick"
    # balance = 120 (earned) - 30 (cost) = 90 (no pet income yet since no sessions after purchase)
    assert abs(body["balance"] - (120.0 - CHICK.cost)) < 1e-6


def test_buy_pet_appears_in_profile(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 600)
    client.post("/shop/animals/chick/buy", headers={"Authorization": f"Bearer {token}"})
    profile = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert "chick" in profile["pets"]
    assert profile["income_per_sec"] == CHICK.income_per_sec


def test_buy_updates_income_per_sec(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 1000)

    client.post("/shop/animals/chick/buy", headers={"Authorization": f"Bearer {token}"})
    client.post("/shop/animals/bunny/buy", headers={"Authorization": f"Bearer {token}"})

    profile = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert abs(profile["income_per_sec"] - (CHICK.income_per_sec + BUNNY.income_per_sec)) < 1e-9


def test_buy_response_shape(client, db):
    token = _linked_bearer(client)
    _add_productive_seconds(db, 600)
    body = client.post(
        "/shop/animals/chick/buy", headers={"Authorization": f"Bearer {token}"}
    ).json()
    assert set(body.keys()) >= {"animal_id", "balance"}


def test_buy_pet_income_accrues_from_purchase_time(client, db):
    """Pet income should count sessions started AFTER purchase, not before."""
    token = _linked_bearer(client)

    # 300s productive before purchase → earns 60 coins, enough to buy chick (cost 30)
    _add_productive_seconds(db, 300, start=T0)
    # Force-set bought_at in the past so a future session earns pet income
    add_pet(db, USER_ID, "chick", CHICK.cost, T0 + timedelta(seconds=300))

    # 300s productive after purchase
    _add_productive_seconds(db, 300, start=T0 + timedelta(seconds=400))

    profile = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    # earned_pets should be 300 * 0.5 = 150 (only the post-purchase session)
    assert abs(profile["earned_pets"] - 300 * CHICK.income_per_sec) < 1e-6
