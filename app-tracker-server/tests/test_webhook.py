import sqlite3
from datetime import datetime, timedelta, timezone

import pytest
from fastapi.testclient import TestClient

from server.main import app
from server.storage.db import _migrate

USER_ID = "12345678-1234-5678-1234-567812345678"


@pytest.fixture(autouse=True)
def _inject_db():
    """Replace the live DB with an in-memory one for each test."""
    conn = sqlite3.connect(":memory:", check_same_thread=False)
    conn.row_factory = sqlite3.Row
    _migrate(conn)
    app.state.db = conn
    yield
    conn.close()


@pytest.fixture()
def client():
    return TestClient(app)


def _session_payload(offset_minutes: int = 1, duration: int = 60) -> dict:
    now = datetime.now(timezone.utc)
    ended = now - timedelta(minutes=offset_minutes)
    started = ended - timedelta(seconds=duration)
    return {
        "app": "Code",
        "category": "productive",
        "started_at": started.isoformat(),
        "ended_at": ended.isoformat(),
        "duration": duration,
    }


def test_health(client):
    assert client.get("/health").json() == {"status": "ok"}


def test_valid_report_accepted(client):
    resp = client.post(
        "/webhook/report",
        json={"user_id": USER_ID, "sessions": [_session_payload()]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] == 1
    assert body["rejected"] == []


def test_invalid_uuid_rejected(client):
    resp = client.post(
        "/webhook/report",
        json={"user_id": "not-a-uuid", "sessions": [_session_payload()]},
    )
    assert resp.status_code == 422


def test_empty_sessions_rejected(client):
    resp = client.post(
        "/webhook/report",
        json={"user_id": USER_ID, "sessions": []},
    )
    assert resp.status_code == 422


def test_duration_mismatch_rejected(client):
    now = datetime.now(timezone.utc)
    session = {
        "app": "Code",
        "category": "productive",
        "started_at": (now - timedelta(minutes=2)).isoformat(),
        "ended_at": (now - timedelta(minutes=1)).isoformat(),
        "duration": 999,  # wrong
    }
    resp = client.post(
        "/webhook/report",
        json={"user_id": USER_ID, "sessions": [session]},
    )
    assert resp.status_code == 422


def test_too_old_session_returns_rejected(client):
    resp = client.post(
        "/webhook/report",
        json={"user_id": USER_ID, "sessions": [_session_payload(offset_minutes=30)]},
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["accepted"] == 0
    assert len(body["rejected"]) == 1
    assert "too old" in body["rejected"][0]["reason"]
