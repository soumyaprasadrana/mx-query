import { applyPack, readKind, toggleKind, readStoredPack } from "./lib/theme";
import { IRIS, OBSIDIAN } from "./lib/theme";
import type { ThemeKind, ThemePack } from "./lib/theme";

/** @deprecated use ThemeKind - kept so existing imports keep compiling. */
export type Theme = ThemeKind;

export function readTheme(): ThemeKind {
  return readKind();
}

export function applyTheme(theme: ThemeKind) {
  applyPack(theme === "light" ? IRIS : OBSIDIAN);
}

export function toggleTheme(): ThemeKind {
  const current = readStoredPack() ?? (readKind() === "light" ? IRIS : OBSIDIAN);
  const next = toggleKind(current);
  applyPack(next);
  return next.kind;
}

export type { ThemePack };
