import textwrap
from pathlib import Path

import pytest
import yaml

from tracker.classifier.classifier import Classifier


@pytest.fixture()
def tmp_config(tmp_path: Path) -> Path:
    cfg = tmp_path / "config.yaml"
    cfg.write_text(textwrap.dedent("""
        productive:
          - Code
          - Terminal
        distraction:
          - YouTube
        neutral:
          - Finder
    """))
    return cfg


def test_productive_match(tmp_config):
    c = Classifier(tmp_config)
    assert c.classify("Visual Studio Code") == "productive"


def test_distraction_match(tmp_config):
    c = Classifier(tmp_config)
    assert c.classify("YouTube - Mozilla Firefox") == "distraction"


def test_neutral_match(tmp_config):
    c = Classifier(tmp_config)
    assert c.classify("Finder") == "neutral"


def test_unknown(tmp_config):
    c = Classifier(tmp_config)
    assert c.classify("SomeRandomApp") == "unknown"


def test_case_insensitive(tmp_config):
    c = Classifier(tmp_config)
    assert c.classify("TERMINAL") == "productive"


def test_first_match_wins(tmp_path):
    cfg = tmp_path / "config.yaml"
    cfg.write_text(textwrap.dedent("""
        productive:
          - Slack
        distraction:
          - Slack
    """))
    c = Classifier(cfg)
    assert c.classify("Slack") == "productive"
