/** Write theme tokens to CSS variables and localStorage. */
import { IRIS, OBSIDIAN, defaultPackForKind, migrateRetiredPack, ootbById } from "./packs";
import {
  COLOR_TOKEN_KEYS,
  THEME_SCHEMA_VERSION,
  TOKEN_CSS,
  TOKEN_KEYS,
  ThemeKind,
  ThemePack,
  ThemeTokens,
} from "./schema";

const PACK_KEY = "mqb.themePack";
const KIND_KEY = "mqb.theme";

export const THEME_EVENT = "mqb-theme";

export function parsePack(raw: unknown): ThemePack | null {
  if (!raw || typeof raw !== "object") return null;
  const o = raw as Record<string, unknown>;
  const kind: ThemeKind | null = o.kind === "light" || o.kind === "dark" ? o.kind : null;
  if (!kind) return null;
  const id = typeof o.id === "string" && o.id.trim() ? o.id.trim() : "custom";
  const retired = migrateRetiredPack(id, kind);
  if (retired) return retired;
  const shipped = ootbById(id);
  if (shipped && o.ootb !== false) return shipped;
  const tokensIn = o.tokens;
  if (!tokensIn || typeof tokensIn !== "object") return shipped ?? null;
  const base: ThemeTokens = { ...(shipped ?? defaultPackForKind(kind)).tokens };
  const src = tokensIn as Record<string, unknown>;
  for (const key of TOKEN_KEYS) {
    const v = src[key];
    if (typeof v === "string" && v.trim()) base[key] = v.trim();
  }
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    id: shipped ? "custom" : id,
    name: typeof o.name === "string" && o.name.trim() ? o.name.trim() : "Custom",
    kind,
    ootb: false,
    tokens: base,
  };
}

export function exportPack(pack: ThemePack): string {
  const body: ThemePack = {
    schemaVersion: THEME_SCHEMA_VERSION,
    id: pack.id,
    name: pack.name,
    kind: pack.kind,
    ootb: false,
    tokens: { ...pack.tokens },
  };
  return JSON.stringify(body, null, 2);
}

export function applyPack(pack: ThemePack) {
  const root = document.documentElement;
  root.dataset.theme = pack.kind;
  root.dataset.pack = pack.id;
  for (const key of TOKEN_KEYS) {
    const value = pack.tokens[key];
    if (value) root.style.setProperty(TOKEN_CSS[key], value);
  }
  localStorage.setItem(PACK_KEY, JSON.stringify(pack));
  localStorage.setItem(KIND_KEY, pack.kind);
  window.dispatchEvent(new CustomEvent(THEME_EVENT, { detail: pack }));
}

export function readStoredPack(): ThemePack | null {
  try {
    const raw = localStorage.getItem(PACK_KEY);
    if (raw) return parsePack(JSON.parse(raw));
  } catch {
    /* ignore */
  }
  const kind = localStorage.getItem(KIND_KEY);
  if (kind === "light") return IRIS;
  if (kind === "dark") return OBSIDIAN;
  return null;
}

export function bootTheme(): ThemePack {
  const pack = readStoredPack() ?? IRIS;
  applyPack(pack);
  return pack;
}

export function readKind(): ThemeKind {
  return document.documentElement.dataset.theme === "light" ? "light" : "dark";
}

/** Flip light/dark using the paired OOTB pack, keeping a custom pack's tokens if possible. */
export function toggleKind(current: ThemePack): ThemePack {
  const nextKind: ThemeKind = current.kind === "dark" ? "light" : "dark";
  if (current.ootb) {
    const pair: Record<string, string> = {
      obsidian: "daylight",
      daylight: "obsidian",
      ember: "iris",
      iris: "ember",
      pacific: "daylight",
    };
    return ootbById(pair[current.id] ?? (nextKind === "light" ? "daylight" : "obsidian")) ?? defaultPackForKind(nextKind);
  }
  return defaultPackForKind(nextKind);
}

export function cloneAsCustom(pack: ThemePack, patch?: Partial<ThemeTokens>): ThemePack {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    id: "custom",
    name: pack.ootb ? `${pack.name} (edited)` : pack.name,
    kind: pack.kind,
    ootb: false,
    tokens: { ...pack.tokens, ...patch },
  };
}

export function isHexColor(value: string): boolean {
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value.trim());
}

export function hexForPicker(value: string): string | null {
  const v = value.trim();
  if (/^#[0-9a-f]{6}$/i.test(v)) return v;
  if (/^#[0-9a-f]{3}$/i.test(v)) {
    const r = v[1], g = v[2], b = v[3];
    return `#${r}${r}${g}${g}${b}${b}`;
  }
  return null;
}

export { COLOR_TOKEN_KEYS };
