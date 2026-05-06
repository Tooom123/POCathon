import shutil
import subprocess

from tracker.poller.base import BasePoller


class LinuxPoller(BasePoller):
    """Active window detection for Linux/X11.

    Tries in order:
      1. xdotool   (X11, most reliable)
       2. xprop     (X11, ships with many distros by default)
      3. wmctrl     (X11 fallback)
    Install any one: sudo apt install xdotool
    """

    def get_active_app(self) -> str:
        """Return the active window title on Linux/X11."""
        if shutil.which("xdotool"):
            return self._via_xdotool()
        if shutil.which("xprop"):
            return self._via_xprop()
        if shutil.which("wmctrl"):
            return self._via_wmctrl()
        raise RuntimeError("No window detection tool found. Install xdotool: sudo apt install xdotool")

    def _via_xdotool(self) -> str:
        win_id = subprocess.run(
            ["xdotool", "getactivewindow"],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        return subprocess.run(
            ["xdotool", "getwindowname", win_id],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()

    def _via_xprop(self) -> str:
        # _NET_ACTIVE_WINDOW on the root window gives the active window XID
        root = subprocess.run(
            ["xprop", "-root", "_NET_ACTIVE_WINDOW"],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        # e.g. "_NET_ACTIVE_WINDOW(WINDOW): window id # 0x3a00003"
        parts = root.split()
        if not parts:
            return ""
        win_id = parts[-1]
        name_out = subprocess.run(
            ["xprop", "-id", win_id, "WM_NAME"],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        # e.g. 'WM_NAME(STRING) = "Visual Studio Code"'
        if '=' in name_out:
            return name_out.split('=', 1)[1].strip().strip('"')
        return ""

    def _via_wmctrl(self) -> str:
        # wmctrl -a requires a name; -l lists all windows with * for active
        out = subprocess.run(
            ["wmctrl", "-l"],
            capture_output=True, text=True, timeout=2,
        ).stdout
        # Active window id from xprop root
        root = subprocess.run(
            ["xprop", "-root", "_NET_ACTIVE_WINDOW"],
            capture_output=True, text=True, timeout=2,
        ).stdout.strip()
        parts = root.split()
        if not parts:
            return ""
        active_id = int(parts[-1], 16)
        for line in out.splitlines():
            cols = line.split(None, 3)
            if len(cols) < 4:
                continue
            try:
                if int(cols[0], 16) == active_id:
                    return cols[3]
            except ValueError:
                continue
        return ""
