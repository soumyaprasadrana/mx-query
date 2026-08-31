"""Saved query library (docs/DECISIONS.md MQB-010) — per-tenant folders +
tags over the JSON payload the frontend's existing Export already produces.
App-level CRUD, not a Maximo/OSLC domain endpoint (MQB-001) — same category
as the tenant CRUD endpoints themselves (create/list/get/delete), just for a
different app resource. This backend never interprets `payload`'s internal
shape, same "store JSON opaquely" discipline as `llm_config`/`theme_pack`.

No admin gating: unlike LLM config/theme (operator infra), this is end-user
content — anyone using the app can save/browse/delete their own queries.

`folderId: null` means **Stash**, the always-present default bucket — not a
real database row, so it can never be renamed or deleted; a folder's own
delete unfiles its contents into Stash rather than destroying them (schema-
level `ON DELETE SET NULL`, see `db.py`).

Bodies here are raw `dict[str, Any]` with manual validation, not strict
Pydantic models — `folderId` needs a real tri-state ("field omitted" = leave
unchanged vs. "field explicitly null" = move to Stash) that a plain Optional
Pydantic field can't express, same reasoning as `routes/llm.py`/`theme.py`.
"""
from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, Query

from app import db
from app.errors import error_response
from app.observability import get_logger
from app.routes.deps import get_tenant_or_404

logger = get_logger("app.routes.saved_queries")
router = APIRouter()

_NAME_MAX = 120
_DESC_MAX = 2000
_TAG_MAX = 40


def _valid_name(v: Any) -> bool:
    return isinstance(v, str) and 1 <= len(v.strip()) <= _NAME_MAX


def _valid_tags(v: Any) -> bool:
    return isinstance(v, list) and all(isinstance(t, str) and len(t) <= _TAG_MAX for t in v)


# ---------------------------------------------------------------------------
# Folders
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/saved-query-folders")
async def list_folders(tenant=Depends(get_tenant_or_404)) -> list[dict]:
    return [f.public() for f in db.list_saved_query_folders(tenant.id)]


@router.post("/tenants/{tenant_id}/saved-query-folders", status_code=201)
async def create_folder(body: dict[str, Any], tenant=Depends(get_tenant_or_404)):
    name = body.get("name")
    if not _valid_name(name):
        return error_response(400, "folder_bad_name", f"name must be 1-{_NAME_MAX} characters")
    parent_id = body.get("parentId")
    if parent_id is not None and db.get_saved_query_folder(tenant.id, parent_id) is None:
        return error_response(400, "folder_bad_parent", f"no folder '{parent_id}' in this tenant")
    folder = db.create_saved_query_folder(tenant.id, name.strip(), parent_id)
    logger.info("saved_query_folder_created tenant=%s id=%s", tenant.id, folder.id)
    return folder.public()


@router.patch("/tenants/{tenant_id}/saved-query-folders/{folder_id}")
async def rename_folder(folder_id: str, body: dict[str, Any], tenant=Depends(get_tenant_or_404)):
    if "name" in body and not _valid_name(body["name"]):
        return error_response(400, "folder_bad_name", f"name must be 1-{_NAME_MAX} characters")
    parent_id = body.get("parentId", ...)  # ... = key absent = leave unchanged
    if parent_id not in (..., None) and db.get_saved_query_folder(tenant.id, parent_id) is None:
        return error_response(400, "folder_bad_parent", f"no folder '{parent_id}' in this tenant")
    if parent_id == folder_id:
        return error_response(400, "folder_bad_parent", "a folder cannot be its own parent")
    folder = db.update_saved_query_folder(
        tenant.id, folder_id,
        name=body["name"].strip() if "name" in body else None,
        parent_id=parent_id,
    )
    if folder is None:
        return error_response(404, "not_found", f"no folder '{folder_id}' in this tenant")
    return folder.public()


@router.delete("/tenants/{tenant_id}/saved-query-folders/{folder_id}", status_code=204)
async def delete_folder(folder_id: str, tenant=Depends(get_tenant_or_404)) -> None:
    db.delete_saved_query_folder(tenant.id, folder_id)


# ---------------------------------------------------------------------------
# Saved queries
# ---------------------------------------------------------------------------

@router.get("/tenants/{tenant_id}/saved-queries")
async def list_queries(
    tenant=Depends(get_tenant_or_404),
    q: str | None = Query(default=None, description="substring match on name/description"),
    tag: str | None = None,
    osName: str | None = None,
    folderId: str | None = Query(default=None, description='"stash" for unfiled only; omit for all folders'),
) -> list[dict]:
    folder_filter: Any = db.ANY_FOLDER
    if folderId is not None:
        folder_filter = None if folderId == "stash" else folderId
    results = db.list_saved_queries(tenant.id, q=q, tag=tag, os_name=osName, folder_id=folder_filter)
    return [r.public(include_payload=False) for r in results]


@router.get("/tenants/{tenant_id}/saved-queries/tags")
async def list_tags(tenant=Depends(get_tenant_or_404)) -> list[str]:
    return db.list_saved_query_tags(tenant.id)


