from abc import ABC, abstractmethod


class BasePoller(ABC):
    """Abstract interface for OS-level active window detection."""

    @abstractmethod
    def get_active_app(self) -> str:
        """Return the name of the currently active application."""
        ...
