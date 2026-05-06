# AGENT.md — App Productivity Tracker

> **Note for agents**: This file is the single source of truth for the project.
> Keep it updated as the codebase evolves (status, structure, decisions).
> When you modify the project, update the relevant sections here.

---

## Project goal

Track which applications are actively used on **macOS** and **Ubuntu**, classify them
as productive / distraction / neutral based on a user-editable config, persist sessions
to a local SQLite database, and expose CLI commands to view statistics.

---

## Tech stack

| Concern        | Choice                              |
|----------------|-------------------------------------|
| Runtime        | Python 3.11+                        |
| Package manager | `uv` (no pip, no venv manual setup) |
| DB             | SQLite via `sqlite3` (stdlib)       |
| Config         | YAML via `PyYAML`                   |
| CLI            | `typer`                             |
| Output / TUI   | `rich`                              |
| Testing        | `pytest`                            |
| Linting        | `ruff`                              |

---

## Tooling — uv

This project uses **[uv](https://docs.astral.sh/uv/)** exclusively. Never use `pip` or `python -m venv` directly.

```bash
# Install uv (once, globally)
curl -Lf https://astral.sh/uv/install.sh | sh

# Bootstrap the project (first time)
uv sync

# Add a dependency
uv add <package>

# Add a dev dependency
uv add --dev <package>

# Run any command inside the project environment
uv run <command>

# Run the tracker
uv run tracker start

# Run tests
uv run pytest

# Lint
uv run ruff check .
uv run ruff format .
```

`uv` reads `pyproject.toml` and manages `.venv` automatically — never activate the venv manually.

---

## Project structure

```
app-tracker/
├── AGENT.md                  ← this file (keep updated)
├── pyproject.toml            ← dependencies, scripts, tool config
├── uv.lock                   ← lockfile (commit this)
├── config.yaml               ← user classification rules (editable)
│
├── tracker/                  ← main package
│   ├── __init__.py
│   ├── main.py               ← CLI entry point (typer app)
│   │
│   ├── poller/               ← OS-level window detection
│   │   ├── __init__.py
│   │   ├── base.py           ← abstract BasePoller
│   │   ├── macos.py          ← AppleScript implementation
│   │   └── linux.py          ← xdotool implementation
│   │
│   ├── classifier/           ← app → category logic
│   │   ├── __init__.py
│   │   └── classifier.py     ← loads config.yaml, classifies app names
│   │
│   ├── storage/              ← persistence layer
│   │   ├── __init__.py
│   │   ├── db.py             ← SQLite connection + migrations
│   │   └── repository.py     ← read/write session records
│   │
│   └── report/               ← stats and output formatting
│       ├── __init__.py
│       └── reporter.py       ← aggregation queries + rich rendering
│
└── tests/
    ├── test_classifier.py
    ├── test_repository.py
    └── test_reporter.py
```

**Separation of responsibilities — rules to follow:**

- `poller/` only queries the OS. It never writes to DB or classifies.
- `classifier/` only maps an app name to a category. No I/O.
- `storage/` only handles persistence. No business logic.
- `report/` only reads from storage and formats output. No writes.
- `main.py` orchestrates the above; it is the only place that wires them together.
- No module imports from a sibling layer except through `main.py` or explicit interfaces.

---

## pyproject.toml (reference)

```toml
[project]
name = "app-tracker"
version = "0.1.0"
description = "Track and classify active applications for productivity insights"
requires-python = ">=3.11"
dependencies = [
    "typer>=0.12",
    "rich>=13",
    "pyyaml>=6",
]

[project.optional-dependencies]
dev = [
    "pytest>=8",
    "ruff>=0.4",
]

[project.scripts]
tracker = "tracker.main:app"

[tool.ruff]
line-length = 100
target-version = "py311"

[tool.ruff.lint]
select = ["E", "F", "I", "UP"]

[tool.pytest.ini_options]
testpaths = ["tests"]
```

---

## Configuration — config.yaml

User-editable. Loaded at startup by `classifier/classifier.py`.
Rules are matched case-insensitively as substrings of the active window title or process name.

```yaml
# Each key is a category. Values are substrings to match against app/window names.
# An app not matching any rule is classified as "unknown".
# Rules are evaluated top-to-bottom; first match wins.

productive:
  - Code
  - cursor
  - Terminal
  - iTerm
  - Alacritty
  - kitty
  - PyCharm
  - Xcode
  - Neovim
  - vim
  - Notion
  - Obsidian
  - Linear
  - Jira
  - GitHub
  - GitLab

distraction:
  - YouTube
  - Netflix
  - Twitch
  - TikTok
  - Instagram
  - Twitter
  - Reddit
  - Discord
  - Slack        # move to productive if Slack is work for you

neutral:
  - Finder
  - Files
  - System Preferences
  - System Settings
  - Calendar
  - Clock
  - Calculator
```

---

## Database schema

Managed by `storage/db.py`. Migrations are run automatically at startup.

```sql
CREATE TABLE IF NOT EXISTS sessions (
    id        INTEGER PRIMARY KEY AUTOINCREMENT,
    started_at TEXT NOT NULL,          -- ISO-8601
    ended_at   TEXT NOT NULL,          -- ISO-8601
    app        TEXT NOT NULL,          -- process/window name as reported by OS
    category   TEXT NOT NULL,          -- productive | distraction | neutral | unknown
    duration   INTEGER NOT NULL        -- seconds
);

CREATE INDEX IF NOT EXISTS idx_sessions_started_at ON sessions(started_at);
CREATE INDEX IF NOT EXISTS idx_sessions_category   ON sessions(category);
```

Database file location: `~/.local/share/app-tracker/tracker.db`
(configurable via env var `APP_TRACKER_DB`).

---

## CLI commands

All commands are exposed via `uv run tracker <command>`.

| Command             | Description                                      |
|---------------------|--------------------------------------------------|
| `tracker start`     | Start polling in the foreground (Ctrl-C to stop) |
| `tracker status`    | Show if a tracker process is running             |
| `tracker today`     | Print today's summary by category                |
| `tracker report`    | Print a full report (last 7 days by default)     |
| `tracker report --days N` | Report for the last N days               |
| `tracker apps`      | List all seen apps with their categories         |
| `tracker config`    | Print the path to config.yaml                    |

---

## OS integration

### macOS

Detection via `osascript`. Requires **Accessibility** permission granted to Terminal
(System Settings → Privacy & Security → Accessibility).

```python
# poller/macos.py
import subprocess

def get_active_app() -> str:
    result = subprocess.run(
        ["osascript", "-e",
         'tell application "System Events" to get name of first process whose frontmost is true'],
        capture_output=True, text=True, timeout=2,
    )
    return result.stdout.strip()
```

### Linux (Ubuntu / X11)

Requires `xdotool`: `sudo apt install xdotool`.

```python
# poller/linux.py
import subprocess

def get_active_app() -> str:
    win_id = subprocess.run(
        ["xdotool", "getactivewindow"],
        capture_output=True, text=True, timeout=2,
    ).stdout.strip()
    return subprocess.run(
        ["xdotool", "getwindowname", win_id],
        capture_output=True, text=True, timeout=2,
    ).stdout.strip()
```

The `BasePoller` ABC in `poller/base.py` defines the interface; `main.py` selects the
right implementation using `platform.system()` at runtime.

---

## Running as a background service

### macOS — launchd

```xml
<!-- ~/Library/LaunchAgents/com.apptracker.plist -->
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.apptracker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/.venv/bin/tracker</string>
    <string>start</string>
  </array>
  <key>RunAtLoad</key>         <true/>
  <key>KeepAlive</key>         <true/>
  <key>StandardOutPath</key>   <string>/tmp/apptracker.log</string>
  <key>StandardErrorPath</key> <string>/tmp/apptracker.err</string>
</dict>
</plist>
```

```bash
launchctl load ~/Library/LaunchAgents/com.apptracker.plist
```

### Ubuntu — systemd user unit

```ini
# ~/.config/systemd/user/app-tracker.service
[Unit]
Description=App Productivity Tracker

[Service]
ExecStart=/path/to/.venv/bin/tracker start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now app-tracker
journalctl --user -u app-tracker -f
```

---

## Key implementation decisions

| Decision | Rationale |
|----------|-----------|
| Poll interval: 5 s | Low overhead; good enough granularity for time tracking |
| Flush on app change only | Avoids writing every 5 s; keeps DB small |
| Substring match (case-insensitive) | Handles variants like "Code - file.py", "iTerm2" |
| First-match wins in classifier | Predictable; allows priority ordering in config.yaml |
| No external ORM | `sqlite3` stdlib is sufficient; avoids a heavy dependency |
| `uv` only | Reproducible envs, fast installs, no manual venv juggling |

---

## Project status

> **Last updated**: 2026-05-06 — initial skeleton implemented, all tests green.

| Component          | Status      | Notes                              |
|--------------------|-------------|------------------------------------|
| `pyproject.toml`   | ✓ done      | hatchling build backend added      |
| `config.yaml`      | ✓ done      |                                    |
| `poller/base.py`   | ✓ done      |                                    |
| `poller/macos.py`  | ✓ done      |                                    |
| `poller/linux.py`  | ✓ done      |                                    |
| `classifier/`      | ✓ done      |                                    |
| `storage/db.py`    | ✓ done      |                                    |
| `storage/repository.py` | ✓ done |                                  |
| `report/reporter.py` | ✓ done   |                                    |
| `main.py` (CLI)    | ✓ done      |                                    |
| Tests              | ✓ done      | 13 tests passing                   |
| launchd plist      | ☐ todo      |                                    |
| systemd unit       | ☐ todo      |                                    |

> **Agent instructions**: change `☐ todo` → `✓ done` (or `⚠ partial`) as you implement
> each component. Add a note if the implementation diverges from this spec.

---

## Conventions

- All public functions have type annotations and a one-line docstring.
- No bare `except:` — always catch specific exceptions.
- Log to stderr with `rich.console.Console(stderr=True)`; never `print()` in library code.
- Tests are co-located with functionality: `tests/test_<module>.py`.
- Do not duplicate logic — if the same transformation appears twice, extract it.
- Keep `main.py` thin: orchestration only, no business logic.