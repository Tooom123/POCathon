import subprocess

from tracker.poller.base import BasePoller


class LinuxPoller(BasePoller):
    """Active window detection via xdotool (requires: sudo apt install xdotool)."""

    def get_active_app(self) -> str:
        """Return the active window name on Linux/X11."""
        win_id = subprocess.run(
            ["xdotool", "getactivewindow"],
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
        return subprocess.run(
            ["xdotool", "getwindowname", win_id],
            capture_output=True,
            text=True,
            timeout=2,
        ).stdout.strip()
