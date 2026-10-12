from zoneinfo import ZoneInfo, ZoneInfoNotFoundError

DEFAULT_TIMEZONE = "Europe/Moscow"


def validate_timezone(value: str) -> str:
    normalized = value.strip()
    try:
        ZoneInfo(normalized)
    except ZoneInfoNotFoundError as exc:
        raise ValueError("Unknown IANA timezone.") from exc
    return normalized
