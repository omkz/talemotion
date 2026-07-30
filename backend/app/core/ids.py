from datetime import UTC, datetime
from uuid import uuid4


def new_resource_id(prefix: str) -> str:
    """Return an opaque, prefixed resource identifier."""
    return f"{prefix}_{uuid4().hex}"


def utc_now() -> datetime:
    """Return the current timezone-aware UTC timestamp."""
    return datetime.now(UTC)
