"""Provider-agnostic LLM client — the ONLY place in this backend that
imports `litellm`. Everything upstream (routes/assist.py, routes/llm.py)
talks to `chat()`/`test_connection()`/`status()` and never sees a
provider-specific shape or exception (docs/DECISIONS.md MQB-006).

Config precedence: an admin-saved row in `db.llm_config` (encrypted API key,
same AES-256-GCM-at-rest pattern as tenant Maximo keys, see `crypto.py`)
always wins over the `MQB_LLM_*` env-var defaults in `config.py`. No row and
incomplete env defaults => `resolve_config()` returns None => every call
raises `LLMNotConfigured`, which routes/assist.py turns into "Assist is
off, ask an admin to configure a provider" rather than a raw error.
"""
from __future__ import annotations

import time
from dataclasses import dataclass
from typing import Any

import litellm
from litellm import exceptions as litellm_exceptions

from app import crypto, db
from app.config import get_settings
from app.llm.errors import LLMError, LLMNotConfigured
from app.observability import get_logger

logger = get_logger("app.llm")

# This backend calls one model at a time on demand (Assist's step-scoped
# picks) — no need for litellm's own verbose per-call debug logging.
litellm.suppress_debug_info = True


@dataclass
class ResolvedLLMConfig:
    provider: str
    model: str
    api_key: str
    api_base: str
    api_version: str
    source: str  # "db" (admin-set) | "env" (deploy-time default)


def resolve_config() -> ResolvedLLMConfig | None:
    row = db.get_llm_config()
    if row is not None:
        return ResolvedLLMConfig(
            provider=row.provider,
            model=row.model,
            api_key=crypto.decrypt_secret(row.api_key_encrypted) if row.api_key_encrypted else "",
            api_base=row.api_base,
            api_version=row.api_version,
            source="db",
        )

    settings = get_settings()
    if not settings.llm_model:
        return None
    # A local/no-auth endpoint (ollama/*, or any custom api_base someone
    # points at an unauthenticated OpenAI-compatible server) is usable
    # without a key; every other provider needs one to actually work.
    needs_key = not settings.llm_model.startswith("ollama/")
    if needs_key and not settings.llm_api_key:
        return None
    return ResolvedLLMConfig(
        provider="env",
        model=settings.llm_model,
        api_key=settings.llm_api_key,
        api_base=settings.llm_api_base,
        api_version=settings.llm_api_version,
        source="env",
    )


def is_configured() -> bool:
    return resolve_config() is not None


def status() -> dict:
    """Non-secret status for the public `GET /api/llm/config` — never
    includes the key, just enough for the UI to gate the Assist toggle."""
    cfg = resolve_config()
    if cfg is None:
        return {"configured": False, "provider": None, "model": None, "apiBaseSet": False, "source": None}
    return {
        "configured": True,
        "provider": cfg.provider,
        "model": cfg.model,
        "apiBaseSet": bool(cfg.api_base),
        "source": cfg.source,
    }


def _call_kwargs(cfg: ResolvedLLMConfig) -> dict[str, Any]:
    kwargs: dict[str, Any] = {"model": cfg.model}
    if cfg.api_key:
        kwargs["api_key"] = cfg.api_key
    if cfg.api_base:
        kwargs["api_base"] = cfg.api_base
    if cfg.api_version:
        kwargs["api_version"] = cfg.api_version
    return kwargs


def _map_error(exc: Exception) -> LLMError:
    if isinstance(exc, litellm_exceptions.AuthenticationError):
        return LLMError(401, "llm_auth_error", f"LLM provider rejected the API key: {exc}")
    if isinstance(exc, litellm_exceptions.RateLimitError):
        return LLMError(429, "llm_rate_limited", f"LLM provider rate-limited the request: {exc}")
    if isinstance(exc, litellm_exceptions.Timeout):
        return LLMError(504, "llm_timeout", f"LLM request timed out: {exc}")
    if isinstance(exc, litellm_exceptions.APIConnectionError):
        return LLMError(503, "llm_unavailable", f"Could not reach the LLM provider: {exc}")
    if isinstance(exc, litellm_exceptions.BadRequestError):
        return LLMError(400, "llm_bad_request", f"LLM provider rejected the request: {exc}")
    return LLMError(502, "llm_error", f"LLM call failed: {exc}")


