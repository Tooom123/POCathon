from pathlib import Path

import yaml

CONFIG_PATH = Path(__file__).parent.parent.parent / "config.yaml"

Category = str  # "productive" | "distraction" | "neutral" | "unknown"


class Classifier:
    """Maps app/window names to productivity categories using config.yaml rules."""

    def __init__(self, config_path: Path = CONFIG_PATH) -> None:
        """Load classification rules from the given config file."""
        with config_path.open() as f:
            raw: dict[str, list[str]] = yaml.safe_load(f)
        # Build ordered list of (category, pattern) for first-match evaluation
        self._rules: list[tuple[Category, str]] = [
            (category, pattern.lower())
            for category, patterns in raw.items()
            for pattern in patterns
        ]

    def classify(self, app_name: str) -> Category:
        """Return the category for app_name; 'unknown' if no rule matches."""
        lower = app_name.lower()
        for category, pattern in self._rules:
            if pattern in lower:
                return category
        return "unknown"
