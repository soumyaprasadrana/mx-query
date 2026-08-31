/** Admin LLM provider form (key never echoed back). */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { adminLogout, deleteLLMConfig, getLLMConfig, putLLMConfig, testLLMConfig } from "../../api";
import { clearAssistHealthCache } from "../../lib/assist";
import { ApiError, LLMConfigStatus, LLMProvider, LLMTestResult } from "../../types";
import ThemeManager from "./ThemeManager";

type Preset = {
  label: string;
  model: string;
  needsKey: boolean;
  needsBase: boolean;
  needsVersion: boolean;
  defaultBase?: string;
};

const PRESETS: Record<LLMProvider, Preset> = {
  openai: { label: "OpenAI", model: "openai/gpt-4o-mini", needsKey: true, needsBase: false, needsVersion: false },
  anthropic: {
    label: "Anthropic (Claude)",
    model: "anthropic/claude-3-5-sonnet-20241022",
    needsKey: true,
    needsBase: false,
    needsVersion: false,
  },
  azure: {
    label: "Azure OpenAI",
    model: "azure/<your-deployment-name>",
    needsKey: true,
    needsBase: true,
    needsVersion: true,
  },
  gemini: { label: "Google Gemini", model: "gemini/gemini-1.5-flash", needsKey: true, needsBase: false, needsVersion: false },
  groq: { label: "Groq", model: "groq/llama-3.1-8b-instant", needsKey: true, needsBase: false, needsVersion: false },
  openrouter: {
    label: "OpenRouter",
    model: "openrouter/<vendor>/<model>",
    needsKey: true,
    needsBase: false,
    needsVersion: false,
  },
  ollama: {
    label: "Ollama (local)",
    model: "ollama/qwen2.5:1.5b",
    needsKey: false,
    needsBase: true,
    needsVersion: false,
    defaultBase: "http://127.0.0.1:11434",
  },
  custom: {
    label: "Custom (OpenAI-compatible)",
    model: "openai/<model-name>",
    needsKey: false,
    needsBase: true,
    needsVersion: false,
  },
};

const PROVIDERS = Object.keys(PRESETS) as LLMProvider[];

function inferProvider(status: LLMConfigStatus): LLMProvider {
  const p = status.provider;
  if (p && p in PRESETS) return p as LLMProvider;
  const model = status.model ?? "";
  if (model.startsWith("anthropic/")) return "anthropic";
  if (model.startsWith("azure/")) return "azure";
  if (model.startsWith("gemini/")) return "gemini";
  if (model.startsWith("groq/")) return "groq";
  if (model.startsWith("openrouter/")) return "openrouter";
  if (model.startsWith("ollama/")) return "ollama";
  if (model.startsWith("openai/")) return "openai";
  return "custom";
}

function sourceLabel(status: LLMConfigStatus | null): string | null {
  if (!status?.configured) return "No provider configured - Assist is off.";
  if (status.source === "env") return "Using the deployment default.";
  if (status.source === "db") return "Custom - saved by an admin.";
  return null;
}

