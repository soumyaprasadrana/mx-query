"""Wizard's optional "Assist" feature (frontend/src/lib/assist.ts) — proxies
step-scoped, schema-constrained inference through `app/llm/client.py`
(litellm), so any provider an admin configures in Settings works
transparently. Not an MCP tool call — Assist has nothing to do with a
Maximo tenant or `os_query_builder` (docs/DECISIONS.md MQB-001 governs
OSLC/tool traffic, not this).

The prompt/schema/candidate-list-validation logic all stays in the frontend
(`assist.ts`) — this route is a dumb forward-and-return-unchanged pipe, same
"never fabricate" discipline as the MCP proxy. It never falls back to a
default provider on its own: if nothing is configured, `assist_health`
reports unavailable and `assist_chat` 409s, per docs/DECISIONS.md MQB-006 —
Assist is opt-in and gated on an admin having set up a provider.

`POST /assist/chat` is stateless (one step, one exchange, no memory — the
original contract). `POST /assist/session*` is the same inference wrapped
with server-side conversation memory for one wizard run (`app/llm/sessions.py`,
docs/DECISIONS.md MQB-007) — a step's Assist call can then see what earlier
steps already decided instead of starting fresh every time. Both call the
same `_run_chat` helper so schema/error handling can't drift between them.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter

from app.config import get_settings
from app.errors import error_response
from app.llm import client as llm_client
from app.llm import sessions as assist_sessions
from app.llm.errors import LLMError
from app.observability import get_logger

logger = get_logger("app.routes.assist")
router = APIRouter()


@router.get("/assist/health")
async def assist_health():
    """Cheap, no-inference check: is a provider configured at all. Kept as
    its own endpoint (distinct from `GET /api/llm/config`) so the wizard's
    `ensureAssistModel()` has one call that answers "can I use Assist right
    now" without needing to know about admin/config concepts."""
    status = llm_client.status()
    if not status["configured"]:
        return {
            "available": False,
            "model": None,
            "reason": "No LLM provider is configured. Ask an admin to set one up in Settings.",
        }
    return {"available": True, "model": status["model"], "reason": None}


async def _run_chat(messages: list[dict[str, Any]], body: dict[str, Any]) -> str:
    options = body.get("options") or {}
    return await llm_client.chat(
        messages,
        response_schema=body.get("format"),
        temperature=options.get("temperature"),
        max_tokens=options.get("max_tokens"),
        timeout=get_settings().assist_timeout_s,
    )


@router.post("/assist/chat")
async def assist_chat(body: dict[str, Any]):
    """Forward `{messages, format, options}` to the configured provider via
    litellm and return `{content}` — the model's raw text (JSON string when
    `format` was set). `format` is a JSON-Schema-style object, mapped onto
    litellm's `response_format=json_schema`; `options` carries
    provider-neutral `temperature`/`max_tokens`. No memory between calls —
    use `/assist/session*` for a multi-step wizard run."""
    messages = body.get("messages", [])
    logger.info("assist_chat_begin step=%s", body.get("step") or "-")
    try:
        content = await _run_chat(messages, body)
    except LLMError as exc:
        return error_response(exc.status_code, exc.code, exc.message)
    return {"content": content}


@router.post("/assist/session")
async def create_assist_session():
    """Start a wizard-run-scoped Assist conversation. The frontend calls this
    once (lazily, on first Assist use) and reuses the id for every step until
    the wizard closes; the backend auto-deletes it after
    `MQB_ASSIST_SESSION_IDLE_S` of no chat activity regardless."""
    session_id = assist_sessions.create_session()
    return {"sessionId": session_id, "idleTimeoutS": get_settings().assist_session_idle_s}


@router.delete("/assist/session/{session_id}", status_code=204)
async def end_assist_session(session_id: str) -> None:
    """Explicit cleanup when the wizard closes normally — best-effort; a
    session that's never explicitly deleted (tab closed, crash) still goes
    away via the idle reaper, so this endpoint failing/being skipped is not
    a leak, just a slightly later one."""
    assist_sessions.delete_session(session_id)


_MEMORY_LINE_CAP = 300  # defensive cap — see `memory` note below


@router.post("/assist/session/{session_id}/chat")
async def assist_session_chat(session_id: str, body: dict[str, Any]):
    """Same body/response contract as `/assist/chat`, but replays this
    session's prior turns between the current step's system message and its
    new user message — never the prior steps' own system messages (see
    module docstring and `sessions.py` for why).

    `body.memory`, if present, is a short client-supplied string describing
    *this* turn ("[fields] need: asset number and status") — stored in place
    of the actual user message for future replay. This matters: the actual
    user message carries the full candidate catalog for this step (every OS
    hit, every field, every relationship — sometimes hundreds of entries),
    which is only useful for THIS call's own decision. Storing it verbatim
    would mean every later step in the wizard re-pays for every earlier
    step's catalog, compounding turn over turn — real cost against a paid
    provider's budget, and a fast way to blow a small local model's context
    window. The reply (`content`) doesn't need the same treatment — it's
    already small, schema-constrained JSON (e.g. `{"fields":["assetnum"]}`),
    not a catalog. Falls back to storing the raw user message if `memory` is
    omitted (e.g. a direct API caller not using the wizard's convention)."""
    if not assist_sessions.exists(session_id):
        return error_response(
            404,
            "assist_session_not_found",
            "This Assist session has expired or does not exist. Start a new one.",
        )
    incoming = body.get("messages", [])
    system_messages = [m for m in incoming if m.get("role") == "system"]
    turn_messages = [m for m in incoming if m.get("role") != "system"]
    history = assist_sessions.get_history(session_id) or []
    full_messages = [*system_messages, *history, *turn_messages]

    logger.info("assist_session_chat_begin session=%s step=%s", session_id, body.get("step") or "-")
    try:
        content = await _run_chat(full_messages, body)
    except LLMError as exc:
        return error_response(exc.status_code, exc.code, exc.message)

    memory = body.get("memory")
    to_store = (
        [{"role": "user", "content": str(memory)[:_MEMORY_LINE_CAP]}]
        if isinstance(memory, str) and memory.strip()
        else turn_messages
    )
    assist_sessions.append_turn(session_id, to_store, content)
    return {"content": content}
