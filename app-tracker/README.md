# App Productivity Tracker

Track which applications you use on macOS or Ubuntu, classify them as productive / distraction / neutral, and view time reports from the command line.

---

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/) (package manager)
- **macOS**: grant Accessibility permission to your terminal (System Settings → Privacy & Security → Accessibility)
- **Ubuntu/X11**: `sudo apt install xdotool`

---

## Installation

```bash
# Install uv (skip if already installed)
curl -Lf https://astral.sh/uv/install.sh | sh

# Clone and bootstrap
git clone <repo-url>
cd app-tracker
uv sync
```

---

## Usage

All commands are run with `uv run tracker <command>`.

### Start tracking

```bash
uv run tracker start
```

Polls the active application every 5 seconds and saves sessions to a local SQLite database. Press **Ctrl-C** to stop.

### Check if tracker is running

```bash
uv run tracker status
```

### View today's summary

```bash
uv run tracker today
```

```
Productivity report — Today
┌─────────────┬────────┬────────┐
│ Category    │   Time │  Share │
├─────────────┼────────┼────────┤
│ productive  │  3h 12m│  64.0% │
│ distraction │    45m │  15.0% │
│ neutral     │    18m │   6.0% │
│ unknown     │    45m │  15.0% │
└─────────────┴────────┴────────┘
```

### View a report for the last N days

```bash
uv run tracker report            # last 7 days (default)
uv run tracker report --days 30  # last 30 days
```

### List all seen applications

```bash
uv run tracker apps
```

Shows every application that has been recorded, along with its assigned category.

### Show config file location

```bash
uv run tracker config
```

---

## Customising categories

Open `config.yaml` at the root of the project (or run `uv run tracker config` to find it). Rules are matched case-insensitively as substrings of the application name — first match wins.

```yaml
productive:
  - Code
  - Terminal
  - Notion

distraction:
  - YouTube
  - Reddit
  - Slack        # move to productive if Slack is work for you

neutral:
  - Finder
  - Calendar
```

Add, remove, or move entries freely. Changes take effect the next time the tracker starts.

---

## Database

Sessions are stored in `~/.local/share/app-tracker/tracker.db` (SQLite).

To use a different path:

```bash
export APP_TRACKER_DB=/path/to/custom.db
uv run tracker start
```

---

## Running in the background

### macOS — launchd

Create `~/Library/LaunchAgents/com.apptracker.plist`:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
  "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>             <string>com.apptracker</string>
  <key>ProgramArguments</key>
  <array>
    <string>/path/to/app-tracker/.venv/bin/tracker</string>
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

### Ubuntu — systemd

Create `~/.config/systemd/user/app-tracker.service`:

```ini
[Unit]
Description=App Productivity Tracker

[Service]
ExecStart=/path/to/app-tracker/.venv/bin/tracker start
Restart=always
RestartSec=5

[Install]
WantedBy=default.target
```

```bash
systemctl --user enable --now app-tracker
journalctl --user -u app-tracker -f   # view logs
```

---

## Development

```bash
uv run pytest          # run tests
uv run ruff check .    # lint
uv run ruff format .   # format
```
