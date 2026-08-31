"""App-wide theme pack persistence (docs/DECISIONS.md MQB-008) — app chrome,
not a Maximo/OSLC API, same reasoning as `/api/llm/config` (MQB-006): one
instance-wide row, not tenant-scoped, no MCP tool involved.

The frontend (`frontend/src/lib/theme/`) owns the token schema and applies
packs as CSS variables — this route only stores/returns the pack JSON
verbatim after a light shape check. It never interprets individual tokens,
and never requires every key (the token set is expected to grow; merging a
partial pack over defaults is the frontend's job, not this route's).

`GET` is deliberately never 404: the frontend treats 404 specifically as
"this route doesn't exist yet, stay on localStorage" (see `api.ts`'s
`themeRequest`) — an empty `{pack: null, source: null}` 200 means "route
exists, no server override, keep using the browser pack," a different state.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends

from app import db
from app.admin import require_admin
from app.errors import error_response
from app.observability import get_logger

logger = get_logger("app.routes.theme")
router = APIRouter()

_SCHEMA_VERSION = 1
_REQUIRED_TOKENS = ("bg", "accent", "text")
_MAX_LABEL_LEN = 80


def _validate_pack(body: dict[str, Any]) -> str | None:
    """Returns an error message if the pack is malformed, else None. Mirrors
    `frontend/src/lib/theme/schema.ts`'s `ThemePack` shape but only checks
    what a truncated/hand-edited import could break, not full field parity —
    unknown keys pass through untouched for the frontend to merge."""
    if body.get("schemaVersion") != _SCHEMA_VERSION:
        return f"schemaVersion must be {_SCHEMA_VERSION}"
    if body.get("kind") not in ("light", "dark"):
        return 'kind must be "light" or "dark"'
    for field in ("id", "name"):
        value = body.get(field)
        if not isinstance(value, str) or not (1 <= len(value) <= _MAX_LABEL_LEN):
            return f"{field} must be a 1-{_MAX_LABEL_LEN} character string"
    tokens = body.get("tokens")
    if not isinstance(tokens, dict) or not all(isinstance(v, str) for v in tokens.values()):
        return "tokens must be an object of string values"
    missing = [k for k in _REQUIRED_TOKENS if k not in tokens]
    if missing:
        return f"tokens missing required key(s): {', '.join(missing)} — a truncated import wouldn't paint"
    return None


@router.get("/theme")
async def get_theme() -> dict:
    pack = db.get_theme_pack()
    return {"pack": pack, "source": "db" if pack is not None else None}


@router.put("/theme", dependencies=[Depends(require_admin)])
async def put_theme(body: dict[str, Any]):
    error = _validate_pack(body)
    if error:
        return error_response(400, "theme_bad_pack", error)
    db.set_theme_pack(body)
    logger.info("theme_pack_saved id=%s kind=%s", body.get("id"), body.get("kind"))
    return {"pack": body, "source": "db"}


@router.delete("/theme", status_code=204, dependencies=[Depends(require_admin)])
async def delete_theme() -> None:
    db.delete_theme_pack()
    logger.info("theme_pack_cleared")
