from __future__ import annotations

import re


def sanitize_name(value: str, fallback: str = "parsed_tab") -> str:
    if not value:
        return fallback
    sanitized = re.sub(r"[^\w\s.-]", "", value, flags=re.UNICODE).strip()
    sanitized = re.sub(r"\s+", "_", sanitized)
    return sanitized or fallback


def build_json_filename(value: str, fallback: str = "parsed_tab") -> str:
    sanitized = sanitize_name(value, fallback)
    return f"{sanitized}.json"
