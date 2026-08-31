/** Edit / import / export theme packs (admin). */
import { useRef, useState } from "react";
import { deleteTheme, putTheme } from "../../api";
import { ApiError } from "../../types";
import {
  COLOR_TOKEN_KEYS,
  TOKEN_KEYS,
  TOKEN_LABELS,
  ThemePack,
  TokenKey,
  cloneAsCustom,
  exportPack,
  hexForPicker,
  parsePack,
} from "../../lib/theme";
import { useTheme } from "./ThemeProvider";
import { Icon, faDownload, faUpload } from "../Icon";

function swatch(pack: ThemePack): string {
  return hexForPicker(pack.tokens.accent) ?? pack.tokens.accent;
}

export default function ThemeManager() {
  const { pack, setPack, packs, source, setSource } = useTheme();
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  function pickOotb(next: ThemePack) {
    setPack(next);
    setSource("browser");
    setNotice(null);
    setError(null);
  }

  function patchToken(key: TokenKey, value: string) {
    const next = cloneAsCustom(pack, { [key]: value });
    setPack(next);
    setSource("browser");
  }

  function patchName(name: string) {
    setPack({ ...cloneAsCustom(pack), name });
    setSource("browser");
  }

  async function save() {
    setBusy(true);
    setError(null);
    setNotice(null);
    try {
      const result = await putTheme(pack);
      if (result === "local-only") {
        setNotice("Saved in this browser. Backend theme table is not wired yet - see docs/pm/CURSOR_PROMPT_THEME.md.");
        setSource("browser");
      } else {
        setNotice("Saved on the server. This pack loads for everyone on this instance.");
        setSource("server");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  async function clearServer() {
    setBusy(true);
    setError(null);
    try {
      const result = await deleteTheme();
      if (result === "local-only") {
        setNotice("Nothing on the server to clear. This pack stays in this browser.");
      } else {
        setNotice("Server theme cleared. This browser still has the current pack.");
        setSource("browser");
      }
    } catch (e) {
      setError(e instanceof ApiError ? e.message : e instanceof Error ? e.message : String(e));
    } finally {
      setBusy(false);
    }
  }

  function download() {
    const blob = new Blob([exportPack(pack)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${pack.id || "theme"}.mqb-theme.json`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function onImport(file: File) {
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = parsePack(JSON.parse(String(reader.result)));
        if (!parsed) throw new Error("Not a theme pack (need kind + tokens).");
        parsed.ootb = false;
        setPack(parsed);
        setSource("browser");
        setNotice(`Imported "${parsed.name}". Save to keep it.`);
        setError(null);
      } catch (e) {
        setError(e instanceof Error ? e.message : "Could not import that file.");
      }
    };
    reader.readAsText(file);
  }

  return (
    <div className="theme-manager">
      <p className="muted" style={{ margin: "0 0 14px" }}>
        {source === "server"
          ? "Using the pack saved on the server."
          : "Using a pack stored in this browser. Save writes the server when the API exists; otherwise it stays local."}
      </p>

      <div className="theme-pack-grid">
        {packs.map((p) => (
          <button
            key={p.id}
            type="button"
            className={`theme-pack-card${pack.id === p.id && pack.ootb ? " on" : ""}`}
            onClick={() => pickOotb(p)}
            disabled={busy}
          >
            <span className="theme-pack-dots" aria-hidden>
              <i style={{ background: swatch(p) }} />
              <i style={{ background: hexForPicker(p.tokens.accent2) ?? p.tokens.bg }} />
              <i style={{ background: hexForPicker(p.tokens.bg) ?? p.tokens.bg }} />
            </span>
            <strong>{p.name}</strong>
            <span className="muted">{p.kind}</span>
          </button>
        ))}
      </div>

      <div className="theme-preview" aria-hidden>
        <span style={{ background: pack.tokens.bg }} />
        <span style={{ background: pack.tokens.surfaceSolid }} />
        <span style={{ background: pack.tokens.accent }} />
        <span style={{ background: pack.tokens.accent2 }} />
        <span style={{ background: pack.tokens.text }} />
      </div>

      <div>
        <label className="lbl" htmlFor="theme-name">Pack name</label>
        <input
          id="theme-name"
          className="input-line"
          value={pack.name}
          onChange={(e) => patchName(e.target.value)}
          disabled={busy}
        />
      </div>

      <p className="lbl" style={{ marginTop: 16 }}>Tokens</p>
      <div className="theme-token-grid">
        {TOKEN_KEYS.map((key) => {
          const value = pack.tokens[key];
          const hex = COLOR_TOKEN_KEYS.includes(key) ? hexForPicker(value) : null;
          return (
            <label key={key} className="theme-token">
              <span>{TOKEN_LABELS[key]}</span>
              <span className="theme-token-row">
                {hex && (
                  <input
                    type="color"
                    value={hex}
                    onChange={(e) => patchToken(key, e.target.value)}
                    disabled={busy}
                    aria-label={TOKEN_LABELS[key]}
                  />
                )}
                <input
                  className="input-line"
                  value={value}
                  onChange={(e) => patchToken(key, e.target.value)}
                  spellCheck={false}
                  disabled={busy}
                />
              </span>
            </label>
          );
        })}
      </div>

      {error && <div className="error-box">{error}</div>}
      {notice && !error && <div className="ok-box">{notice}</div>}

      <div className="row" style={{ justifyContent: "space-between", marginTop: 8, flexWrap: "wrap", gap: 8 }}>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="ghost" onClick={download} disabled={busy}>
            <Icon icon={faDownload} /> Export JSON
          </button>
          <button type="button" className="ghost" onClick={() => fileRef.current?.click()} disabled={busy}>
            <Icon icon={faUpload} /> Import JSON
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            hidden
            onChange={(e) => {
              const file = e.target.files?.[0];
              e.target.value = "";
              if (file) onImport(file);
            }}
          />
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button type="button" className="ghost" onClick={() => void clearServer()} disabled={busy}>
            Clear server
          </button>
          <button type="button" onClick={() => void save()} disabled={busy}>
            {busy ? "Saving..." : "Save"}
          </button>
        </div>
      </div>
    </div>
  );
}
