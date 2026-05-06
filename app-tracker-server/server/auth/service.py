import secrets
import string
from datetime import datetime, timedelta, timezone

from server.storage.token_repository import AuthToken

TOKEN_CHARS = string.ascii_uppercase + string.digits
TOKEN_LENGTH = 8
PENDING_TTL_MINUTES = 10   # browser must have the PC link within 10 min
LINKED_TTL_DAYS = 7        # linked token stays valid 7 days; refreshable before expiry


def generate_token() -> str:
    """Return a random 8-character uppercase alphanumeric token."""
    return "".join(secrets.choice(TOKEN_CHARS) for _ in range(TOKEN_LENGTH))


def pending_expiry() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(minutes=PENDING_TTL_MINUTES)


def linked_expiry() -> datetime:
    return datetime.now(timezone.utc).replace(tzinfo=None) + timedelta(days=LINKED_TTL_DAYS)


def token_is_usable(token: AuthToken | None) -> bool:
    """Return True if the token is linked and not yet expired."""
    if token is None:
        return False
    return token.status == "linked" and token.expires_at > datetime.now(timezone.utc).replace(tzinfo=None)
