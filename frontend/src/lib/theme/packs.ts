/** OOTB packs (Iris default light, Obsidian dark, etc.). */
import { THEME_SCHEMA_VERSION, ThemePack, ThemeTokens } from "./schema";

const FONT = '"Inter", ui-sans-serif, system-ui, -apple-system, sans-serif';
const MONO = '"JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, Consolas, monospace';

function pack(
  id: string,
  name: string,
  kind: ThemePack["kind"],
  tokens: Omit<ThemeTokens, "font" | "display" | "mono" | "radius"> & Partial<Pick<ThemeTokens, "font" | "display" | "mono" | "radius">>,
): ThemePack {
  return {
    schemaVersion: THEME_SCHEMA_VERSION,
    id,
    name,
    kind,
    ootb: true,
    tokens: {
      radius: "12px",
      font: FONT,
      display: FONT,
      mono: MONO,
      ...tokens,
    },
  };
}

/** Current dark - ion mint on void. */
export const OBSIDIAN: ThemePack = pack("obsidian", "Obsidian mint", "dark", {
  bg: "#07090C",
  surface: "rgba(16, 20, 26, 0.78)",
  surfaceSolid: "#10141A",
  codeBg: "rgba(5, 8, 12, 0.55)",
  border: "rgba(210, 230, 240, 0.1)",
  text: "#E7EEF4",
  muted: "rgba(231, 238, 244, 0.55)",
  mutedDim: "rgba(231, 238, 244, 0.32)",
  accent: "#3EE0B4",
  accent2: "#7C8CFF",
  onAccent: "#06241C",
  live: "#3EE0B4",
  typeStr: "#3EE0B4",
  typeNum: "#8FB4FF",
  typeDate: "#C4A8FF",
  typeBool: "#F0C14A",
  danger: "#FF7A7A",
  topbarBg: "rgba(7, 9, 12, 0.86)",
  grid: "rgba(231, 238, 244, 0.035)",
  hover: "color-mix(in srgb, #3EE0B4 12%, transparent)",
});

/** Current light - teal on paper-grey. */
export const DAYLIGHT: ThemePack = pack("daylight", "Daylight", "light", {
  bg: "#EEF2F6",
  surface: "rgba(255, 255, 255, 0.82)",
  surfaceSolid: "#FFFFFF",
  codeBg: "#F1F4F7",
  border: "rgba(16, 28, 40, 0.1)",
  text: "#0E141B",
  muted: "rgba(14, 20, 27, 0.55)",
  mutedDim: "rgba(14, 20, 27, 0.34)",
  accent: "#0F8F73",
  accent2: "#4F5FE8",
  onAccent: "#F4FFFB",
  live: "#0F8F73",
  typeStr: "#0F8F73",
  typeNum: "#2B5A9E",
  typeDate: "#5B3FA0",
  typeBool: "#B45309",
  danger: "#C0392B",
  topbarBg: "rgba(238, 242, 246, 0.88)",
  grid: "rgba(14, 20, 27, 0.045)",
  hover: "color-mix(in srgb, #0F8F73 10%, transparent)",
});

/** Vivid coral on a warm dark - high chroma, not dusty amber. */
export const EMBER: ThemePack = pack("ember", "Ember", "dark", {
  bg: "#14080A",
  surface: "rgba(36, 16, 18, 0.84)",
  surfaceSolid: "#221012",
  codeBg: "rgba(12, 4, 6, 0.62)",
  border: "rgba(255, 180, 160, 0.14)",
  text: "#FFEDE8",
  muted: "rgba(255, 237, 232, 0.58)",
  mutedDim: "rgba(255, 237, 232, 0.34)",
  accent: "#FF5A3D",
  accent2: "#FFB020",
  onAccent: "#2A0806",
  live: "#FF5A3D",
  typeStr: "#FF7A61",
  typeNum: "#7DD3FC",
  typeDate: "#F0ABFC",
  typeBool: "#FFB020",
  danger: "#FF6B81",
  topbarBg: "rgba(20, 8, 10, 0.9)",
  grid: "rgba(255, 237, 232, 0.045)",
  hover: "color-mix(in srgb, #FF5A3D 14%, transparent)",
});

/** Cool lilac light - violet accent, no rose/red secondary. */
export const IRIS: ThemePack = pack("iris", "Iris", "light", {
  bg: "#F4F0FA",
  surface: "rgba(255, 255, 255, 0.88)",
  surfaceSolid: "#FFFFFF",
  codeBg: "#EEE8F8",
  border: "rgba(48, 24, 80, 0.12)",
  text: "#1A1228",
  muted: "rgba(26, 18, 40, 0.56)",
  mutedDim: "rgba(26, 18, 40, 0.34)",
  accent: "#7C3AED",
  accent2: "#6D28D9",
  onAccent: "#F8F5FF",
  live: "#7C3AED",
  typeStr: "#6D28D9",
  typeNum: "#2563EB",
  typeDate: "#7C3AED",
  typeBool: "#0F766E",
  danger: "#BE123C",
  topbarBg: "rgba(244, 240, 250, 0.92)",
  grid: "rgba(26, 18, 40, 0.05)",
  hover: "color-mix(in srgb, #7C3AED 10%, transparent)",
});

/** Navy / cyan - product-dark, distinct from mint Obsidian. */
export const PACIFIC: ThemePack = pack("pacific", "Pacific", "dark", {
  bg: "#061018",
  surface: "rgba(10, 28, 40, 0.82)",
  surfaceSolid: "#0C1C28",
  codeBg: "rgba(4, 12, 20, 0.6)",
  border: "rgba(140, 210, 240, 0.14)",
  text: "#E6F4FA",
  muted: "rgba(230, 244, 250, 0.56)",
  mutedDim: "rgba(230, 244, 250, 0.32)",
  accent: "#22D3EE",
  accent2: "#60A5FA",
  onAccent: "#04202A",
  live: "#22D3EE",
  typeStr: "#2DD4BF",
  typeNum: "#60A5FA",
  typeDate: "#A78BFA",
  typeBool: "#FBBF24",
  danger: "#FB7185",
  topbarBg: "rgba(6, 16, 24, 0.9)",
  grid: "rgba(230, 244, 250, 0.04)",
  hover: "color-mix(in srgb, #22D3EE 12%, transparent)",
});

export const OOTB_PACKS: ThemePack[] = [IRIS, OBSIDIAN, DAYLIGHT, EMBER, PACIFIC];

const RETIRED_IDS = new Set(["carbon", "paper", "midnight"]);

export function migrateRetiredPack(id: string, kind: ThemePack["kind"]): ThemePack | null {
  if (!RETIRED_IDS.has(id)) return null;
  return kind === "light" ? IRIS : OBSIDIAN;
}

export function ootbById(id: string): ThemePack | undefined {
  return OOTB_PACKS.find((p) => p.id === id);
}

export function defaultPackForKind(kind: ThemePack["kind"]): ThemePack {
  return kind === "light" ? IRIS : OBSIDIAN;
}
