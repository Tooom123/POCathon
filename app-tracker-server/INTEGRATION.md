# Frontend Integration Guide

## Context

This document targets the frontend agent responsible for implementing the leaderboard UI. The backend is a FastAPI server (`app-tracker-server`) that aggregates productivity session data sent by desktop clients (`app-tracker`). Each desktop client has a persistent UUID (`user_id`) stored locally. The frontend never handles this UUID directly — instead, it initiates a **token pairing flow** that lets the desktop client prove its identity to the browser session. Once paired, the browser holds a short-lived Bearer token it uses on every subsequent request. There is no account system, no password, no permanent linkage in the database — the token IS the session.

The scripts in `scripts/` are executable curl simulations of every request described here. Run them against a local server (`uv run tracker-server`) to observe exact request/response shapes before implementing.

---

## Base URL

```
http://localhost:8000
```

Configurable via environment. All endpoints return `application/json`. The SSE endpoint returns `text/event-stream`.

---

## 1. Liveness check

Confirm the server is reachable before rendering anything.

```
GET /health
```

**Response**
```json
{ "status": "ok" }
```

**Script:** `scripts/01_health.sh`

---

## 2. Token pairing flow

This is the core authentication mechanism. The frontend drives it; the desktop client completes it.

### Step 1 — Request a token

The frontend calls this when the user lands on the "connect your tracker" screen. The server generates a random 8-character uppercase alphanumeric token and returns it as `pending`.

```
POST /auth/token
```

**Response** `201`
```json
{
  "token": "A3F2B1C9",
  "status": "pending",
  "user_id": null,
  "expires_at": "2026-05-06T10:10:00",
  "expires_in_seconds": 600,
  "instructions": "Run on your PC:  tracker link A3F2B1C9"
}
```

Display `token` prominently. Display `instructions` verbatim as a copy-paste hint. The token expires in 10 minutes — if the user misses the window, request a new one.

**Script:** `scripts/02_browser_request_token.sh`

---

### Step 2 — Open the SSE stream

Immediately after receiving the token, open an SSE connection to listen for the pairing confirmation. Keep this connection open while the user runs the command on their PC.

```
GET /auth/token/{token}/stream
Accept: text/event-stream
```

The server emits one event per second. Each event is a JSON object on a `data:` line:

```
data: {"token": "A3F2B1C9", "status": "pending", "user_id": null, "expires_at": "..."}

data: {"token": "A3F2B1C9", "status": "pending", "user_id": null, "expires_at": "..."}

data: {"token": "A3F2B1C9", "status": "linked", "user_id": "12345678-...", "expires_at": "..."}
```

When `status` transitions to `"linked"`:
- Store `token` as the Bearer credential for this browser session
- Store `user_id` if you need to display the identity
- Close the SSE connection
- Redirect the user to the leaderboard

Possible terminal events (close the connection and handle accordingly):

| `status` value | Meaning |
|---|---|
| `"linked"` | Pairing successful — proceed |
| `"expired"` | Token timed out — request a new one |
| `"not_found"` | Token does not exist — request a new one |

**Script:** `scripts/05_token_stream_sse.sh`

---

### Step 2 (alternative) — Poll instead of SSE

If SSE is not viable in your environment, poll this endpoint instead.

```
GET /auth/token/{token}/status
```

**Response** `200` (pending)
```json
{
  "token": "A3F2B1C9",
  "status": "pending",
  "user_id": null,
  "expires_at": "2026-05-06T10:10:00"
}
```

**Response** `200` (linked)
```json
{
  "token": "A3F2B1C9",
  "status": "linked",
  "user_id": "12345678-1234-5678-1234-567812345678",
  "expires_at": "2026-05-07T10:05:00"
}
```

**Response** `410 Gone` — token expired.
**Response** `404 Not Found` — token unknown.

Poll at a 2–3 second interval. Stop when `status` is `"linked"` or on 4xx.

**Script:** `scripts/04_token_status_poll.sh`

---

### Step 3 — Desktop client links the token (out of band)

The user runs this on their PC. The frontend has no control over this step — it just waits on the SSE stream.

```bash
uv run tracker link A3F2B1C9
```

Under the hood this calls `POST /auth/link` with the PC's persistent `user_id`. The SSE stream then emits the `"linked"` event.

**Script:** `scripts/03_pc_link_token.sh`

---

## 3. Token storage (localStorage)

After a successful pairing, persist the following keys in `localStorage`. Do not use `sessionStorage` — the goal is sessions that survive tab closes and browser restarts.

| Key | Value | Example |
|---|---|---|
| `tracker_token` | The Bearer token string | `"A3F2B1C9"` |
| `tracker_user_id` | The linked `user_id` | `"12345678-..."` |
| `tracker_expires_at` | ISO-8601 expiry timestamp | `"2026-05-13T10:05:00"` |

On every page load, read `tracker_token` and `tracker_expires_at` first. If the token is present and not expired, skip the pairing flow entirely and go straight to the leaderboard. Only show the pairing screen if the token is absent or expired.

