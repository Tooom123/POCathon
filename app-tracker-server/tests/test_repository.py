import sqlite3
from datetime import datetime

import pytest

from server.storage.db import _migrate
from server.storage.repository import StoredSession, find_overlapping, insert_session, upsert_session


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


# ── find_overlapping with exclusion ──────────────────────────────────────────

def test_find_overlapping_excludes_self(conn):
    """Overlap search must not flag the session being upserted as a conflict."""
    insert_session(conn, _s())
    result = find_overlapping(
        conn, "user-1",
        datetime.fromisoformat("2026-05-06T10:00:00"),
        datetime.fromisoformat("2026-05-06T10:08:00"),
        exclude_app="Code",
        exclude_started_at=datetime.fromisoformat("2026-05-06T10:00:00"),
    )
    assert result is None


def test_find_overlapping_exclusion_does_not_hide_other_conflicts(conn):
    """Excluding session A must not suppress a real conflict from session B."""
    insert_session(conn, _s(app="Code"))
    insert_session(conn, _s(app="Firefox"))  # same time window, different app

    result = find_overlapping(
        conn, "user-1",
        datetime.fromisoformat("2026-05-06T10:00:00"),
        datetime.fromisoformat("2026-05-06T10:08:00"),
        exclude_app="Code",
        exclude_started_at=datetime.fromisoformat("2026-05-06T10:00:00"),
    )
    assert result is not None
    assert result.app == "Firefox"


# ── upsert_session ────────────────────────────────────────────────────────────

def test_upsert_inserts_new_session(conn):
    """upsert_session creates a row when none exists for (user_id, app, started_at)."""
    upsert_session(conn, _s())
    count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    assert count == 1


def test_upsert_extends_existing_session(conn):
    """upsert_session updates ended_at/duration when the identity already exists."""
    upsert_session(conn, _s(end="2026-05-06T10:05:00"))
    upsert_session(conn, _s(end="2026-05-06T10:10:00"))

    rows = conn.execute("SELECT * FROM sessions").fetchall()
    assert len(rows) == 1
    assert rows[0]["ended_at"] == "2026-05-06T10:10:00"


def test_upsert_does_not_create_duplicate_rows(conn):
    """Multiple upserts for the same identity produce exactly one DB row."""
    for minutes in range(1, 6):
        upsert_session(conn, _s(end=f"2026-05-06T10:0{minutes}:00"))

    count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    assert count == 1


def test_upsert_different_apps_are_separate_rows(conn):
    """Sessions for different apps are stored as distinct rows."""
    upsert_session(conn, _s(app="Code"))
    upsert_session(conn, _s(app="Firefox"))

    count = conn.execute("SELECT COUNT(*) FROM sessions").fetchone()[0]
    assert count == 2
