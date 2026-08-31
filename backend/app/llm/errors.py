"""Typed LLM errors — every provider litellm talks to gets normalized to one
of these by `app/llm/client.py`, so route handlers never branch on provider."""
from __future__ import annotations


class LLMError(Exception):
    def __init__(self, status_code: int, code: str, message: str):
        super().__init__(message)
        self.status_code = status_code
        self.code = code
        self.message = message


class LLMNotConfigured(LLMError):
    def __init__(self):
        super().__init__(
            409,
            "llm_not_configured",
            "No LLM provider is configured yet. Ask an admin to set one up in Settings.",
        )
