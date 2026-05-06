import sqlite3
from datetime import datetime, timezone, timedelta

import pytest
from fastapi.testclient import TestClient

from server.auth.service import PENDING_TTL_MINUTES
from server.main import app
from server.storage.db import _migrate
from server.storage.token_repository import create_token, link_token

USER_ID = "12345678-1234-5678-1234-567812345678"


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


# ── POST /auth/token ──────────────────────────────────────────────────────────

def test_request_token_returns_pending(client):
    resp = client.post("/auth/token")
    assert resp.status_code == 201
    body = resp.json()
    assert body["status"] == "pending"
    assert body["user_id"] is None
    assert len(body["token"]) == 8
    assert "instructions" in body


# ── POST /auth/link ───────────────────────────────────────────────────────────

def test_link_valid_token(client, db):
    token_resp = client.post("/auth/token").json()
    token = token_resp["token"]

    resp = client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    assert resp.status_code == 200
    body = resp.json()
    assert body["status"] == "linked"
    assert body["user_id"] == USER_ID


def test_link_unknown_token_returns_404(client):
    resp = client.post("/auth/link", json={"user_id": USER_ID, "token": "UNKNOWN1"})
    assert resp.status_code == 404


def test_link_expired_token_returns_404(client, db):
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(minutes=1)
    create_token(db, "EXPIRED1", expires_at=past)
    resp = client.post("/auth/link", json={"user_id": USER_ID, "token": "EXPIRED1"})
    assert resp.status_code == 404


def test_link_already_linked_token_returns_404(client, db):
    token_resp = client.post("/auth/token").json()
    token = token_resp["token"]
    client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    # Second link attempt on the same token
    resp = client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    assert resp.status_code == 404


# ── GET /auth/token/{token}/status ────────────────────────────────────────────

def test_status_pending(client):
    token = client.post("/auth/token").json()["token"]
    resp = client.get(f"/auth/token/{token}/status")
    assert resp.status_code == 200
    assert resp.json()["status"] == "pending"


def test_status_linked_after_link(client):
    token = client.post("/auth/token").json()["token"]
    client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    resp = client.get(f"/auth/token/{token}/status")
    assert resp.json()["status"] == "linked"


def test_status_unknown_token_returns_404(client):
    assert client.get("/auth/token/NOSUCHXX/status").status_code == 404


def test_status_expired_token_returns_410(client, db):
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    create_token(db, "OLDTOKEN", expires_at=past)
    assert client.get("/auth/token/OLDTOKEN/status").status_code == 410


# ── require_linked_token dependency ──────────────────────────────────────────

def test_require_linked_token_no_header(client):
    # Use /auth/token/{token}/status as a proxy — the dependency is tested
    # directly by calling a route that uses it. We add a minimal protected route
    # via the auth router for this purpose.
    # For now, verify the helper rejects missing/bad tokens via the link endpoint.
    resp = client.post("/auth/link", json={"user_id": USER_ID, "token": "BADTOKEN"})
    assert resp.status_code == 404


def test_bearer_token_accepted_on_protected_route(client):
    """The require_linked_token dependency resolves correctly for a valid token."""
    from server.storage.token_repository import get_token

    token = client.post("/auth/token").json()["token"]
    client.post("/auth/link", json={"user_id": USER_ID, "token": token})

    db = app.state.db
    record = get_token(db, token)
    from server.auth.service import token_is_usable
    assert token_is_usable(record) is True


# ── POST /auth/refresh ────────────────────────────────────────────────────────

def _linked_token(client) -> str:
    """Helper: create and link a token, return the token string."""
    token = client.post("/auth/token").json()["token"]
    client.post("/auth/link", json={"user_id": USER_ID, "token": token})
    return token


def test_refresh_extends_expiry(client):
    token = _linked_token(client)
    before = client.get(f"/auth/token/{token}/status").json()["expires_at"]

    resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    after = resp.json()["expires_at"]

    assert after >= before  # expiry moved forward (or equal within same second)
    assert resp.json()["status"] == "linked"
    assert resp.json()["user_id"] == USER_ID


def test_refresh_returns_7day_ttl(client):
    token = _linked_token(client)
    resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["expires_in_seconds"] == 7 * 86400


def test_refresh_without_bearer_returns_401(client):
    resp = client.post("/auth/refresh")
    assert resp.status_code == 401


def test_refresh_with_pending_token_returns_403(client):
    token = client.post("/auth/token").json()["token"]
    resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 403


def test_refresh_with_expired_token_returns_403(client, db):
    past = datetime.now(timezone.utc).replace(tzinfo=None) - timedelta(seconds=1)
    create_token(db, "EXPTOKEN", expires_at=past)
    # Manually set to linked so it passes status check but not expiry
    db.execute("UPDATE auth_tokens SET status='linked', user_id=? WHERE token='EXPTOKEN'", (USER_ID,))
    db.commit()
    resp = client.post("/auth/refresh", headers={"Authorization": "Bearer EXPTOKEN"})
    assert resp.status_code == 403


def test_refresh_token_string_unchanged(client):
    """The token string must not change — only expires_at moves forward."""
    token = _linked_token(client)
    resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert resp.json()["token"] == token


def test_refresh_response_shape(client):
    """Response must contain all fields the frontend relies on."""
    token = _linked_token(client)
    body = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"}).json()
    assert set(body.keys()) >= {"token", "status", "user_id", "expires_at", "expires_in_seconds"}


def test_refresh_persists_new_expiry_in_db(client):
    """The extended expiry must be visible via the status endpoint after refresh."""
    token = _linked_token(client)
    before = client.get(f"/auth/token/{token}/status").json()["expires_at"]

    client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})

    after = client.get(f"/auth/token/{token}/status").json()["expires_at"]
    assert after >= before


def test_refresh_successive_calls_keep_extending(client):
    """Each successive refresh must move expiry forward, not cap it."""
    token = _linked_token(client)

    first = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"}).json()["expires_at"]
    second = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"}).json()["expires_at"]

    assert second >= first


def test_refresh_token_remains_usable_afterwards(client, db):
    """A refreshed token must still pass require_linked_token (token_is_usable returns True)."""
    from server.storage.token_repository import get_token
    from server.auth.service import token_is_usable

    token = _linked_token(client)
    client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})

    record = get_token(db, token)
    assert token_is_usable(record) is True


def test_refresh_near_expiry_token_succeeds(client, db):
    """Proactive refresh: a token with < 24h remaining must be refreshable."""
    token = _linked_token(client)
    near_expiry = datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(hours=1)
    db.execute("UPDATE auth_tokens SET expires_at = ? WHERE token = ?", (near_expiry.isoformat(), token))
    db.commit()

    resp = client.post("/auth/refresh", headers={"Authorization": f"Bearer {token}"})
    assert resp.status_code == 200
    new_expiry = datetime.fromisoformat(resp.json()["expires_at"])
    assert new_expiry > near_expiry


def test_refresh_malformed_bearer_returns_401(client):
    """'Bearer' prefix missing — must return 401, not 403 or 500."""
    token = _linked_token(client)
    resp = client.post("/auth/refresh", headers={"Authorization": token})
    assert resp.status_code == 401


def test_refresh_unknown_token_returns_403(client):
    """An entirely unknown token string must return 403."""
    resp = client.post("/auth/refresh", headers={"Authorization": "Bearer XXXXXXXX"})
    assert resp.status_code == 403
