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


def test_duplicate_rejected(conn):
    s = _session(offset_minutes=1)
    ingest_report(conn, _payload([s]))
    result = ingest_report(conn, _payload([s]))
    assert result.accepted == 0
    assert "duplicate" in result.rejected[0].reason


def test_mixed_batch(conn):
    good = _session(offset_minutes=1)
    old = _session(offset_minutes=RECENCY_WINDOW_MINUTES + 10)
    result = ingest_report(conn, _payload([good, old]))
    assert result.accepted == 1
    assert len(result.rejected) == 1
