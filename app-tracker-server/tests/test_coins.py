import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.coins.calculator import (
    COIN_RATE_BASE,
    COIN_RATE_STEP,
    STREAK_GAP_TOLERANCE,
    STREAK_MILESTONE,
    compute_balance,
    compute_coins,
)
from server.main import app
from server.storage.db import _migrate
from server.storage.pets_repository import OwnedPet
from server.storage.repository import StoredSession, upsert_session
from server.storage.token_repository import create_token, link_token

USER_ID = "12345678-1234-5678-1234-567812345678"
T0 = datetime(2026, 5, 6, 10, 0, 0)  # fixed anchor — no timezone noise


# ── helpers ──────────────────────────────────────────────────────────────────

def _session(
    start: datetime,
    duration: int,
    category: str = "productive",
    app: str = "Code",
) -> StoredSession:
    return StoredSession(
        user_id=USER_ID,
        app=app,
        category=category,
        started_at=start,
        ended_at=start + timedelta(seconds=duration),
        duration=duration,
        received_at=start,
    )


def _sessions(*specs: tuple[datetime, int, str]) -> list[StoredSession]:
    """Build sessions from (start, duration, category) tuples."""
    return [_session(s, d, c) for s, d, c in specs]


# ── unit: calculator ─────────────────────────────────────────────────────────

def test_no_sessions_zero_coins():
    result = compute_coins([])
    assert result.coins == 0.0
    assert result.productive_seconds == 0


def test_non_productive_sessions_earn_nothing():
    sessions = _sessions(
        (T0, 600, "distraction"),
        (T0 + timedelta(seconds=600), 300, "neutral"),
    )
    result = compute_coins(sessions)
    assert result.coins == 0.0
    assert result.productive_seconds == 0


def test_short_session_base_rate():
    """Under 10 minutes → flat 0.2 coins/sec."""
    sessions = [_session(T0, 300)]  # 5 minutes
    result = compute_coins(sessions)
    assert result.coins == 300 * COIN_RATE_BASE
    assert result.productive_seconds == 300


def test_exactly_one_milestone():
    """Exactly 10 productive minutes → first 600s at 0.2/s, no bonus yet."""
    sessions = [_session(T0, STREAK_MILESTONE)]
    result = compute_coins(sessions)
    assert result.coins == STREAK_MILESTONE * COIN_RATE_BASE


def test_bonus_kicks_in_after_first_milestone():
    """10 min base + 5 min at elevated rate."""
    # 600s at 0.2 + 300s at 0.4
    sessions = [_session(T0, 900)]
    result = compute_coins(sessions)
    expected = 600 * 0.2 + 300 * 0.4
    assert abs(result.coins - expected) < 1e-9
    assert result.productive_seconds == 900


def test_three_milestones():
    """30 continuous productive minutes → three rate tiers."""
    sessions = [_session(T0, 1800)]
    result = compute_coins(sessions)
    # 600s@0.2 + 600s@0.4 + 600s@0.6
    expected = 600 * 0.2 + 600 * 0.4 + 600 * 0.6
    assert abs(result.coins - expected) < 1e-9


def test_only_productive_sessions_counted():
    """Mix of categories — only productive contribute."""
    sessions = _sessions(
        (T0, 300, "productive"),
        (T0 + timedelta(seconds=300), 300, "distraction"),
        (T0 + timedelta(seconds=600), 300, "neutral"),
    )
    result = compute_coins(sessions)
    assert result.coins == 300 * COIN_RATE_BASE
    assert result.productive_seconds == 300


# ── streak grouping ───────────────────────────────────────────────────────────

def test_small_gap_keeps_streak():
    """Gap ≤ tolerance → same streak, rate accumulates across sessions."""
    # Two 5-min sessions with a 10-second gap → 10-min streak total
    s1 = _session(T0, 300)
    s2 = _session(T0 + timedelta(seconds=310), 300)  # 10s gap
    result = compute_coins([s1, s2])
    # 600s total continuous → 600s@0.2
    expected = 600 * COIN_RATE_BASE
    assert abs(result.coins - expected) < 1e-9
    assert result.productive_seconds == 600


