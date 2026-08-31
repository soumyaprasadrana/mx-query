"""Admin login gating the LLM Settings screen (see `app/admin.py`).

No account system — one shared password from `MQB_ADMIN_PASSWORD`. Login
sets an httpOnly session cookie; nothing else in the app is behind auth,
this exists purely so a customer's end users can't repoint the app's LLM
spend/provider without the operator's password.
"""
from __future__ import annotations

from fastapi import APIRouter, Cookie, Response
from pydantic import BaseModel

from app import admin
from app.errors import error_response
from app.observability import get_logger

logger = get_logger("app.routes.admin")
router = APIRouter()


class LoginRequest(BaseModel):
    password: str


@router.get("/admin/session")
async def session_status(mqb_admin_session: str | None = Cookie(default=None)) -> dict:
    """Public — lets the frontend decide whether to show the unlocked
    Settings screen or the login button, without exposing the password."""
    return {"enabled": admin.admin_enabled(), "authenticated": admin.is_valid(mqb_admin_session)}


@router.post("/admin/login")
async def login(body: LoginRequest, response: Response):
    if not admin.admin_enabled():
        return error_response(404, "admin_disabled", "Admin login is not configured on this deployment.")
    if not admin.verify_password(body.password):
        logger.warning("admin_login_failed")
        return error_response(401, "invalid_password", "Incorrect password.")
    token = admin.create_session()
    response.set_cookie(
        admin.COOKIE_NAME,
        token,
        httponly=True,
        samesite="lax",
        max_age=None,  # session cookie; server-side TTL still enforced
    )
    logger.info("admin_login_ok")
    return {"authenticated": True}


@router.post("/admin/logout")
async def logout(response: Response, mqb_admin_session: str | None = Cookie(default=None)):
    admin.destroy_session(mqb_admin_session)
    response.delete_cookie(admin.COOKIE_NAME)
    return {"authenticated": False}
