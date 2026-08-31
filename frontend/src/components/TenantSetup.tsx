/** New Maximo connection. Lives at /setup so browser Back returns to the picker. */
import { useState } from "react";
import { motion } from "framer-motion";
import { createTenant } from "../api";
import { ApiError, Tenant } from "../types";
import Brand from "./Brand";

export default function TenantSetup({
  onCreated,
  onBack,
}: {
  onCreated: (t: Tenant) => void;
  onBack?: () => void;
}) {
  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [apiKey, setApiKey] = useState("");
  const [devMode, setDevMode] = useState(true);
  const [readonly, setReadonly] = useState(true);
  const [copilotMode, setCopilotMode] = useState(false);
  const [embeddingsMode, setEmbeddingsMode] = useState<"none" | "local" | "openai">("local");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      onCreated(await createTenant({ name, url, apiKey, devMode, readonly, copilotMode, embeddingsMode }));
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="center-screen">
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="wiz-brand picker-brand">
          <Brand onClick={onBack} title="Back to tenants" />
        </div>
        <h1>Connect a tenant</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          Spawns a dedicated MCP server process and syncs metadata once.
        </p>
        <form className="stack" onSubmit={submit} style={{ marginTop: 20 }}>
          <div>
            <label className="lbl" htmlFor="name">Tenant name</label>
            <input id="name" className="input-line" type="text" value={name} onChange={(e) => setName(e.target.value)} required />
          </div>
          <div>
            <label className="lbl" htmlFor="url">Maximo URL</label>
            <input
              id="url"
              className="input-line"
              type="text"
              placeholder="https://your-maximo-host/maximo"
              value={url}
              onChange={(e) => setUrl(e.target.value)}
              required
            />
          </div>
          <div>
            <label className="lbl" htmlFor="apiKey">API key</label>
            <input id="apiKey" className="input-line" type="password" value={apiKey} onChange={(e) => setApiKey(e.target.value)} required />
          </div>
          <div className="toggles">
            <label>
              <input type="checkbox" checked={devMode} onChange={(e) => setDevMode(e.target.checked)} />
              Dev mode
            </label>
            <label>
              <input type="checkbox" checked={readonly} onChange={(e) => setReadonly(e.target.checked)} />
              Read-only
            </label>
            <label>
              <input type="checkbox" checked={copilotMode} onChange={(e) => setCopilotMode(e.target.checked)} />
              Copilot mode
            </label>
            <label className="toggle-select">
              Embeddings
              <select
                value={embeddingsMode}
                onChange={(e) => setEmbeddingsMode(e.target.value as "none" | "local" | "openai")}
              >
                <option value="local">local</option>
                <option value="none">none</option>
                <option value="openai">openai</option>
              </select>
            </label>
          </div>
          {error && <div className="error-box">{error}</div>}
          <button type="submit" disabled={busy} style={{ marginTop: 8 }}>
            {busy ? "Creating..." : "Connect tenant"}
          </button>
          {onBack && (
            <button type="button" className="ghost" onClick={onBack} disabled={busy}>
              Back
            </button>
          )}
        </form>
      </motion.div>
    </div>
  );
}
