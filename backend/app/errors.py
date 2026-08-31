"""Stable error envelope: {"error": {code, message, correlation_id, detail?}}.

Adapted verbatim from `maximo-playbook-platform/src/playbook/api/errors.py`.
`detail` may carry an unchanged MCP tool payload — never a fabricated one.
"""
from __future__ import annotations

from typing import Any

from fastapi.responses import JSONResponse

from app.observability import get_correlation_id


def error_body(code: str, message: str, detail: Any = None, **extra: Any) -> dict:
    err: dict[str, Any] = {"code": code, "message": message, "correlation_id": get_correlation_id()}
    if detail is not None:
        err["detail"] = detail
    err.update(extra)
    return {"error": err}


def error_response(status_code: int, code: str, message: str, detail: Any = None, **extra: Any) -> JSONResponse:
    return JSONResponse(status_code=status_code, content=error_body(code, message, detail, **extra))
