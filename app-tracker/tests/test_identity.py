import json
import uuid
from pathlib import Path
from unittest.mock import patch

from tracker.storage.identity import get_or_create_user_id


def test_creates_uuid_on_first_call(tmp_path):
    identity_file = tmp_path / "identity.json"
    with patch("tracker.storage.identity._identity_path", return_value=identity_file):
        user_id = get_or_create_user_id()

    assert identity_file.exists()
    uuid.UUID(user_id)  # raises if not a valid UUID


def test_returns_same_uuid_on_subsequent_calls(tmp_path):
    identity_file = tmp_path / "identity.json"
    with patch("tracker.storage.identity._identity_path", return_value=identity_file):
        first = get_or_create_user_id()
        second = get_or_create_user_id()

    assert first == second


def test_reads_existing_uuid(tmp_path):
    identity_file = tmp_path / "identity.json"
    existing = str(uuid.uuid4())
    identity_file.write_text(json.dumps({"user_id": existing}))

    with patch("tracker.storage.identity._identity_path", return_value=identity_file):
        result = get_or_create_user_id()

    assert result == existing
