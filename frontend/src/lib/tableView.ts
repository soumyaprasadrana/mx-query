/** Result table presentation (columns, freeze, density). */
import { nid } from "./resultReport";

export type StyleOp = "=" | "!=" | ">" | "<" | ">=" | "<=" | "contains" | "empty" | "notempty";
export type StyleTarget = "row" | "cell";

export type TableColumn = {
  key: string;
  label?: string;
  hidden?: boolean;
};

export type StyleRule = {
  id: string;
  field: string;
  op: StyleOp;
  value?: string;
  target: StyleTarget;
  background?: string;
  color?: string;
};

/** Presentation layer under `display.table`. Unknown future keys stay in extra via the display bundle. */
export type TableView = {
  header: string;
  columns: TableColumn[];
  rules: StyleRule[];
};

export const STYLE_OPS: { id: StyleOp; label: string }[] = [
  { id: "=", label: "=" },
  { id: "!=", label: "!=" },
  { id: ">", label: ">" },
  { id: "<", label: "<" },
  { id: ">=", label: ">=" },
  { id: "<=", label: "<=" },
  { id: "contains", label: "contains" },
  { id: "empty", label: "empty" },
  { id: "notempty", label: "not empty" },
];

export function emptyTableView(): TableView {
  return { header: "", columns: [], rules: [] };
}

export function isTableViewEmpty(view: TableView | null | undefined): boolean {
  if (!view) return true;
  return !view.header.trim() && view.columns.length === 0 && view.rules.length === 0;
}

const OPS = new Set<StyleOp>(STYLE_OPS.map((o) => o.id));

function parseColumn(raw: unknown): TableColumn | null {
  if (typeof raw === "string") {
    const key = raw.trim();
    return key ? { key } : null;
  }
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const key = String(rec.key ?? rec.field ?? rec.name ?? "").trim();
  if (!key) return null;
  const label = typeof rec.label === "string" && rec.label.trim() ? rec.label.trim() : undefined;
  return { key, label, hidden: rec.hidden === true };
}

function parseRule(raw: unknown): StyleRule | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const field = String(rec.field ?? "").trim();
  const op = String(rec.op ?? "=").toLowerCase() as StyleOp;
  if (!field || !OPS.has(op)) return null;
  const target: StyleTarget = rec.target === "cell" ? "cell" : "row";
  const background = typeof rec.background === "string" && rec.background.trim() ? rec.background.trim() : undefined;
  const color = typeof rec.color === "string" && rec.color.trim() ? rec.color.trim() : undefined;
  if (!background && !color) return null;
  return {
    id: typeof rec.id === "string" && rec.id.trim() ? rec.id.trim() : nid("s"),
    field,
    op,
    value: rec.value == null ? undefined : String(rec.value),
    target,
    background,
    color,
  };
}

export function parseTableView(raw: unknown): TableView {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyTableView();
  const rec = raw as Record<string, unknown>;
  const header = typeof rec.header === "string" ? rec.header : typeof rec.title === "string" ? rec.title : "";
  const columns = Array.isArray(rec.columns) ? rec.columns.map(parseColumn).filter((c): c is TableColumn => !!c) : [];
  const rules = Array.isArray(rec.rules) ? rec.rules.map(parseRule).filter((r): r is StyleRule => !!r) : [];
  return { header, columns, rules };
}

export function tableForExport(view: TableView | null | undefined): Record<string, unknown> | undefined {
  if (!view || isTableViewEmpty(view)) return undefined;
  const out: Record<string, unknown> = {};
  if (view.header.trim()) out.header = view.header.trim();
  if (view.columns.length) {
    out.columns = view.columns.map((c) => {
      const row: Record<string, unknown> = { key: c.key };
      if (c.label) row.label = c.label;
      if (c.hidden) row.hidden = true;
      return row;
    });
  }
  if (view.rules.length) {
    out.rules = view.rules.map((r) => ({
      id: r.id,
      field: r.field,
      op: r.op,
      ...(r.value != null && r.value !== "" ? { value: r.value } : {}),
      target: r.target,
      ...(r.background ? { background: r.background } : {}),
      ...(r.color ? { color: r.color } : {}),
    }));
  }
  return Object.keys(out).length ? out : undefined;
}

export function orderedColumns(available: string[], view: TableView): string[] {
  const byLower = new Map(available.map((k) => [k.toLowerCase(), k]));
  const seen = new Set<string>();
  const out: string[] = [];
  for (const col of view.columns) {
    if (col.hidden) {
      seen.add(col.key.toLowerCase());
      continue;
    }
    const real = byLower.get(col.key.toLowerCase()) ?? col.key;
    const lk = real.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    out.push(real);
  }
  if (!view.columns.length) return available;
  for (const k of available) {
    const lk = k.toLowerCase();
    if (seen.has(lk)) continue;
    seen.add(lk);
    out.push(k);
  }
  return out;
}

export function columnLabel(key: string, view: TableView): string {
  const hit = view.columns.find((c) => c.key.toLowerCase() === key.toLowerCase());
  return hit?.label?.trim() || key;
}

function cell(row: Record<string, unknown>, field: string): unknown {
  const want = field.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

function scalar(v: unknown): string {
  if (v == null || v === "") return "";
  if (typeof v === "boolean") return v ? "true" : "false";
  return String(v);
}

function ruleMatches(rule: StyleRule, row: Record<string, unknown>): boolean {
  const raw = cell(row, rule.field);
  const left = scalar(raw);
  const right = rule.value ?? "";
  if (rule.op === "empty") return left === "";
  if (rule.op === "notempty") return left !== "";
  if (rule.op === "contains") return left.toLowerCase().includes(right.toLowerCase());
  const ln = Number(left);
  const rn = Number(right);
  const numeric = left !== "" && right !== "" && Number.isFinite(ln) && Number.isFinite(rn);
  if (rule.op === "=") return numeric ? ln === rn : left.toLowerCase() === right.toLowerCase();
  if (rule.op === "!=") return numeric ? ln !== rn : left.toLowerCase() !== right.toLowerCase();
  if (!numeric) return false;
  if (rule.op === ">") return ln > rn;
  if (rule.op === "<") return ln < rn;
  if (rule.op === ">=") return ln >= rn;
  if (rule.op === "<=") return ln <= rn;
  return false;
}

export type AppliedStyle = { background?: string; color?: string };

export function rowStyle(row: Record<string, unknown>, rules: StyleRule[]): AppliedStyle | undefined {
  let background: string | undefined;
  let color: string | undefined;
  for (const rule of rules) {
    if (rule.target !== "row") continue;
    if (!ruleMatches(rule, row)) continue;
    if (rule.background) background = rule.background;
    if (rule.color) color = rule.color;
  }
  if (!background && !color) return undefined;
  return { background, color };
}

export function cellStyle(row: Record<string, unknown>, field: string, rules: StyleRule[]): AppliedStyle | undefined {
  let background: string | undefined;
  let color: string | undefined;
  for (const rule of rules) {
    if (rule.target !== "cell") continue;
    if (rule.field.toLowerCase() !== field.toLowerCase()) continue;
    if (!ruleMatches(rule, row)) continue;
    if (rule.background) background = rule.background;
    if (rule.color) color = rule.color;
  }
  if (!background && !color) return undefined;
  return { background, color };
}

export function newStyleRule(field: string): StyleRule {
  return {
    id: nid("s"),
    field,
    op: "=",
    value: "",
    target: "row",
    background: "color-mix(in srgb, var(--accent) 22%, transparent)",
  };
}
