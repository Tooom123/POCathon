import sqlite3
from datetime import datetime, timedelta, timezone
from uuid import UUID

import pytest

from server.ingestion.pipeline import RECENCY_WINDOW_MINUTES, ingest_report
from server.models.schemas import ReportPayload, SessionPayload
from server.storage.db import _migrate

USER_ID = UUID("12345678-1234-5678-1234-567812345678")


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    _migrate(c)
    return c


def _now():
    return datetime.now(timezone.utc)


def _session(offset_minutes: int = 0, duration: int = 60) -> SessionPayload:
    """Build a session ending `offset_minutes` minutes before now."""
    now = _now()
    ended = now - timedelta(minutes=offset_minutes)
    started = ended - timedelta(seconds=duration)
    return SessionPayload(
        app="Code",
        category="productive",
        started_at=started,
        ended_at=ended,
        duration=duration,
    )


def _payload(sessions: list[SessionPayload]) -> ReportPayload:
    return ReportPayload(user_id=USER_ID, sessions=sessions)


def test_valid_session_accepted(conn):
    result = ingest_report(conn, _payload([_session(offset_minutes=1)]))
    assert result.accepted == 1
    assert result.rejected == []


def test_too_old_rejected(conn):
    result = ingest_report(conn, _payload([_session(offset_minutes=RECENCY_WINDOW_MINUTES + 5)]))
    assert result.accepted == 0
    assert len(result.rejected) == 1
    assert "too old" in result.rejected[0].reason


def test_future_session_rejected(conn):
    now = _now()
    session = SessionPayload(
        app="Code",
        category="productive",
        started_at=now + timedelta(minutes=1),
        ended_at=now + timedelta(minutes=2),
        duration=60,
    )
    result = ingest_report(conn, _payload([session]), now=now)
    assert result.accepted == 0
    assert "future" in result.rejected[0].reason


def test_overlap_rejected(conn):
    s1 = _session(offset_minutes=1, duration=120)
    ingest_report(conn, _payload([s1]))

    # s2 overlaps s1
    now = _now()
    s2 = SessionPayload(
        app="Firefox",
        category="neutral",
        started_at=s1.started_at + timedelta(seconds=30),
        ended_at=s1.ended_at + timedelta(seconds=30),
        duration=120,
    )
    result = ingest_report(conn, _payload([s2]))
    assert result.accepted == 0
    assert "overlap" in result.rejected[0].reason


def test_duplicate_upserted(conn):
    """Sending the exact same session twice counts as accepted both times (upsert)."""
    s = _session(offset_minutes=1)
    ingest_report(conn, _payload([s]))
    result = ingest_report(conn, _payload([s]))
    assert result.accepted == 1
    assert result.rejected == []


def test_duplicate_does_not_create_second_row(conn):
    """Upserting an identical session must not add a second row to the DB."""
    s = _session(offset_minutes=1)
    ingest_report(conn, _payload([s]))
    ingest_report(conn, _payload([s]))
    count = conn.execute(
        "SELECT COUNT(*) FROM sessions WHERE user_id = ?", (str(USER_ID),)
    ).fetchone()[0]
    assert count == 1


def test_mixed_batch(conn):
    good = _session(offset_minutes=1)
    old = _session(offset_minutes=RECENCY_WINDOW_MINUTES + 10)
    result = ingest_report(conn, _payload([good, old]))
    assert result.accepted == 1
    assert len(result.rejected) == 1


# ── live update (upsert) behaviour ───────────────────────────────────────────

def test_live_update_extends_ended_at(conn):
    """Same (app, started_at), later ended_at → server extends the session, not duplicates."""
    now = _now()
    started = now - timedelta(seconds=30)

    s1 = SessionPayload(
        app="Code", category="productive",
        started_at=started, ended_at=now - timedelta(seconds=20), duration=10,
    )
    s2 = SessionPayload(
        app="Code", category="productive",
        started_at=started, ended_at=now - timedelta(seconds=5), duration=25,
    )

    ingest_report(conn, _payload([s1]))
    result = ingest_report(conn, _payload([s2]))

    assert result.accepted == 1
    assert result.rejected == []

    rows = conn.execute("SELECT * FROM sessions WHERE user_id = ?", (str(USER_ID),)).fetchall()
    assert len(rows) == 1
    assert rows[0]["duration"] == 25


def test_live_update_does_not_trigger_self_overlap(conn):
    """A growing session (same app + started_at) must never be rejected as self-overlap."""
    started = _now() - timedelta(seconds=60)

    for i in range(1, 6):
        s = SessionPayload(
            app="Code", category="productive",
            started_at=started,
            ended_at=started + timedelta(seconds=i * 10),
            duration=i * 10,
        )
        result = ingest_report(conn, _payload([s]))
        assert result.accepted == 1, f"update #{i} was rejected: {result.rejected}"

    rows = conn.execute("SELECT * FROM sessions WHERE user_id = ?", (str(USER_ID),)).fetchall()
    assert len(rows) == 1
    assert rows[0]["duration"] == 50


def test_different_app_overlap_still_rejected(conn):
    """A genuinely overlapping session for a *different* app is still rejected."""
    s1 = SessionPayload(
        app="Code", category="productive",
        started_at=_now() - timedelta(seconds=60),
        ended_at=_now() - timedelta(seconds=10),
        duration=50,
    )
    ingest_report(conn, _payload([s1]))

    s2 = SessionPayload(
        app="Firefox", category="neutral",
        started_at=s1.started_at + timedelta(seconds=5),
        ended_at=s1.ended_at + timedelta(seconds=5),
        duration=50,
    )
    result = ingest_report(conn, _payload([s2]))
    assert result.accepted == 0
    assert "overlap" in result.rejected[0].reason


def test_live_sequence_completed_then_new_app(conn):
    """Simulate desktop flow: VSCode live-updated 3 times, then Chrome starts."""
    start = _now() - timedelta(seconds=30)

    for i in range(1, 4):
        s = SessionPayload(
            app="VSCode", category="productive",
            started_at=start, ended_at=start + timedelta(seconds=i * 5), duration=i * 5,
        )
        result = ingest_report(conn, _payload([s]))
        assert result.accepted == 1

    # VSCode ends at T+15, Chrome starts at T+15
    chrome_start = start + timedelta(seconds=15)
    chrome = SessionPayload(
        app="Chrome", category="neutral",
        started_at=chrome_start, ended_at=chrome_start + timedelta(seconds=5), duration=5,
    )
    result = ingest_report(conn, _payload([chrome]))
    assert result.accepted == 1

    rows = conn.execute(
        "SELECT app FROM sessions WHERE user_id = ? ORDER BY started_at", (str(USER_ID),)
    ).fetchall()
    assert [r["app"] for r in rows] == ["VSCode", "Chrome"]
