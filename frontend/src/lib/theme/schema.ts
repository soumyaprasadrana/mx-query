/** Theme pack v1 - exportable JSON. Backend stores the same shape. */

export const THEME_SCHEMA_VERSION = 1 as const;

export type ThemeKind = "light" | "dark";

/** Keys written as CSS custom properties on `:root`. */
export const TOKEN_KEYS = [
  "bg",
  "surface",
  "surfaceSolid",
  "codeBg",
  "border",
  "text",
  "muted",
  "mutedDim",
  "accent",
  "accent2",
  "onAccent",
  "live",
  "typeStr",
  "typeNum",
  "typeDate",
  "typeBool",
  "danger",
  "topbarBg",
  "grid",
  "hover",
  "radius",
  "font",
  "display",
  "mono",
] as const;

export type TokenKey = (typeof TOKEN_KEYS)[number];

export type ThemeTokens = Record<TokenKey, string>;

export interface ThemePack {
  schemaVersion: typeof THEME_SCHEMA_VERSION;
  id: string;
  name: string;
  kind: ThemeKind;
  /** True for the five shipped palettes. Custom imports/edits are false. */
  ootb: boolean;
  tokens: ThemeTokens;
}

export const TOKEN_CSS: Record<TokenKey, string> = {
  bg: "--bg",
  surface: "--surface",
  surfaceSolid: "--surface-solid",
  codeBg: "--code-bg",
  border: "--border",
  text: "--text",
  muted: "--muted",
  mutedDim: "--muted-dim",
  accent: "--accent",
  accent2: "--accent-2",
  onAccent: "--on-accent",
  live: "--live",
  typeStr: "--type-str",
  typeNum: "--type-num",
  typeDate: "--type-date",
  typeBool: "--type-bool",
  danger: "--danger",
  topbarBg: "--topbar-bg",
  grid: "--grid",
  hover: "--hover",
  radius: "--radius",
  font: "--font",
  display: "--display",
  mono: "--mono",
};

export const TOKEN_LABELS: Record<TokenKey, string> = {
  bg: "Page background",
  surface: "Glass / overlay",
  surfaceSolid: "Solid panel",
  codeBg: "Code / hop card",
  border: "Borders",
  text: "Body text",
  muted: "Secondary text",
  mutedDim: "Tertiary text",
  accent: "Accent",
  accent2: "Accent 2",
  onAccent: "Text on accent",
  live: "Live / listening",
  typeStr: "String type",
  typeNum: "Number type",
  typeDate: "Date type",
  typeBool: "Boolean type",
  danger: "Danger",
  topbarBg: "Top bar",
  grid: "Background grid",
  hover: "Row hover",
  radius: "Corner radius",
  font: "UI font",
  display: "Display font",
  mono: "Mono font",
};

/** Color-ish tokens get a picker when the value is #hex. */
export const COLOR_TOKEN_KEYS: TokenKey[] = [
  "bg",
  "surface",
  "surfaceSolid",
  "codeBg",
  "border",
  "text",
  "muted",
  "mutedDim",
  "accent",
  "accent2",
  "onAccent",
  "live",
  "typeStr",
  "typeNum",
  "typeDate",
  "typeBool",
  "danger",
  "topbarBg",
  "grid",
  "hover",
];
