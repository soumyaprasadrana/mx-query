"""Admin-gated LLM provider config + the public "is Assist available"
status check. Backed by `app/llm/client.py` (litellm) — this route layer
only handles config CRUD and never talks to a provider SDK directly.

`GET /llm/config` is deliberately public (no secrets in the response) so
the frontend can gray out the Assist toggle for every visitor, not just the
admin — see docs/DECISIONS.md MQB-006 and docs/pm/CURSOR_PROMPT_LLM_SETTINGS.md.
"""
from __future__ import annotations

from fastapi import APIRouter, Depends
from pydantic import BaseModel

from app import crypto, db
from app.admin import require_admin
from app.errors import error_response
from app.llm import client as llm_client
from app.llm.errors import LLMError
from app.observability import get_logger

logger = get_logger("app.routes.llm")
router = APIRouter()


class SaveLLMConfigRequest(BaseModel):
    provider: str
    model: str
    apiKey: str | None = None  # blank/omitted keeps the previously stored key
    apiBase: str = ""
    apiVersion: str = ""


@router.get("/llm/config")
async def get_llm_config() -> dict:
    return llm_client.status()


@router.put("/llm/config", dependencies=[Depends(require_admin)])
async def save_llm_config(body: SaveLLMConfigRequest) -> dict:
    existing = db.get_llm_config()
    if body.apiKey:
        encrypted = crypto.encrypt_secret(body.apiKey)
    elif existing is not None:
        encrypted = existing.api_key_encrypted
    else:
        encrypted = ""
    db.set_llm_config(body.provider, body.model, encrypted, body.apiBase, body.apiVersion)
    logger.info("llm_config_saved provider=%s model=%s", body.provider, body.model)
    return llm_client.status()


@router.delete("/llm/config", status_code=204, dependencies=[Depends(require_admin)])
async def clear_llm_config() -> None:
    db.delete_llm_config()
    logger.info("llm_config_cleared")


@router.post("/llm/config/test", dependencies=[Depends(require_admin)])
async def test_llm_config():
    try:
        return await llm_client.test_connection()
    except LLMError as exc:
        return error_response(exc.status_code, exc.code, exc.message)
