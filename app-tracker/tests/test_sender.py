import json
import sqlite3
from datetime import datetime, timedelta
from unittest.mock import MagicMock, patch

import pytest

from tracker.sender import SendResult, _build_payload, send_report
from tracker.storage.db import _migrate
from tracker.storage.repository import Session, insert_session

USER_ID = "12345678-1234-5678-1234-567812345678"
SERVER = "http://localhost:8000"


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    _migrate(c)
    return c


def _session(offset_minutes: int = 1, duration: int = 60) -> Session:
    end = datetime.now() - timedelta(minutes=offset_minutes)
    start = end - timedelta(seconds=duration)
    return Session(app="Code", category="productive", started_at=start, ended_at=end, duration=duration)


def _mock_response(accepted: int, rejected: list) -> MagicMock:
    body = json.dumps({"accepted": accepted, "rejected": rejected}).encode()
    mock = MagicMock()
    mock.__enter__ = lambda s: s
    mock.__exit__ = MagicMock(return_value=False)
    mock.read.return_value = body
    return mock


def test_no_sessions_returns_unchanged_cursor(conn):
    since = datetime.now()
    result, new_cursor = send_report(conn, USER_ID, since, SERVER)
    assert result.accepted == 0
    assert result.rejected == 0
    assert new_cursor == since  # cursor unchanged — nothing to send


def test_successful_send_advances_cursor(conn):
    insert_session(conn, _session())
    since = datetime.now() - timedelta(minutes=10)

    with patch("urllib.request.urlopen", return_value=_mock_response(1, [])):
        result, new_cursor = send_report(conn, USER_ID, since, SERVER)

    assert result.accepted == 1
    assert result.rejected == 0
    assert result.error is None
    assert new_cursor > since


def test_rejected_sessions_counted(conn):
    insert_session(conn, _session())
    since = datetime.now() - timedelta(minutes=10)

    with patch("urllib.request.urlopen", return_value=_mock_response(0, [{"reason": "too old"}])):
        result, new_cursor = send_report(conn, USER_ID, since, SERVER)

    assert result.accepted == 0
    assert result.rejected == 1
    assert new_cursor > since  # cursor still advances — server did receive the payload


def test_network_error_returns_unchanged_cursor(conn):
    import urllib.error
    insert_session(conn, _session())
    since = datetime.now() - timedelta(minutes=10)

    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("connection refused")):
        result, new_cursor = send_report(conn, USER_ID, since, SERVER)

    assert result.error is not None
    assert new_cursor == since  # cursor unchanged — will retry next tick


def test_build_payload_structure(conn):
    s = _session()
    payload = _build_payload(USER_ID, [s])
    assert payload["user_id"] == USER_ID
    assert len(payload["sessions"]) == 1
    session = payload["sessions"][0]
    assert session["app"] == "Code"
    assert session["category"] == "productive"
    assert "started_at" in session
    assert "ended_at" in session
    assert session["duration"] == 60
