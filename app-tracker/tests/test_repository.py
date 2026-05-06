import sqlite3
from datetime import datetime

import pytest

from tracker.storage.db import _migrate
from tracker.storage.repository import Session, fetch_all_apps, fetch_sessions_since, insert_session


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    _migrate(c)
    return c


def _session(app="Code", category="productive", offset_minutes=0):
    start = datetime(2024, 1, 1, 10, offset_minutes, 0)
    end = datetime(2024, 1, 1, 10, offset_minutes, 30)
    return Session(app=app, category=category, started_at=start, ended_at=end, duration=30)


def test_insert_and_fetch(conn):
    insert_session(conn, _session())
    rows = fetch_sessions_since(conn, datetime(2024, 1, 1))
    assert len(rows) == 1
    assert rows[0].app == "Code"
    assert rows[0].duration == 30


def test_fetch_since_filters(conn):
    insert_session(conn, _session(offset_minutes=0))
    insert_session(conn, _session(app="YouTube", category="distraction", offset_minutes=2))
    rows = fetch_sessions_since(conn, datetime(2024, 1, 1, 10, 1, 0))
    assert len(rows) == 1
    assert rows[0].app == "YouTube"


def test_fetch_all_apps(conn):
    insert_session(conn, _session("Code", "productive"))
    insert_session(conn, _session("YouTube", "distraction"))
    insert_session(conn, _session("Code", "productive"))  # duplicate
    apps = fetch_all_apps(conn)
    assert len(apps) == 2
    assert ("Code", "productive") in apps
