import re

PROJECT_TITLE_MAX_LENGTH = 200
_SENTENCE_END = re.compile(r"[.!?。！？]")
_WHITESPACE = re.compile(r"\s+")


def normalize_single_line(value: str) -> str:
    return _WHITESPACE.sub(" ", value).strip()


def derive_project_title(
    topic: str,
    *,
    max_length: int = PROJECT_TITLE_MAX_LENGTH,
) -> str:
    """Derive a deterministic, Unicode-safe working title from a topic."""
    meaningful_line = next(
        (normalize_single_line(line) for line in topic.splitlines() if line.strip()),
        normalize_single_line(topic),
    )
    sentence_end = _SENTENCE_END.search(meaningful_line)
    candidate = (
        meaningful_line[: sentence_end.end()]
        if sentence_end is not None
        else meaningful_line
    )
    if not candidate:
        raise ValueError("A valid topic must produce a non-empty project title.")
    if len(candidate) <= max_length:
        return candidate

    available = max(1, max_length - 1)
    prefix = candidate[:available].rstrip()
    if available < len(candidate) and not candidate[available].isspace():
        word_boundary = prefix.rfind(" ")
        if word_boundary > max(1, available // 2):
            prefix = prefix[:word_boundary]
    prefix = prefix.rstrip(" ,;:-") or candidate[:available]
    return f"{prefix}…"