export default function LLMSettings({
  onClose,
  onLogout,
  onSaved,
}: {
  onClose: () => void;
  onLogout: () => void;
  onSaved: (status: LLMConfigStatus) => void;
}) {
  const [status, setStatus] = useState<LLMConfigStatus | null>(null);
  const [provider, setProvider] = useState<LLMProvider>("openai");
  const [model, setModel] = useState(PRESETS.openai.model);
  const [apiKey, setApiKey] = useState("");
  const [apiBase, setApiBase] = useState("");
  const [apiVersion, setApiVersion] = useState("");
  const [saving, setSaving] = useState(false);
  const [testing, setTesting] = useState(false);
  const [clearing, setClearing] = useState(false);
  const [loggingOut, setLoggingOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testResult, setTestResult] = useState<LLMTestResult | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [tab, setTab] = useState<"llm" | "theme">("llm");

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    let cancelled = false;
    getLLMConfig()
      .then((next) => {
        if (cancelled) return;
        applyStatus(next);
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof ApiError ? err.message : String(err));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  function applyStatus(next: LLMConfigStatus) {
    setStatus(next);
    const nextProvider = inferProvider(next);
    const preset = PRESETS[nextProvider];
    setProvider(nextProvider);
    setModel(next.model ?? preset.model);
    setApiKey("");
    setApiBase(preset.defaultBase ?? "");
    setApiVersion("");
  }

  function pickProvider(next: LLMProvider) {
    const preset = PRESETS[next];
    setProvider(next);
    setModel(preset.model);
    setApiBase(preset.defaultBase ?? "");
    setApiVersion("");
  }

  const preset = PRESETS[provider];
  const busy = saving || testing || clearing || loggingOut;

  function fail(err: unknown) {
    if (err instanceof ApiError && err.code === "admin_auth_required") {
      onLogout();
      return;
    }
    setError(err instanceof ApiError ? err.message : String(err));
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    setTestResult(null);
    setNotice(null);
    try {
      const next = await putLLMConfig({
        provider,
        model: model.trim(),
        ...(apiKey.trim() ? { apiKey: apiKey.trim() } : {}),
        apiBase: preset.needsBase ? apiBase.trim() : "",
        apiVersion: preset.needsVersion ? apiVersion.trim() : "",
      });
      setStatus(next);
      setApiKey("");
      setNotice(`Saved ${next.model ?? model.trim()}.`);
      clearAssistHealthCache();
      onSaved(next);
    } catch (err) {
      fail(err);
    } finally {
      setSaving(false);
    }
  }

  async function test() {
    setTesting(true);
    setError(null);
    setTestResult(null);
    setNotice(null);
    try {
      const result = await testLLMConfig();
      setTestResult(result);
    } catch (err) {
      fail(err);
    } finally {
      setTesting(false);
    }
  }

  async function clear() {
    const ok = window.confirm(
      "Clear the saved LLM config? Assist will fall back to the deployment default, or turn off if none is set.",
    );
    if (!ok) return;
    setClearing(true);
    setError(null);
    setTestResult(null);
    setNotice(null);
    try {
      await deleteLLMConfig();
      const next = await getLLMConfig();
      applyStatus(next);
      setNotice(next.configured ? "Cleared. Fell back to the deployment default." : "Cleared. Assist is off.");
      clearAssistHealthCache();
      onSaved(next);
    } catch (err) {
      fail(err);
    } finally {
      setClearing(false);
    }
  }

  async function logout() {
    setLoggingOut(true);
    setError(null);
    try {
      await adminLogout();
      onLogout();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setLoggingOut(false);
    }
  }

  return createPortal(
    <div className="settings-overlay" onClick={onClose} role="presentation">
      <div
        className={`glass-card settings-card${tab === "theme" ? " wide" : ""}`}
        role="dialog"
        aria-labelledby="llm-settings-title"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="spread" style={{ alignItems: "flex-start" }}>
          <div>
            <h2 id="llm-settings-title">Settings</h2>
            <p className="muted" style={{ margin: 0 }}>
              {tab === "theme"
                ? "Exportable packs. Five shipped palettes, or import JSON."
                : `${sourceLabel(status) ?? ""}${status?.configured && status.model ? ` ${status.model}` : ""}`}
            </p>
          </div>
          <button type="button" className="ghost" onClick={() => void logout()} disabled={busy}>
            {loggingOut ? "Logging out..." : "Log out"}
          </button>
        </div>

        <div className="settings-tabs" role="tablist">
          <button type="button" role="tab" aria-selected={tab === "llm"} className={tab === "llm" ? "on" : ""} onClick={() => setTab("llm")}>
            Assist
          </button>
          <button type="button" role="tab" aria-selected={tab === "theme"} className={tab === "theme" ? "on" : ""} onClick={() => setTab("theme")}>
            Appearance
          </button>
        </div>

        {tab === "theme" ? <ThemeManager /> : (
        <form className="stack" onSubmit={save} style={{ marginTop: 12 }}>
          <div>
            <label className="lbl" htmlFor="llm-provider">Provider</label>
            <select
              id="llm-provider"
              value={provider}
              onChange={(e) => pickProvider(e.target.value as LLMProvider)}
              disabled={busy}
            >
              {PROVIDERS.map((id) => (
                <option key={id} value={id}>{PRESETS[id].label}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="lbl" htmlFor="llm-model">Model</label>
            <input
              id="llm-model"
              className="input-line"
              type="text"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              spellCheck={false}
              required
              disabled={busy}
            />
            <p className="muted" style={{ margin: "6px 0 0" }}>
              Full litellm model string. Edit the suffix for a different size of the same provider.
            </p>
          </div>
          {(preset.needsKey || provider === "custom") && (
            <div>
              <label className="lbl" htmlFor="llm-key">API key</label>
              <input
                id="llm-key"
                className="input-line"
                type="password"
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                autoComplete="off"
                placeholder={
                  status?.configured
                    ? "Leave blank to keep the current key"
                    : provider === "custom"
                      ? "Optional"
                      : ""
                }
                disabled={busy}
              />
            </div>
          )}
          {preset.needsBase && (
            <div>
              <label className="lbl" htmlFor="llm-base">API base</label>
              <input
                id="llm-base"
                className="input-line"
                type="text"
                value={apiBase}
                onChange={(e) => setApiBase(e.target.value)}
                spellCheck={false}
                placeholder={
                  provider === "azure"
                    ? "https://your-resource.openai.azure.com"
                    : preset.defaultBase ?? "https://..."
                }
                disabled={busy}
              />
              {status?.apiBaseSet && (
                <p className="muted" style={{ margin: "6px 0 0" }}>
                  A base URL is already saved, but this form cannot read it back. Re-enter it to keep
                  it; leaving this blank clears the saved base.
                </p>
              )}
            </div>
          )}
          {preset.needsVersion && (
            <div>
              <label className="lbl" htmlFor="llm-version">API version</label>
              <input
                id="llm-version"
                className="input-line"
                type="text"
                value={apiVersion}
                onChange={(e) => setApiVersion(e.target.value)}
                spellCheck={false}
                placeholder="2024-02-15-preview"
                disabled={busy}
              />
            </div>
          )}

          {error && <div className="error-box">{error}</div>}
          {notice && !error && <div className="ok-box">{notice}</div>}
          {testResult && !error && (
            <div className="ok-box">
              {testResult.reply} | {testResult.elapsedMs} ms | {testResult.model}
            </div>
          )}

          <div className="row" style={{ justifyContent: "space-between", marginTop: 4 }}>
            <button type="button" className="ghost" onClick={() => void clear()} disabled={busy || !status?.configured}>
              {clearing ? "Clearing..." : "Clear"}
            </button>
            <div className="row">
              <button
                type="button"
                className="secondary"
                onClick={() => void test()}
                disabled={busy || !status?.configured}
                title={
                  !status?.configured
                    ? "Save a provider first"
                    : "Tests the last saved config, not unsaved edits"
                }
              >
                {testing ? "Testing..." : "Test connection"}
              </button>
              <button type="submit" disabled={busy || !model.trim()}>
                {saving ? "Saving..." : "Save"}
              </button>
            </div>
          </div>
        </form>
        )}
      </div>
    </div>,
    document.body,
  );
}