def _is_schema_unsupported(exc: Exception) -> bool:
    text = str(exc).lower()
    return "response_format" in text or "json_schema" in text


async def chat(
    messages: list[dict[str, str]],
    *,
    response_schema: dict[str, Any] | None = None,
    schema_name: str = "response",
    temperature: float | None = None,
    max_tokens: int | None = None,
    timeout: float | None = None,
) -> str:
    """Provider-agnostic chat completion. Returns the assistant's text
    content (a JSON string when `response_schema` is set). Raises `LLMError`
    — never a raw litellm/provider exception — so callers have one error
    shape regardless of which provider is configured."""
    cfg = resolve_config()
    if cfg is None:
        raise LLMNotConfigured()

    kwargs = _call_kwargs(cfg)
    if temperature is not None:
        kwargs["temperature"] = temperature
    if max_tokens is not None:
        kwargs["max_tokens"] = max_tokens
    if timeout is not None:
        kwargs["timeout"] = timeout

    if response_schema is not None:
        kwargs["response_format"] = {
            "type": "json_schema",
            "json_schema": {"name": schema_name, "schema": response_schema, "strict": False},
        }

    try:
        resp = await litellm.acompletion(messages=messages, **kwargs)
    except Exception as exc:  # noqa: BLE001 - normalize every provider's own exception type
        if response_schema is not None and _is_schema_unsupported(exc):
            # This model/provider doesn't support schema-enforced output —
            # same "never trust the model blindly" discipline as the
            # frontend's own re-validation: fall back to a plain JSON-object
            # instruction rather than failing the whole wizard step.
            logger.info("llm_schema_fallback model=%s", cfg.model)
            return await _chat_json_object_fallback(messages, response_schema, kwargs)
        raise _map_error(exc) from exc

    content = resp.choices[0].message.content
    if not content:
        raise LLMError(502, "llm_empty_reply", "The model returned an empty reply.")
    return content


async def _chat_json_object_fallback(
    messages: list[dict[str, str]], response_schema: dict[str, Any], kwargs: dict[str, Any]
) -> str:
    schema_hint = {
        "role": "system",
        "content": f"Respond with ONLY a JSON object matching this schema, no prose: {response_schema}",
    }
    fallback_kwargs = dict(kwargs)
    fallback_kwargs["response_format"] = {"type": "json_object"}
    try:
        resp = await litellm.acompletion(messages=[schema_hint, *messages], **fallback_kwargs)
    except Exception as exc:  # noqa: BLE001
        raise _map_error(exc) from exc
    content = resp.choices[0].message.content
    if not content:
        raise LLMError(502, "llm_empty_reply", "The model returned an empty reply.")
    return content


async def test_connection() -> dict:
    """One minimal live call to confirm the configured provider/model/key
    actually works end to end. Costs a trivial amount of the provider's
    credit — admin-triggered only from the Settings screen, never automatic,
    so it doesn't silently burn a customer's budget."""
    cfg = resolve_config()
    if cfg is None:
        raise LLMNotConfigured()
    started = time.monotonic()
    reply = await chat(
        [{"role": "user", "content": "Reply with exactly: OK"}],
        max_tokens=8,
        timeout=30,
    )
    elapsed_ms = int((time.monotonic() - started) * 1000)
    return {
        "ok": True,
        "provider": cfg.provider,
        "model": cfg.model,
        "reply": reply.strip(),
        "elapsedMs": elapsed_ms,
    }
