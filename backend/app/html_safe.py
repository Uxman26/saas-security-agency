"""Escaping for user-supplied values placed into HTML.

Outbound email bodies are assembled as HTML strings, so any user-controlled value
interpolated into one is an injection point: a lead titled
``<a href="http://evil">Click here</a>`` becomes a working link inside a genuine,
correctly-signed message from the platform. Mail clients block scripts, but content
spoofing and phishing do not need scripts.

The React frontend escapes by default and uses no ``dangerouslySetInnerHTML``, so this
is specifically about the email/PDF templates.
"""

from __future__ import annotations

from html import escape
from typing import Any


def esc(value: Any) -> str:
    """Render a value as HTML-safe text. ``None`` becomes an empty string."""
    if value is None:
        return ""
    return escape(str(value), quote=True)


def esc_map(values: dict[str, Any]) -> dict[str, str]:
    """Escape every value in a template context.

    Use when filling a template with ``str.format`` so a forgotten field cannot
    reintroduce the hole.
    """
    return {k: esc(v) for k, v in values.items()}
