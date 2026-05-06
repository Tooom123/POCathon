import platform
import signal
import time
from datetime import datetime

import typer
from rich.console import Console

from tracker.classifier.classifier import Classifier
from tracker.storage.db import get_connection, get_db_path
from tracker.storage.identity import get_or_create_user_id
from tracker.storage.repository import Session, insert_session
from tracker.report.reporter import report_apps, report_days, report_today
from tracker.sender import SEND_INTERVAL, get_server_url, send_report

app = typer.Typer(help="App productivity tracker")
err = Console(stderr=True)

POLL_INTERVAL = 5  # seconds


def _make_poller():
    """Instantiate the right poller for the current OS."""
    system = platform.system()
    if system == "Darwin":
        from tracker.poller.macos import MacOSPoller
        return MacOSPoller()
    elif system == "Linux":
        from tracker.poller.linux import LinuxPoller
        return LinuxPoller()
    else:
        err.print(f"[red]Unsupported OS: {system}[/red]")
        raise typer.Exit(1)


@app.command()
def start() -> None:
    """Start polling the active application in the foreground (Ctrl-C to stop)."""
    poller = _make_poller()
    classifier = Classifier()
    conn = get_connection()

    current_app: str = ""
    session_start: datetime = datetime.now()

    def _flush(ended_at: datetime) -> None:
        if not current_app:
            return
        duration = int((ended_at - session_start).total_seconds())
        if duration < 1:
            return
        insert_session(
            conn,
            Session(
                app=current_app,
                category=classifier.classify(current_app),
                started_at=session_start,
                ended_at=ended_at,
                duration=duration,
            ),
        )

    def _handle_exit(signum, frame):  # noqa: ANN001
        _flush(datetime.now())
        raise SystemExit(0)

    signal.signal(signal.SIGINT, _handle_exit)
    signal.signal(signal.SIGTERM, _handle_exit)

    user_id = get_or_create_user_id()
    server_url = get_server_url()
    last_sent_at: datetime = datetime.now()
    last_send_tick: float = time.monotonic()

    if server_url:
        err.print(
            f"[green]Tracker started[/green] — user ID: [cyan]{user_id}[/cyan]"
            f" — syncing to [cyan]{server_url}[/cyan] every {SEND_INTERVAL // 60} min"
            " — press Ctrl-C to stop"
        )
    else:
        err.print(
            f"[green]Tracker started[/green] — user ID: [cyan]{user_id}[/cyan]"
            " — [dim]set APP_TRACKER_SERVER to enable sync[/dim] — press Ctrl-C to stop"
        )

    while True:
        try:
            active = poller.get_active_app()
        except Exception as exc:  # noqa: BLE001
            err.print(f"[yellow]Poll error:[/yellow] {exc}")
            time.sleep(POLL_INTERVAL)
            continue

        now = datetime.now()
        if active != current_app:
            _flush(now)
            current_app = active
            session_start = now

        if server_url and (time.monotonic() - last_send_tick) >= SEND_INTERVAL:
            result, last_sent_at = send_report(conn, user_id, last_sent_at, server_url)
            last_send_tick = time.monotonic()
            if result.error:
                err.print(f"[yellow]Sync error:[/yellow] {result.error}")
            else:
                err.print(
                    f"[dim]Sync — accepted: {result.accepted}"
                    f"  rejected: {result.rejected}[/dim]"
                )

        time.sleep(POLL_INTERVAL)


@app.command()
def status() -> None:
    """Show whether a tracker process is currently running."""
    import subprocess

    result = subprocess.run(
        ["pgrep", "-f", "tracker start"],
        capture_output=True,
        text=True,
    )
    if result.stdout.strip():
        typer.echo("Tracker is running.")
    else:
        typer.echo("Tracker is not running.")


@app.command()
def today(verbose: bool = typer.Option(False, "--verbose", "-v", help="Show per-session detail")) -> None:
    """Print today's productivity summary by category."""
    report_today(get_connection(), verbose=verbose)


@app.command()
def report(
    days: int = typer.Option(7, help="Number of days to include"),
    verbose: bool = typer.Option(False, "--verbose", "-v", help="Show per-session detail"),
) -> None:
    """Print a productivity report for the last N days."""
    report_days(get_connection(), days, verbose=verbose)


@app.command()
def apps() -> None:
    """List all seen applications with their categories."""
    report_apps(get_connection())


@app.command()
def link(
    token: str = typer.Argument(help="Token displayed by the leaderboard frontend"),
    server: str = typer.Option("http://localhost:8000", envvar="APP_TRACKER_SERVER", help="Server URL"),
) -> None:
    """Link this machine's identity to a leaderboard browser session."""
    import urllib.request
    import urllib.error
    import json

    user_id = get_or_create_user_id()
    payload = json.dumps({"user_id": user_id, "token": token}).encode()
    req = urllib.request.Request(
        f"{server.rstrip('/')}/auth/link",
        data=payload,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req) as resp:
            body = json.loads(resp.read())
        err.print(f"[green]Linked successfully.[/green] Session active until {body['expires_at']}")
    except urllib.error.HTTPError as exc:
        detail = json.loads(exc.read()).get("detail", exc.reason)
        err.print(f"[red]Link failed:[/red] {detail}")
        raise typer.Exit(1)
    except urllib.error.URLError as exc:
        err.print(f"[red]Could not reach server at {server}:[/red] {exc.reason}")
        raise typer.Exit(1)


@app.command()
def config() -> None:
    """Print the path to config.yaml."""
    from tracker.classifier.classifier import CONFIG_PATH
    typer.echo(str(CONFIG_PATH.resolve()))
