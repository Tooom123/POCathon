# App Tracker Server

Aggregation server for [app-tracker](../app-tracker) clients. Receives productivity session reports via HTTP, validates them, and persists them to a local SQLite database — ready to power a multi-user leaderboard.

---

## Requirements

- Python 3.11+
- [uv](https://docs.astral.sh/uv/)

---

## Installation

```bash
cd app-tracker-server
uv sync
```

---

## Starting the server

```bash
uv run tracker-server
```

Listens on `http://0.0.0.0:8000` by default.

To change the port:

```bash
APP_TRACKER_SERVER_DB=/custom/path/server.db uv run tracker-server
```

Interactive API docs available at `http://localhost:8000/docs` once running.

---

## Endpoints

### `GET /health`

Liveness check.

```bash
curl http://localhost:8000/health
# {"status": "ok"}
```

---

### `POST /webhook/report`

Receive a batch of sessions from a client.

**Request body:**

```json
{
  "user_id": "12345678-1234-5678-1234-567812345678",
  "sessions": [
    {
      "app": "cursor",
      "category": "productive",
      "started_at": "2026-05-06T10:00:00",
      "ended_at": "2026-05-06T10:05:00",
      "duration": 300
    }
  ]
}
```

| Field | Type | Description |
|-------|------|-------------|
| `user_id` | UUID | Persistent client identifier (generated once by app-tracker) |
| `sessions` | array | 1–100 session objects |
| `app` | string | Application name as reported by the OS |
| `category` | string | `productive`, `distraction`, `neutral`, or `unknown` |
| `started_at` | ISO-8601 datetime | Session start |
| `ended_at` | ISO-8601 datetime | Session end |
| `duration` | integer (seconds) | Must match `ended_at − started_at` within 5 s |

**Response:**

```json
{
  "accepted": 1,
  "rejected": [
    {
      "app": "YouTube",
      "started_at": "2026-05-06T09:40:00",
      "ended_at": "2026-05-06T09:45:00",
      "reason": "too old: ended_at is outside the 15-minute acceptance window"
    }
  ]
}
```

Always returns HTTP 200. Rejected sessions include an explicit reason so the client can log or retry.

---

## Validation rules

Each session is checked in order. The first failing rule determines the rejection reason.

| # | Rule | Reason prefix |
|---|------|---------------|
| 1 | `ended_at` within the last 15 minutes | `too old` |
| 2 | `started_at` not in the future | `invalid` |
| 3 | No identical session already stored `(user_id, app, started_at)` | `duplicate` |
| 4 | No temporal overlap with an existing session for the same user | `overlap` |

Pydantic rejects malformed payloads with HTTP 422 before the pipeline runs:
- `user_id` must be a valid UUID v4
- `ended_at > started_at`
- `duration` must match the timestamp difference within 5 seconds
- `sessions` array must contain 1–100 items

---

## Database

Sessions are stored in `~/.local/share/app-tracker-server/server.db` (SQLite, WAL mode).

Override with an environment variable:

```bash
export APP_TRACKER_SERVER_DB=/path/to/custom.db
```

**Schema:**

```sql
CREATE TABLE sessions (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id     TEXT NOT NULL,       -- UUID string
    app         TEXT NOT NULL,
    category    TEXT NOT NULL,
    started_at  TEXT NOT NULL,       -- ISO-8601 naive UTC
    ended_at    TEXT NOT NULL,       -- ISO-8601 naive UTC
    duration    INTEGER NOT NULL,    -- seconds
    received_at TEXT NOT NULL        -- when the server received the report
);
```

---

## Development

```bash
uv run pytest          # run tests
uv run ruff check .    # lint
uv run ruff format .   # format
```

---

## Client integration

The [app-tracker](../app-tracker) client sends a report every 5 minutes using the persistent `user_id` stored in `~/.local/share/app-tracker/identity.json`.

Expected client flow:
1. Load `user_id` via `get_or_create_user_id()`
2. Fetch sessions from the last 5 minutes via `fetch_sessions_since()`
3. `POST /webhook/report` with the batch
4. Log accepted/rejected counts