def test_large_gap_resets_streak():
    """Gap > tolerance → two separate streaks; second starts at base rate again."""
    s1 = _session(T0, STREAK_MILESTONE + 300)          # 15-min streak 1
    gap = STREAK_GAP_TOLERANCE + 60                     # 90-second gap
    s2 = _session(T0 + timedelta(seconds=STREAK_MILESTONE + 300 + gap), 300)  # 5-min streak 2
    result = compute_coins([s1, s2])
    # streak1: 600s@0.2 + 300s@0.4
    # streak2: 300s@0.2 (reset)
    expected = (600 * 0.2 + 300 * 0.4) + 300 * 0.2
    assert abs(result.coins - expected) < 1e-9


def test_gap_exactly_at_tolerance_keeps_streak():
    s1 = _session(T0, 300)
    s2 = _session(T0 + timedelta(seconds=300 + STREAK_GAP_TOLERANCE), 300)
    result = compute_coins([s1, s2])
    assert result.productive_seconds == 600


def test_gap_one_second_over_tolerance_breaks_streak():
    s1 = _session(T0, 300)
    s2 = _session(T0 + timedelta(seconds=300 + STREAK_GAP_TOLERANCE + 1), 300)
    result = compute_coins([s1, s2])
    # Two separate 5-min streaks, each at base rate
    expected = 2 * 300 * COIN_RATE_BASE
    assert abs(result.coins - expected) < 1e-9


def test_multiple_streaks_independent():
    """Three streaks with large gaps — each starts from base rate."""
    sessions = []
    offset = 0
    for _ in range(3):
        sessions.append(_session(T0 + timedelta(seconds=offset), STREAK_MILESTONE))
        offset += STREAK_MILESTONE + STREAK_GAP_TOLERANCE + 60
    result = compute_coins(sessions)
    # Each streak is exactly 10 min → 600s@0.2
    expected = 3 * STREAK_MILESTONE * COIN_RATE_BASE
    assert abs(result.coins - expected) < 1e-9


def test_coins_rounded_to_four_decimals():
    sessions = [_session(T0, 1)]  # 1 second → 0.2 coins exactly
    result = compute_coins(sessions)
    assert result.coins == 0.2


# ── compute_balance: pet income ───────────────────────────────────────────────

def _owned_pet(animal_id: str, bought_at: datetime, cost: float = 0.0) -> OwnedPet:
    return OwnedPet(id=1, user_id=USER_ID, animal_id=animal_id, cost=cost, bought_at=bought_at)


def test_balance_no_pets_equals_productivity():
    sessions = [_session(T0, 300)]
    result = compute_balance(sessions, [], [])
    assert result.balance == 300 * COIN_RATE_BASE
    assert result.earned_pets == 0.0
    assert result.earned_decors == 0.0
    assert result.spent_pets == 0.0
    assert result.spent_decors == 0.0
    assert result.spent_island == 0.0
    assert result.income_per_sec == 0.0
    assert result.pets == []
    assert result.decors == []


def test_balance_pet_earns_after_purchase():
    """Chick (0.5/s) bought at T0, 300 productive seconds after → +150 pet income."""
    sessions = [_session(T0 + timedelta(seconds=1), 300)]
    pet = _owned_pet("chick", bought_at=T0, cost=30.0)  # chick: 0.5/s, costs 30
    result = compute_balance(sessions, [pet], [])
    expected_productivity = 300 * COIN_RATE_BASE
    expected_pet = 300 * 0.5
    assert abs(result.earned_pets - expected_pet) < 1e-9
    assert abs(result.balance - (expected_productivity + expected_pet - 30.0)) < 1e-9


def test_balance_pet_earns_nothing_before_purchase():
    """Sessions that started BEFORE the pet was bought must not contribute pet income."""
    sessions = [_session(T0, 300)]
    pet = _owned_pet("chick", bought_at=T0 + timedelta(seconds=400))  # bought after sessions end
    result = compute_balance(sessions, [pet], [])
    assert result.earned_pets == 0.0


def test_balance_pet_income_partial_after_purchase():
    """Only sessions starting at or after bought_at contribute."""
    s_before = _session(T0, 300)                                    # before purchase
    s_after = _session(T0 + timedelta(seconds=600), 300)            # after purchase
    bought_at = T0 + timedelta(seconds=500)
    pet = _owned_pet("chick", bought_at=bought_at)                  # 0.5/s
    result = compute_balance([s_before, s_after], [pet], [])
    assert abs(result.earned_pets - 300 * 0.5) < 1e-9


def test_balance_income_per_sec_sums_all_owned_pets():
    """income_per_sec is the sum of all owned animals' rates."""
    pets = [
        _owned_pet("chick", T0),   # 0.5/s
        _owned_pet("bunny", T0),   # 1.0/s
    ]
    result = compute_balance([], pets, [])
    assert abs(result.income_per_sec - 1.5) < 1e-9


