import sqlite3
from datetime import datetime

import pytest
from rich.console import Console

from tracker.storage.db import _migrate
from tracker.storage.repository import Session, insert_session
from tracker.report.reporter import _format_duration, report_today, report_days


@pytest.fixture()
def conn():
    c = sqlite3.connect(":memory:")
    c.row_factory = sqlite3.Row
    _migrate(c)
    return c


def test_format_duration_minutes_only():
    assert _format_duration(90) == "1m"


def test_format_duration_hours_and_minutes():
    assert _format_duration(3720) == "1h 02m"


def test_report_today_no_crash(conn, capsys):
    """report_today should complete without error on an empty DB."""
    report_today(conn)


def test_report_days_aggregates(conn):
    start = datetime.now().replace(hour=9, minute=0, second=0, microsecond=0)
    end = datetime.now().replace(hour=9, minute=30, second=0, microsecond=0)
    insert_session(
        conn,
        Session(app="Code", category="productive", started_at=start, ended_at=end, duration=1800),
    )
    # Should not raise; output is tested visually
    report_days(conn, days=1)
