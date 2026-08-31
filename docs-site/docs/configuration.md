# Configuration

Environment variables, prefix `MQB_`. Local defaults work for a first run. Set `MQB_SESSION_ENCRYPTION_KEY` on any shared host.

| Variable | Default | What it does |
|---|---|---|
| `MQB_TENANT_DB_PATH` | `./data/tenants.db` | Tenant registry + LLM/theme config (sqlite) |
| `MQB_SESSION_ENCRYPTION_KEY` | machine-derived | AES key encrypting tenant API keys at rest — set this explicitly for any shared or hosted deployment |
| `MQB_ADMIN_PASSWORD` | unset (admin UI disabled) | Gates the LLM/theme Settings screen. Leaving it blank disables the login screen entirely rather than accepting an empty password |
| `MQB_LLM_MODEL` | `ollama/qwen2.5:1.5b` | Deploy-time default AI provider for Assist — a [litellm](https://github.com/BerriAI/litellm) model string. This default is zero-setup, not recommended: `qwen2.5:1.5b` is too small to give good picks. Use `openai/gpt-4o-mini` or similar for Assist to actually be worth turning on. |
| `MQB_LLM_API_KEY` | unset | API key for the provider above, if it needs one |
| `MQB_LLM_API_BASE` | `http://127.0.0.1:11434` | Provider endpoint — only relevant for local/self-hosted providers like Ollama |
| `MQB_MCP_NPM_SPEC` | a pinned `maximo-mcp-server` version | Override for testing against a different build |

An admin can override the LLM provider at runtime from the Settings screen
without touching any of these — the env vars above are just the deploy-time
default.

## Never point at real tenant data while testing

`MQB_TENANT_DB_PATH` holds real tenants' encrypted Maximo API keys and any
admin-set configuration. If you're scripting against a running instance for
testing or development, point this at a scratch file — not the database a
real deployment is using.
