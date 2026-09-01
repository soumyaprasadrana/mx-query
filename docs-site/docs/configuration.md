# Configuration

Environment variables, prefix `MQB_`. Local defaults work for a first run. Set `MQB_SESSION_ENCRYPTION_KEY` on any shared host.

| Variable | Default | What it does |
|---|---|---|
| `MQB_TENANT_DB_PATH` | `./data/tenants.db` | Tenant registry + LLM/theme config (sqlite) |
| `MQB_SESSION_ENCRYPTION_KEY` | machine-derived | AES key encrypting tenant API keys at rest. The fallback derives from the machine's own hostname - stable across restarts on one local machine, but a fresh random id on every `docker run`. In Docker, an unset key means one container's `add-tenant` cannot be decrypted by another container's server process. Always set this explicitly in Docker, and for any shared or hosted deployment either way. |
| `MQB_ADMIN_PASSWORD` | unset (admin UI disabled) | Gates the LLM/theme Settings screen. Leaving it blank disables the login screen entirely rather than accepting an empty password |
| `MQB_LLM_MODEL` | `ollama/qwen2.5:1.5b` | Deploy-time default AI provider for Assist - a [litellm](https://github.com/BerriAI/litellm) model string. This default is zero-setup, not recommended: `qwen2.5:1.5b` is too small to give good picks. Use `openai/gpt-4o-mini` or similar for Assist to actually be worth turning on. |
| `MQB_LLM_API_KEY` | unset | API key for the provider above, if it needs one |
| `MQB_LLM_API_BASE` | `http://127.0.0.1:11434` | Provider endpoint - only relevant for local/self-hosted providers like Ollama |
| `MQB_MCP_NPM_SPEC` | a pinned `maximo-mcp-server` version | Override for testing against a different build |
| `MQB_MCP_FORCE_NPX` | `false` | Always resolve `maximo-mcp-server` via `npx`, skipping the check for a matching global install on PATH. Useful on a dev machine with an unrelated/stale global install under the same name |
| `MQB_MCP_WARMUP_STALL_TIMEOUT_S` | `300` | The real guard on first-time metadata sync: errors out only once the sync reports no change (same stage/count/percentage) for this long - a genuine hang, not just a slow instance |
| `MQB_MCP_WARMUP_TIMEOUT_S` | `7200` | An outer sanity ceiling on top of the stall guard, in case a sync somehow keeps reporting *some* change forever without finishing. Raise it if a real environment's total sync time (not stall time) legitimately exceeds 2 hours |

An admin can override the LLM provider at runtime from the Settings screen
without touching any of these - the env vars above are just the deploy-time
default.

## Never point at real tenant data while testing

`MQB_TENANT_DB_PATH` holds real tenants' encrypted Maximo API keys and any
admin-set configuration. If you're scripting against a running instance for
testing or development, point this at a scratch file - not the database a
real deployment is using.
