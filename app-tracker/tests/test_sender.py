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


# ── current_session (live in-progress session) ────────────────────────────────

def _current_session() -> Session:
    """Return a typical in-progress session (started 10s ago, no end yet)."""
    start = datetime.now() - timedelta(seconds=10)
    return Session(app="VSCode", category="productive", started_at=start,
                   ended_at=datetime.now(), duration=10)


def test_send_with_only_current_session_sends_payload(conn):
    """When there are no completed sessions but a current_session exists, we still send."""
    since = datetime.now()
    live = _current_session()

    with patch("urllib.request.urlopen", return_value=_mock_response(1, [])) as mock_open:
        result, new_cursor = send_report(conn, USER_ID, since, SERVER, current_session=live)

    mock_open.assert_called_once()
    assert result.accepted == 1
    assert new_cursor > since


def test_current_session_included_in_payload(conn):
    """The in-progress session is present in the payload alongside any completed sessions."""
    insert_session(conn, _session())
    since = datetime.now() - timedelta(minutes=10)
    live = _current_session()

    captured: list[dict] = []

    def fake_open(req, timeout=10):
        captured.append(json.loads(req.data))
        return _mock_response(2, [])

    with patch("urllib.request.urlopen", side_effect=fake_open):
        send_report(conn, USER_ID, since, SERVER, current_session=live)

    assert len(captured) == 1
    apps_sent = [s["app"] for s in captured[0]["sessions"]]
    assert "Code" in apps_sent      # completed session
    assert "VSCode" in apps_sent    # current in-progress session


def test_no_sessions_no_current_session_skips_send(conn):
    """With neither completed sessions nor a current_session, no HTTP call is made."""
    since = datetime.now()

    with patch("urllib.request.urlopen") as mock_open:
        result, new_cursor = send_report(conn, USER_ID, since, SERVER, current_session=None)

    mock_open.assert_not_called()
    assert result.accepted == 0
    assert new_cursor == since


def test_current_session_does_not_advance_cursor_on_error(conn):
    """On network failure, the cursor stays unchanged even if current_session was provided."""
    import urllib.error
    since = datetime.now() - timedelta(minutes=5)
    live = _current_session()

    with patch("urllib.request.urlopen", side_effect=urllib.error.URLError("refused")):
        result, new_cursor = send_report(conn, USER_ID, since, SERVER, current_session=live)

    assert result.error is not None
    assert new_cursor == since
