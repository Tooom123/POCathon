import sqlite3
from datetime import datetime

import pytest

from server.storage.db import _migrate
from server.storage.repository import StoredSession, find_overlapping, insert_session


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    _migrate(c)
    return c


def _s(app="Code", start="2026-05-06T10:00:00", end="2026-05-06T10:05:00"):
    return StoredSession(
        user_id="user-1",
        app=app,
        category="productive",
        started_at=datetime.fromisoformat(start),
        ended_at=datetime.fromisoformat(end),
        duration=300,
        received_at=datetime.fromisoformat("2026-05-06T10:05:01"),
    )


def test_insert_and_no_overlap(conn):
    assert insert_session(conn, _s()) is True
    result = find_overlapping(
        conn, "user-1",
        datetime.fromisoformat("2026-05-06T10:10:00"),
        datetime.fromisoformat("2026-05-06T10:15:00"),
    )
    assert result is None


def test_overlap_detected(conn):
    insert_session(conn, _s())
    result = find_overlapping(
        conn, "user-1",
        datetime.fromisoformat("2026-05-06T10:03:00"),
        datetime.fromisoformat("2026-05-06T10:08:00"),
    )
    assert result is not None
    assert result.app == "Code"


def test_adjacent_sessions_do_not_overlap(conn):
    insert_session(conn, _s())
    # starts exactly when the previous one ends → no overlap
    result = find_overlapping(
        conn, "user-1",
        datetime.fromisoformat("2026-05-06T10:05:00"),
        datetime.fromisoformat("2026-05-06T10:10:00"),
    )
    assert result is None


def test_duplicate_rejected(conn):
    assert insert_session(conn, _s()) is True
    assert insert_session(conn, _s()) is False


def test_overlap_isolated_per_user(conn):
    insert_session(conn, _s())
    # Different user_id — should not conflict
    result = find_overlapping(
        conn, "user-2",
        datetime.fromisoformat("2026-05-06T10:03:00"),
        datetime.fromisoformat("2026-05-06T10:08:00"),
    )
    assert result is None
