import json
import uuid
from pathlib import Path

from tracker.storage.db import get_db_path


def _identity_path() -> Path:
    """Return the path to the identity file, co-located with the database."""
    return get_db_path().parent / "identity.json"


def get_or_create_user_id() -> str:
    """Return the persistent user UUID, creating it on first call."""
    path = _identity_path()
    if path.exists():
        return json.loads(path.read_text())["user_id"]

    user_id = str(uuid.uuid4())
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps({"user_id": user_id}, indent=2))
    return user_id