@router.delete("/tenants/{tenant_id}/saved-queries")
async def clear_queries(
    tenant=Depends(get_tenant_or_404),
    folderId: str = Query(..., description='"stash", "all", or a real folder id — required, no silent-wipe default'),
) -> dict:
    """Bulk clear — the single endpoint for "empty Stash" / "delete every
    saved query" / "empty this one folder" (folder row itself untouched).
    `folderId` is required (no default = every query) specifically so a
    client can't wipe a tenant's whole library by omitting a parameter."""
    if folderId == "all":
        target: Any = db.ANY_FOLDER
    elif folderId == "stash":
        target = None
    else:
        if db.get_saved_query_folder(tenant.id, folderId) is None:
            return error_response(400, "query_bad_folder", f"no folder '{folderId}' in this tenant")
        target = folderId
    count = db.delete_saved_queries_bulk(tenant.id, folder_id=target)
    logger.info("saved_queries_bulk_deleted tenant=%s folderId=%s count=%s", tenant.id, folderId, count)
    return {"deleted": count}


@router.post("/tenants/{tenant_id}/saved-queries", status_code=201)
async def create_query(body: dict[str, Any], tenant=Depends(get_tenant_or_404)):
    name, os_name, payload = body.get("name"), body.get("osName"), body.get("payload")
    if not _valid_name(name):
        return error_response(400, "query_bad_name", f"name must be 1-{_NAME_MAX} characters")
    if not isinstance(os_name, str) or not os_name.strip():
        return error_response(400, "query_bad_os_name", "osName is required")
    if not isinstance(payload, dict):
        return error_response(400, "query_bad_payload", "payload must be an object")
    description = body.get("description") or ""
    if not isinstance(description, str) or len(description) > _DESC_MAX:
        return error_response(400, "query_bad_description", f"description must be at most {_DESC_MAX} characters")
    tags = body.get("tags") or []
    if not _valid_tags(tags):
        return error_response(400, "query_bad_tags", f"tags must be strings of at most {_TAG_MAX} characters")
    folder_id = body.get("folderId")
    if folder_id is not None and db.get_saved_query_folder(tenant.id, folder_id) is None:
        return error_response(400, "query_bad_folder", f"no folder '{folder_id}' in this tenant")
    saved = db.create_saved_query(
        tenant.id, folder_id=folder_id, name=name.strip(), description=description,
        os_name=os_name.strip(), payload=payload, tags=tags,
    )
    logger.info("saved_query_created tenant=%s id=%s os=%s", tenant.id, saved.id, saved.os_name)
    return saved.public(include_payload=True)


@router.get("/tenants/{tenant_id}/saved-queries/{query_id}")
async def get_query(query_id: str, tenant=Depends(get_tenant_or_404)):
    saved = db.get_saved_query(tenant.id, query_id)
    if saved is None:
        return error_response(404, "not_found", f"no saved query '{query_id}' in this tenant")
    return saved.public(include_payload=True)


@router.patch("/tenants/{tenant_id}/saved-queries/{query_id}")
async def update_query(query_id: str, body: dict[str, Any], tenant=Depends(get_tenant_or_404)):
    if "name" in body and not _valid_name(body["name"]):
        return error_response(400, "query_bad_name", f"name must be 1-{_NAME_MAX} characters")
    if "description" in body:
        d = body["description"]
        if not isinstance(d, str) or len(d) > _DESC_MAX:
            return error_response(400, "query_bad_description", f"description must be at most {_DESC_MAX} characters")
    if "payload" in body and not isinstance(body["payload"], dict):
        return error_response(400, "query_bad_payload", "payload must be an object")
    if "tags" in body and not _valid_tags(body["tags"]):
        return error_response(400, "query_bad_tags", f"tags must be strings of at most {_TAG_MAX} characters")
    folder_id = body.get("folderId", db.ANY_FOLDER)
    if folder_id not in (db.ANY_FOLDER, None) and db.get_saved_query_folder(tenant.id, folder_id) is None:
        return error_response(400, "query_bad_folder", f"no folder '{folder_id}' in this tenant")
    if "osName" in body and not (isinstance(body["osName"], str) and body["osName"].strip()):
        return error_response(400, "query_bad_os_name", "osName must be a non-empty string")

    saved = db.update_saved_query(
        tenant.id, query_id,
        name=body["name"].strip() if "name" in body else None,
        description=body.get("description"),
        folder_id=folder_id,
        os_name=body["osName"].strip() if "osName" in body else None,
        payload=body.get("payload"),
        tags=body.get("tags"),
    )
    if saved is None:
        return error_response(404, "not_found", f"no saved query '{query_id}' in this tenant")
    return saved.public(include_payload=True)


@router.delete("/tenants/{tenant_id}/saved-queries/{query_id}", status_code=204)
async def delete_query(query_id: str, tenant=Depends(get_tenant_or_404)) -> None:
    db.delete_saved_query(tenant.id, query_id)
