"""Single-operator admin auth gating the LLM Settings screen.

Not a user table / multi-account auth system — this app has one admin (the
person who deployed it), so a shared password (`MQB_ADMIN_PASSWORD`) plus an
opaque bearer session token is enough. Sessions live in-memory only (same
lifetime assumption as `mcp/manager.py`'s warm-client pool): a backend
restart logs the admin out, which is an acceptable tradeoff for a
config-gating screen, not a data-loss risk.

Blank `MQB_ADMIN_PASSWORD` disables login entirely (`/api/admin/login`
always 404s) rather than accepting an empty password — no operator secret
configured means no login surface to attack; the LLM config can then only be
set via env vars. See docs/DECISIONS.md MQB-006.
"""
from __future__ import annotations

import hmac
import secrets
import time

from fastapi import Cookie, HTTPException

from app.config import get_settings
from app.errors import error_body

COOKIE_NAME = "mqb_admin_session"

# token -> expiry (epoch seconds). Sliding: touched on every authenticated
# request via `require_admin`.
_sessions: dict[str, float] = {}


def admin_enabled() -> bool:
    return bool(get_settings().admin_password)


def verify_password(candidate: str) -> bool:
    expected = get_settings().admin_password
    if not expected:
        return False
    return hmac.compare_digest(candidate.encode("utf-8"), expected.encode("utf-8"))


def create_session() -> str:
    token = secrets.token_urlsafe(32)
    _sessions[token] = time.monotonic() + get_settings().admin_session_ttl_s
    return token


def destroy_session(token: str | None) -> None:
    if token:
        _sessions.pop(token, None)


def is_valid(token: str | None) -> bool:
    if not token:
        return False
    expiry = _sessions.get(token)
    if expiry is None:
        return False
    if expiry < time.monotonic():
        _sessions.pop(token, None)
        return False
    _sessions[token] = time.monotonic() + get_settings().admin_session_ttl_s
    return True


def require_admin(mqb_admin_session: str | None = Cookie(default=None)) -> None:
    """FastAPI dependency — raises 401 unless the request carries a live
    admin session cookie. Use on every LLM-config write/test endpoint."""
    if not is_valid(mqb_admin_session):
        raise HTTPException(
            status_code=401,
            detail=error_body("admin_auth_required", "Admin login required."),
        )