def test_balance_spent_is_sum_of_costs():
    pets = [_owned_pet("chick", T0, cost=30.0), _owned_pet("bunny", T0, cost=80.0)]
    result = compute_balance([], pets, [])
    assert result.spent_pets == 110.0


def test_balance_unknown_pet_id_is_skipped():
    """A pet with an id not in the catalog must not crash the calculation."""
    pet = _owned_pet("unknown_creature", T0, cost=999.0)
    result = compute_balance([], [pet], [])
    assert result.earned_pets == 0.0
    assert result.income_per_sec == 0.0


# ── API: GET /user/coins ──────────────────────────────────────────────────────

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
    """Create a linked token and return the Bearer string."""
    token = client.post("/auth/token").json()["token"]
    client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    return token


def test_coins_endpoint_requires_auth(client):
    resp = client.get("/user/coins")
    assert resp.status_code == 401


def test_coins_endpoint_rejects_unlinked_token(client):
    token = client.post("/auth/token").json()["token"]
    resp = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_coins_zero_when_no_sessions(client):
    token = _linked_bearer(client)
    resp = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    body = resp.json()
    assert body["coins"] == 0.0
    assert body["productive_seconds"] == 0
    assert body["user_id"] == USER_ID


def test_coins_only_counts_current_user(client, db):
    """Sessions belonging to a different user_id must not affect the balance."""
    token = _linked_bearer(client)

    # Insert a productive session for a *different* user
    other = _session(T0, 600, "productive")
    other_stored = StoredSession(
        user_id="other-user-id",
        app=other.app,
        category=other.category,
        started_at=other.started_at,
        ended_at=other.ended_at,
        duration=other.duration,
        received_at=other.started_at,
    )
    upsert_session(db, other_stored)

    resp = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["coins"] == 0.0


def test_coins_response_shape(client):
    token = _linked_bearer(client)
    body = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"}).json()
    assert set(body.keys()) >= {"user_id", "coins", "productive_seconds", "income_per_sec"}


def test_coins_income_per_sec_zero_without_pets(client):
    token = _linked_bearer(client)
    body = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["income_per_sec"] == 0.0


def test_coins_reflects_productive_sessions(client, db):
    token = _linked_bearer(client)

    # Insert 5 minutes of productive time for the linked user
    upsert_session(db, StoredSession(
        user_id=USER_ID, app="Code", category="productive",
        started_at=T0, ended_at=T0 + timedelta(seconds=300),
        duration=300, received_at=T0,
    ))

    resp = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"})
    body = resp.json()
    assert body["productive_seconds"] == 300
    assert abs(body["coins"] - 300 * COIN_RATE_BASE) < 1e-6


def test_coins_with_streak_bonus(client, db):
    """15-min session through the first milestone → bonus rate for last 5 min."""
    token = _linked_bearer(client)

    upsert_session(db, StoredSession(
        user_id=USER_ID, app="Code", category="productive",
        started_at=T0, ended_at=T0 + timedelta(seconds=900),
        duration=900, received_at=T0,
    ))

    resp = client.get("/user/coins", headers={"Authorization": f"Bearer {token}"})
    expected = 600 * 0.2 + 300 * 0.4
    assert abs(resp.json()["coins"] - expected) < 1e-6


# ── API: GET /user/profile ────────────────────────────────────────────────────

def test_profile_requires_auth(client):
    assert client.get("/user/profile").status_code == 401


def test_profile_shape(client):
    token = _linked_bearer(client)
    body = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert set(body.keys()) >= {
        "user_id", "balance", "earned_productivity", "earned_pets", "earned_decors",
        "spent_pets", "spent_decors", "spent_island", "productive_seconds", "income_per_sec",
        "pets", "decors", "island_level", "island_capacity", "island_decor_capacity",
        "island_upgrade_cost",
    }


def test_profile_empty_state(client):
    token = _linked_bearer(client)
    body = client.get("/user/profile", headers={"Authorization": f"Bearer {token}"}).json()
    assert body["balance"] == 0.0
    assert body["pets"] == []
    assert body["decors"] == []
    assert body["income_per_sec"] == 0.0
    assert body["spent_pets"] == 0.0
    assert body["spent_decors"] == 0.0
    assert body["spent_island"] == 0.0
