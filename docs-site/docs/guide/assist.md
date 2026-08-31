# Assist

Assist is an optional helper on Wizard steps. It is off until an LLM provider is configured.

## Turn it on

1. Set `MQB_ADMIN_PASSWORD` and restart (or configure LLM at deploy time with `MQB_LLM_*`).
2. Open **Settings**, sign in, save a provider (OpenAI, Anthropic, Azure, Gemini, Groq, OpenRouter, Ollama, or a compatible base URL). The API key is stored encrypted on the server and is not shown again.
3. Use **Assist** in the wizard header. If the toggle is disabled, nothing is configured yet.

Deploy-time env vars are the default when Settings has no saved provider. See [Configuration](/configuration).

## What it may do

- Rewrite the intent in Maximo terms (SITEID, STATUS, SR/WO names).
- Rank object-structure search hits from `maximo://os/search/{keyword}`.
- Suggest relationship or field **names that already appear in the current list**.

It does not write OSLC, invent attributes, or search an encyclopedia of out-of-the-box Maximo. Empty suggestion lists are valid.

Keyword matching still runs when Assist is off.

## Privacy

Catalog snippets from **this tenant** are sent to the configured provider for that chat turn. Do not enable Assist if that is not acceptable.
