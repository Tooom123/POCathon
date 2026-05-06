"""
Automatic focus sync via Socket.io.

Watches the classified window activity and emits start_focus / stop_focus
to the game server whenever the productive state changes.
"""
import os
import threading
import socketio

_sio = socketio.Client(reconnection=True, reconnection_attempts=0, logger=False, engineio_logger=False)
_connected = False
_is_focusing = False
_lock = threading.Lock()

LOBBY_SERVER_URL = os.environ.get("FOCUS_SOCKET_URL", "http://localhost:3001")
PLAYER_NAME = os.environ.get("FOCUS_PLAYER_NAME", "Tracker")


def _connect():
    global _connected
    try:
        _sio.connect(LOBBY_SERVER_URL, wait_timeout=5)
        _connected = True
    except Exception:
        _connected = False


@_sio.event
def connect():
    global _connected
    _connected = True
    _sio.emit("join_lobby", {
        "playerName": PLAYER_NAME,
        "lobbyName": None,
        "ownedAnimals": [],
        "islandLevel": 1,
        "placedDecors": [],
        "totalWorkSeconds": 0,
    })


@_sio.event
def disconnect():
    global _connected
    _connected = False


def start_background(player_name: str | None = None) -> None:
    """Connect to the game server in a background thread."""
    global PLAYER_NAME
    if player_name:
        PLAYER_NAME = player_name
    t = threading.Thread(target=_connect, daemon=True)
    t.start()


def notify(is_productive: bool) -> None:
    """Call each poll cycle with whether the current app is classified productive."""
    global _is_focusing
    if not _connected:
        return
    with _lock:
        if is_productive and not _is_focusing:
            _sio.emit("start_focus")
            _is_focusing = True
        elif not is_productive and _is_focusing:
            _sio.emit("stop_focus")
            _is_focusing = False
