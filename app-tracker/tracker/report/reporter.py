import sqlite3
from collections import defaultdict
from datetime import datetime, timedelta

from rich.console import Console
from rich.rule import Rule
from rich.table import Table

from tracker.storage.repository import Session, fetch_all_apps, fetch_sessions_since

console = Console()

CATEGORY_COLORS = {
    "productive": "green",
    "distraction": "red",
    "neutral": "yellow",
    "unknown": "dim",
}


def _format_duration(seconds: int) -> str:
    """Format a duration in seconds as Xh Ym."""
    h, m = divmod(seconds // 60, 60)
    return f"{h}h {m:02d}m" if h else f"{m}m"


def _fmt_ts(dt: datetime) -> str:
    """Format a datetime as HH:MM:SS for display."""
    return dt.strftime("%Y-%m-%d %H:%M:%S")


def report_today(conn: sqlite3.Connection, verbose: bool = False) -> None:
    """Print today's time breakdown by category."""
    since = datetime.now().replace(hour=0, minute=0, second=0, microsecond=0)
    _print_summary(conn, since, "Today", verbose=verbose)


def report_days(conn: sqlite3.Connection, days: int = 7, verbose: bool = False) -> None:
    """Print a time breakdown by category for the last N days."""
    since = datetime.now() - timedelta(days=days)
    _print_summary(conn, since, f"Last {days} days", verbose=verbose)


def _print_summary(
    conn: sqlite3.Connection, since: datetime, label: str, verbose: bool = False
) -> None:
    """Aggregate sessions since `since` and render a rich table."""
    sessions = fetch_sessions_since(conn, since)
    totals: dict[str, int] = defaultdict(int)
    for s in sessions:
        totals[s.category] += s.duration

    grand_total = sum(totals.values()) or 1

    summary = Table(title=f"Productivity report — {label}", show_footer=False)
    summary.add_column("Category", style="bold")
    summary.add_column("Time", justify="right")
    summary.add_column("Share", justify="right")

    for category in ("productive", "distraction", "neutral", "unknown"):
        secs = totals.get(category, 0)
        color = CATEGORY_COLORS[category]
        summary.add_row(
            f"[{color}]{category}[/{color}]",
            _format_duration(secs),
            f"{secs / grand_total * 100:.1f}%",
        )

    console.print(summary)

    if verbose:
        _print_sessions(sessions, grand_total)


def _print_sessions(sessions: list[Session], grand_total: int) -> None:
    """Print the full per-session breakdown grouped by category."""
    by_category: dict[str, list[Session]] = defaultdict(list)
    for s in sessions:
        by_category[s.category].append(s)

    for category in ("productive", "distraction", "neutral", "unknown"):
        group = by_category.get(category)
        if not group:
            continue

        color = CATEGORY_COLORS[category]
        category_total = sum(s.duration for s in group)
        share = category_total / grand_total * 100

        console.print(
            Rule(
                f"[bold {color}]{category}[/bold {color}]"
                f"  {_format_duration(category_total)}  {share:.1f}%"
            )
        )

        table = Table(show_header=True, header_style="bold", box=None, pad_edge=False)
        table.add_column("Started at", style="dim", min_width=19)
        table.add_column("Ended at", style="dim", min_width=19)
        table.add_column("App", min_width=20)
        table.add_column("Duration", justify="right")
        table.add_column("Share", justify="right")

        for s in sorted(group, key=lambda x: x.started_at):
            table.add_row(
                _fmt_ts(s.started_at),
                _fmt_ts(s.ended_at),
                s.app,
                _format_duration(s.duration),
                f"{s.duration / grand_total * 100:.1f}%",
            )

        console.print(table)
        console.print()


def report_apps(conn: sqlite3.Connection) -> None:
    """Print all seen apps with their categories."""
    apps = fetch_all_apps(conn)
    table = Table(title="Seen applications")
    table.add_column("App")
    table.add_column("Category")

    for app, category in apps:
        color = CATEGORY_COLORS.get(category, "dim")
        table.add_row(app, f"[{color}]{category}[/{color}]")

    console.print(table)
