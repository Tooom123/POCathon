import subprocess

from tracker.poller.base import BasePoller


class MacOSPoller(BasePoller):
    """Active app detection via osascript (requires Accessibility permission)."""

    def get_active_app(self) -> str:
        """Return the frontmost application name on macOS."""
        result = subprocess.run(
            [
                "osascript",
                "-e",
                'tell application "System Events" to get name of first process whose frontmost is true',
            ],
            capture_output=True,
            text=True,
            timeout=2,
        )
        return result.stdout.strip()
