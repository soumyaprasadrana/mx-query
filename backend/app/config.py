"""Backend settings — single `get_settings()` accessor, no raw `os.environ` reads
elsewhere (mirrors `maximo-playbook-platform`'s convention)."""
from __future__ import annotations

from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_prefix="MQB_", env_file=".env", extra="ignore")

    # `app_name` is public-facing now (GET /api/version, shown in the UI) —
    # the product's actual name, not the internal package/repo name.
    app_name: str = "mxQuery"
    app_version: str = "1.2.0"
    api_prefix: str = "/api"
    serve_frontend: bool = True

    log_level: str = "info"

    # AES-256-GCM key for tenant API-key-at-rest encryption (see crypto.py). Blank
    # falls back to a machine-local key — fine for single-user dev, must be set
    # explicitly for any shared/production deployment.
    session_encryption_key: str = ""

    # Per-tenant metadata sync dirs live under <tenant_data_root>/<tenant_id>/{data,logs}.
    tenant_data_root: str = "./data/tenants"
    tenant_db_path: str = "./data/tenants.db"

    # maximo-mcp-server spawn target. Pinned to 1.4.6 (public npm release —
    # confirmed published: `npm view @soumyaprasadrana/maximo-mcp-server versions`
    # includes 1.4.6). Docs-only patch per the package maintainer (a stale/
    # incorrect README section fixed) — no tool/schema/behavior change.
    # Checked, not just taken on faith: `npm view ...@1.4.5 readme` vs
    # `...@1.4.6 readme` came back byte-identical, so whatever was fixed isn't
    # in the field `npm view readme` surfaces (could be CHANGELOG.md or a
    # section that normalized to the same text) — flagging that rather than
    # asserting a diff I couldn't actually see. No `client.py` changes.
    #
    # Previously pinned 1.4.5, which added a parent-level
    # `domaininternalwhere` on `os_query_builder` (still present in 1.4.6).
    # See docs/DECISIONS.md MQB-005 for the full version history. Override
    # via MQB_MCP_NPM_SPEC for local dev against a different build.
    mcp_npm_spec: str = "@soumyaprasadrana/maximo-mcp-server@1.4.6"
    # Escape hatch for local dev: `node <mcp_cli_path> <flags>` instead of npx.
    mcp_cli_path: str = ""

    mcp_warmup_timeout_s: float = 600.0
    # Idle-reap window for warm per-tenant clients. Tenants are fewer and
    # longer-lived than playbook-platform's per-user sessions, so this defaults
    # higher than that project's per-user value (see docs/pm/BACKLOG.md).
    mcp_warm_idle_s: float = 1800.0

    # Assist inference now goes through `app/llm/client.py` (litellm), not a
    # hardcoded Ollama pipe. This is the operator's deploy-time DEFAULT
    # provider (set via env, e.g. in docker-compose) — a customer can
    # override it at runtime from the admin-gated Settings screen, which
    # stores its own encrypted-at-rest row in the `llm_config` table
    # (db.get_llm_config wins over these defaults when present; see
    # docs/DECISIONS.md MQB-006). Left defaulting to local Ollama so existing
    # dev setups keep working with zero config changes.
    #
    # `llm_model` is a litellm model string: "openai/gpt-4o-mini",
    # "anthropic/claude-3-5-sonnet-20241022", "ollama/qwen2.5:1.5b",
    # "azure/<deployment>", or "openai/<name>" + `llm_api_base` for any
    # OpenAI-compatible endpoint (LM Studio, vLLM, Groq, OpenRouter, ...).
    llm_model: str = "ollama/qwen2.5:1.5b"
    llm_api_key: str = ""
    llm_api_base: str = "http://127.0.0.1:11434"
    llm_api_version: str = ""
    assist_timeout_s: float = 120.0

    # Gates the admin-only LLM Settings screen (POST /api/admin/login) and
    # the config-write endpoints (PUT/DELETE /api/llm/config, .../test).
    # Blank disables admin login entirely — the app still works, but the LLM
    # config can then only be set via these env vars (no UI path exists to
    # change it), which is intentional: no password configured = no login
    # surface to attack. Single shared operator secret, not a user table —
    # this app has one admin, not many (see docs/DECISIONS.md MQB-006).
    admin_password: str = ""
    admin_session_ttl_s: float = 43200.0  # 12h sliding idle window

    # Assist conversation memory: a wizard run's Assist calls share one
    # server-side message history (app/llm/sessions.py) instead of each step
    # starting a fresh 2-message exchange with no memory of earlier picks.
    # Idle-reaped the same way as the MCP warm-client pool (mcp_warm_idle_s
    # above) — "a wizard session," not a durable record, so a short idle
    # window is correct, not a bug. `assist_session_max_turns` bounds how
    # many past turns get replayed into every new call (context size/cost),
    # trimming oldest first.
    assist_session_idle_s: float = 600.0  # 10 min
    assist_session_max_turns: int = 16


@lru_cache
def get_settings() -> Settings:
    return Settings()
