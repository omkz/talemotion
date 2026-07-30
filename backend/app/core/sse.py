import base64

from app.schemas.scene_run import SceneRunEvent


def format_sse_event(event: SceneRunEvent) -> str:
    payload = event.model_dump_json(exclude_none=True)
    return f"event: {event.type}\ndata: {payload}\n\n"


def encode_media_key(key: str) -> str:
    return base64.urlsafe_b64encode(key.encode("utf-8")).decode("ascii").rstrip("=")


def decode_media_key(encoded_key: str) -> str:
    if not encoded_key or len(encoded_key) > 4096:
        raise ValueError("Invalid media key.")
    try:
        padded = encoded_key + "=" * (-len(encoded_key) % 4)
        key = base64.b64decode(padded, altchars=b"-_", validate=True).decode("utf-8")
    except (ValueError, UnicodeDecodeError) as error:
        raise ValueError("Invalid media key.") from error
    if encode_media_key(key) != encoded_key:
        raise ValueError("Invalid media key.")
    return key
