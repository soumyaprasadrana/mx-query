"""Assist conversation memory — one wizard run's worth of chat history, kept
server-side so each wizard step's Assist call can see what earlier steps
already decided, instead of starting a brand-new 2-message exchange every
time (the stateless `/api/assist/chat` behavior, kept as-is for callers that
don't want memory).

In-memory only, same lifetime assumption as `mcp/manager.py`'s warm-client
pool and `admin.py`'s login sessions: a backend restart drops all Assist
sessions, which is fine — "a wizard session," not a durable record. Idle
sessions (no chat turn for `assist_session_idle_s`) are swept by a periodic
task in `app.py`'s lifespan, mirroring the MCP warm-client reaper.

Each stored turn is `(role, content)` pairs from *user and assistant* turns
only — never the per-step `system` message. System prompts are step-specific
instructions ("pick fields", "write a WHERE clause"), not part of the
conversation's identity; replaying five different system messages back at a
provider is undefined behavior for most chat APIs. Instead, every call
supplies its own step's system message fresh, with the session's prior
user/assistant turns inserted between it and the new user message — the
model sees what was already decided without the system-prompt pileup.
"""
from __future__ import annotations

import time
import uuid
from dataclasses import dataclass, field

from app.config import get_settings


@dataclass
class AssistSession:
    history: list[dict[str, str]] = field(default_factory=list)
    last_active: float = field(default_factory=time.monotonic)


_sessions: dict[str, AssistSession] = {}


def create_session() -> str:
    session_id = uuid.uuid4().hex
    _sessions[session_id] = AssistSession()
    return session_id


def exists(session_id: str) -> bool:
    return session_id in _sessions


def touch(session_id: str) -> None:
    session = _sessions.get(session_id)
    if session is not None:
        session.last_active = time.monotonic()


def get_history(session_id: str) -> list[dict[str, str]] | None:
    session = _sessions.get(session_id)
    if session is None:
        return None
    touch(session_id)
    return list(session.history)


def append_turn(session_id: str, turn_messages: list[dict[str, str]], reply: str) -> None:
    """`turn_messages` is this call's non-system messages (today, just the
    one user message) — appended alongside the model's reply, then trimmed
    to `assist_session_max_turns` (oldest first)."""
    session = _sessions.get(session_id)
    if session is None:
        return
    session.history.extend(turn_messages)
    session.history.append({"role": "assistant", "content": reply})
    max_messages = get_settings().assist_session_max_turns * 2
    if len(session.history) > max_messages:
        session.history = session.history[-max_messages:]
    session.last_active = time.monotonic()


def delete_session(session_id: str) -> None:
    _sessions.pop(session_id, None)


def sweep_idle(idle_s: float) -> int:
    """Drop sessions with no chat turn for `idle_s`. Returns how many were
    reaped, for the same log-if-nonzero pattern as the MCP warm-client
    reaper (`app.py:_warm_client_reaper`)."""
    now = time.monotonic()
    expired = [sid for sid, s in _sessions.items() if now - s.last_active > idle_s]
    for sid in expired:
        _sessions.pop(sid, None)
    return len(expired)