```js
const token = localStorage.getItem('tracker_token')
const expiresAt = localStorage.getItem('tracker_expires_at')
const isValid = token && new Date(expiresAt) > new Date()

if (!isValid) {
  // show pairing flow
} else {
  // go straight to leaderboard, schedule refresh
}
```

Clear all three keys on explicit logout, or when the server returns `403` and refresh also fails.

---

## 4. Authenticated requests

Once the token is linked, attach it as a Bearer on every request to protected endpoints.

```
Authorization: Bearer A3F2B1C9
```

The `require_linked_token` FastAPI dependency validates the token on each request:
- `401` if the `Authorization` header is absent or malformed
- `403` if the token is not found, not linked, or expired
- On success, the dependency resolves to the `AuthToken` record which includes `user_id`

Token lifetime after linking: **7 days**. On `403`, attempt a refresh (see section 5) before falling back to the pairing flow.

---

## 5. Session refresh

Linked tokens last 7 days and are renewable indefinitely — the user should never need to re-run `tracker link` as long as the browser refreshes the token before it expires.

```
POST /auth/refresh
Authorization: Bearer A3F2B1C9
```

**Response** `200`
```json
{
  "token": "A3F2B1C9",
  "status": "linked",
  "user_id": "12345678-1234-5678-1234-567812345678",
  "expires_at": "2026-05-13T10:05:00",
  "expires_in_seconds": 604800
}
```

The token string stays the same — only `expires_at` moves forward by 7 days. Update `tracker_expires_at` in localStorage with the new value.

**Error responses:**
- `401` — no Bearer header
- `403` — token not found, not linked, or already expired (refresh too late — redirect to pairing flow)

### When to refresh

**Proactive (recommended):** schedule a refresh when less than 24 hours remain on the token. Check on every page load:

```js
const expiresAt = new Date(localStorage.getItem('tracker_expires_at'))
const hoursLeft = (expiresAt - new Date()) / 3_600_000

if (hoursLeft < 24) {
  await refresh()  // POST /auth/refresh, update localStorage
}
```

**Reactive (safety net):** if any authenticated request returns `403`, attempt one refresh before deciding whether to show the pairing flow:

```js
async function apiFetch(url) {
  let resp = await fetch(url, { headers: authHeaders() })
  if (resp.status === 403) {
    const refreshed = await refresh()
    if (!refreshed) return redirectToPairing()
    resp = await fetch(url, { headers: authHeaders() })
  }
  return resp
}
```

Both strategies together guarantee that an active user is never interrupted, and that a returning user after a long absence (> 7 days without opening the app) is cleanly sent back to the pairing flow.

---

## 6. Webhook (reference — PC client only)

The frontend does not call this endpoint. It is documented here for observability — the data it produces is what the leaderboard will query.

Desktop clients post batches of sessions every 5 minutes:

```
POST /webhook/report
```

**Request body**
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

**Response** `200`
```json
{
  "accepted": 2,
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

The server rejects sessions that are older than 15 minutes, overlap an existing session for the same user, or are exact duplicates. The response always returns `200` — individual rejections are surfaced in the `rejected` array, not as HTTP errors.

Categories sent by the client: `productive`, `distraction`, `neutral`, `unknown`.

**Script:** `scripts/06_pc_send_report.sh`

---

## 7. End-to-end simulation

`scripts/07_full_flow.sh` chains the complete flow in a single script: token request → PC link → status check → session report. Run it against a local server to validate the full integration before implementing the frontend.

```bash
cd app-tracker-server
uv run tracker-server &   # start the server
./scripts/07_full_flow.sh
```

---

## Token lifecycle summary

```
Browser                        Server                        Desktop PC
  |                              |                               |
  | [page load — no token]       |                               |
  |-- POST /auth/token --------->|                               |
  |<- {token:"A3F2B1C9",        |                               |
  |    status:"pending"} --------|                               |
  | localStorage.set(token)      |                               |
  |                              |                               |
  |-- GET /stream (SSE) -------->|                               |
  |   waiting...                 |<-- tracker link A3F2B1C9 -----|
  |                              |    POST /auth/link            |
  |<- data:{status:"linked"} ----|                               |
  | localStorage.set(expires_at) |                               |
  |                              |                               |
  |-- GET /leaderboard           |                               |
  |   Authorization: Bearer ···->|                               |
  |<- leaderboard data ----------|                               |
  |                              |                               |
  | [later — hoursLeft < 24]     |                               |
  |-- POST /auth/refresh ------->|                               |
  |<- {expires_at: +7 days} -----|                               |
  | localStorage.set(expires_at) |                               |
  |                              |                               |
  | [page load — valid token]    |                               |
  |   skip pairing, check expiry |                               |
  |-- GET /leaderboard           |                               |
  |   Authorization: Bearer ···->|                               |
  |<- leaderboard data ----------|                               |
```
