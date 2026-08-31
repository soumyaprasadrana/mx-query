"""Minimal structured-ish logging with a request-scoped correlation id.

Deliberately smaller than `maximo-playbook-platform`'s `structlog`-based
module (dual console/JSON renderers, stdlib log routing) — this backend is a
thin proxy, not a platform with its own log-shipping concerns. Keeps the same
correlation-id contextvar pattern since `errors.py`'s envelope depends on it.
"""
from __future__ import annotations

import logging
import sys
import uuid
from contextvars import ContextVar

_correlation_id: ContextVar[str | None] = ContextVar("correlation_id", default=None)


def new_correlation_id() -> str:
    cid = uuid.uuid4().hex[:12]
    _correlation_id.set(cid)
    return cid


def set_correlation_id(cid: str) -> None:
    _correlation_id.set(cid)


def get_correlation_id() -> str | None:
    return _correlation_id.get()


class _CorrelationIdFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.correlation_id = get_correlation_id() or "-"
        return True


def configure_logging(level: str = "info") -> None:
    """Configure stdlib logging once at startup (idempotent)."""
    lvl = getattr(logging, level.upper(), logging.INFO)
    root = logging.getLogger()
    root.handlers.clear()
    root.setLevel(lvl)

    stream = logging.StreamHandler(sys.stdout)
    stream.addFilter(_CorrelationIdFilter())
    stream.setFormatter(
        logging.Formatter("%(asctime)s %(levelname)s [%(correlation_id)s] %(name)s: %(message)s")
    )
    root.addHandler(stream)

    for noisy in ("httpx", "httpcore"):
        logging.getLogger(noisy).setLevel(logging.WARNING)


def get_logger(name: str = "app") -> logging.Logger:
    return logging.getLogger(name)
