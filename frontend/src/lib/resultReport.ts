/** Report-view field list derived from the executed query. */
import { FieldInfo } from "../types";
import { DisplaySpec, isDateTimeField, maxTypeOf } from "./schema";
import { RelatedSelect, fieldsForRelatedSelect } from "./displayConfig";

export const MAX_REPORT_KPIS = 4;
export const MAX_REPORT_CHARTS = 2;

export type ReportMetric = "count" | "sum" | "avg" | "distinct";
export type ChartKind = "bar" | "donut" | "line";
export type DateBucket = "day" | "week" | "month";
export type ReportFieldKind = "cat" | "num" | "date";

export type ReportField = {
  name: string;
  title?: string;
  kind: ReportFieldKind;
};

export type ReportKpi = {
  id: string;
  metric: ReportMetric;
  field?: string;
  label?: string;
};

export type ReportChart = {
  id: string;
  kind: ChartKind;
  groupBy: string;
  metric: "count" | "sum" | "avg";
  valueField?: string;
  bucket?: DateBucket;
  top?: number;
  title?: string;
};

export type ReportSpec = {
  kpis: ReportKpi[];
  charts: ReportChart[];
};

export function emptyReport(): ReportSpec {
  return { kpis: [], charts: [] };
}

export function isReportEmpty(spec: ReportSpec | null | undefined): boolean {
  if (!spec) return true;
  return spec.kpis.length === 0 && spec.charts.length === 0;
}

export function nid(prefix: string): string {
  return `${prefix}${Math.random().toString(36).slice(2, 8)}`;
}

function asString(v: unknown): string {
  return typeof v === "string" ? v.trim() : "";
}

function parseMetric(raw: unknown): ReportMetric | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "count" || s === "sum" || s === "avg" || s === "distinct") return s;
  return null;
}

function parseChartMetric(raw: unknown): ReportChart["metric"] | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "count" || s === "sum" || s === "avg") return s;
  return null;
}

function parseKind(raw: unknown): ChartKind | null {
  const s = String(raw ?? "").toLowerCase();
  if (s === "bar" || s === "donut" || s === "line") return s;
  if (s === "pie") return "donut";
  if (s === "histogram" || s === "area") return "line";
  return null;
}

function parseBucket(raw: unknown): DateBucket | undefined {
  const s = String(raw ?? "").toLowerCase();
  if (s === "day" || s === "week" || s === "month") return s;
  return undefined;
}

function parseKpi(raw: unknown): ReportKpi | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const metric = parseMetric(rec.metric);
  if (!metric) return null;
  const field = asString(rec.field);
  if (metric !== "count" && !field) return null;
  return {
    id: asString(rec.id) || nid("k"),
    metric,
    field: field || undefined,
    label: asString(rec.label) || undefined,
  };
}

function parseChart(raw: unknown): ReportChart | null {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  const kind = parseKind(rec.kind);
  const groupBy = asString(rec.groupBy ?? rec.group);
  const metric = parseChartMetric(rec.metric) ?? "count";
  if (!kind || !groupBy) return null;
  const valueField = asString(rec.valueField ?? rec.value);
  if (metric !== "count" && !valueField) return null;
  const top = rec.top != null && Number.isFinite(Number(rec.top)) ? Math.max(1, Math.min(20, Number(rec.top))) : undefined;
  return {
    id: asString(rec.id) || nid("c"),
    kind,
    groupBy,
    metric,
    valueField: valueField || undefined,
    bucket: parseBucket(rec.bucket),
    top,
    title: asString(rec.title) || undefined,
  };
}

export function parseReport(raw: unknown): ReportSpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return emptyReport();
  const rec = raw as Record<string, unknown>;
  const kpis = Array.isArray(rec.kpis) ? rec.kpis.map(parseKpi).filter((k): k is ReportKpi => !!k) : [];
  const charts = Array.isArray(rec.charts) ? rec.charts.map(parseChart).filter((c): c is ReportChart => !!c) : [];
  return {
    kpis: kpis.slice(0, MAX_REPORT_KPIS),
    charts: charts.slice(0, MAX_REPORT_CHARTS),
  };
}

/** Drop empty report so export stays flatten-only when unused. */
export function reportForExport(spec: ReportSpec | null | undefined): ReportSpec | undefined {
  if (!spec || isReportEmpty(spec)) return undefined;
  return {
    kpis: spec.kpis.map((k) => ({
      id: k.id,
      metric: k.metric,
      ...(k.field ? { field: k.field } : {}),
      ...(k.label ? { label: k.label } : {}),
    })),
    charts: spec.charts.map((c) => ({
      id: c.id,
      kind: c.kind,
      groupBy: c.groupBy,
      metric: c.metric,
      ...(c.valueField ? { valueField: c.valueField } : {}),
      ...(c.bucket ? { bucket: c.bucket } : {}),
      ...(c.top ? { top: c.top } : {}),
      ...(c.title ? { title: c.title } : {}),
    })),
  };
}

export function kindOfField(field: FieldInfo): ReportFieldKind {
  if (isDateTimeField(field) && maxTypeOf(field) !== "TIME") return "date";
  if (field.type === "integer" || field.type === "number") return "num";
  return "cat";
}

export function reportFieldsFromQuery(
  fields: FieldInfo[],
  selected: Set<string>,
  selectAll: boolean,
  aliases: Record<string, string>,
  displaySpec: DisplaySpec,
  related: RelatedSelect[],
  childFieldsCache: Record<string, FieldInfo[]>,
): ReportField[] {
  const out: ReportField[] = [];
  const seen = new Set<string>();
  const add = (name: string, kind: ReportFieldKind, title?: string) => {
    const key = name.toLowerCase();
    if (!name || seen.has(key)) return;
    seen.add(key);
    out.push({ name, kind, title });
  };
  const parent = selectAll
    ? fields
    : fields.filter((f) => [...selected].some((s) => s.toLowerCase() === f.name.toLowerCase()));
  for (const f of parent) {
    const alias = aliases[f.name]?.trim();
    add(alias || f.name, kindOfField(f), f.title);
  }
  for (const [key, names] of Object.entries(displaySpec)) {
    if (!names.length) continue;
    const item = related.find((i) => i.key === key);
    const cache = item ? (childFieldsCache[item.objectName.toUpperCase()] ?? []) : [];
    const options = item ? fieldsForRelatedSelect(item, childFieldsCache) : names;
    const want = names.length ? names : options;
    for (const n of want) {
      const meta = cache.find((f) => f.name.toLowerCase() === n.toLowerCase());
      add(`${key}.${n}`, meta ? kindOfField(meta) : "cat", meta?.title);
    }
  }
  return out;
}

const CAT_HINT = /^(status|siteid|orgid|type|worktype|priority|wostatus|ownergroup|classstructureid)$/i;

export function suggestReport(fields: ReportField[]): ReportSpec {
  const spec = emptyReport();
  spec.kpis.push({ id: nid("k"), metric: "count" });
  const num = fields.find((f) => f.kind === "num");
  if (num) spec.kpis.push({ id: nid("k"), metric: "sum", field: num.name });
  const cat =
    fields.find((f) => CAT_HINT.test(f.name.split(".").pop() ?? f.name)) ??
    fields.find((f) => f.kind === "cat");
  if (cat) {
    spec.charts.push({
      id: nid("c"),
      kind: "bar",
      groupBy: cat.name,
      metric: "count",
      top: 8,
    });
  }
  const date = fields.find((f) => f.kind === "date");
  if (date && spec.charts.length < MAX_REPORT_CHARTS) {
    spec.charts.push({
      id: nid("c"),
      kind: "line",
      groupBy: date.name,
      metric: "count",
      bucket: "month",
    });
  }
  return spec;
}

export function mergeSuggest(current: ReportSpec, suggested: ReportSpec): ReportSpec {
  const kpis = [...current.kpis];
  for (const k of suggested.kpis) {
    if (kpis.length >= MAX_REPORT_KPIS) break;
    if (kpis.some((x) => x.metric === k.metric && (x.field ?? "") === (k.field ?? ""))) continue;
    kpis.push(k);
  }
  const charts = [...current.charts];
  for (const c of suggested.charts) {
    if (charts.length >= MAX_REPORT_CHARTS) break;
    if (charts.some((x) => x.kind === c.kind && x.groupBy === c.groupBy && x.metric === c.metric)) continue;
    charts.push(c);
  }
  return { kpis, charts };
}

function cell(row: Record<string, unknown>, field: string): unknown {
  const want = field.toLowerCase();
  for (const [k, v] of Object.entries(row)) {
    if (k.toLowerCase() === want) return v;
  }
  return undefined;
}

function isScalar(v: unknown): boolean {
  return v == null || typeof v === "string" || typeof v === "number" || typeof v === "boolean";
}

export function toNumber(v: unknown): number | null {
  if (v == null || v === "") return null;
  if (typeof v === "boolean") return v ? 1 : 0;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const s = String(v).replace(/,/g, "").trim();
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

export function parseDateValue(v: unknown): Date | null {
  if (v == null || v === "") return null;
  if (v instanceof Date) return Number.isNaN(v.getTime()) ? null : v;
  if (typeof v === "number" && Number.isFinite(v)) {
    const d = new Date(v);
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const s = String(v).trim();
  const ms = s.match(/\/Date\((-?\d+)\)\//);
  if (ms) {
    const d = new Date(Number(ms[1]));
    return Number.isNaN(d.getTime()) ? null : d;
  }
  const d = new Date(s);
  return Number.isNaN(d.getTime()) ? null : d;
}

function isoWeek(d: Date): string {
  const t = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = t.getUTCDay() || 7;
  t.setUTCDate(t.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(t.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((t.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${t.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function bucketKey(d: Date, bucket: DateBucket): string {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  if (bucket === "month") return `${y}-${m}`;
  if (bucket === "week") return isoWeek(d);
  return `${y}-${m}-${day}`;
}

function groupLabel(v: unknown, bucket?: DateBucket, kind?: ReportFieldKind): string {
  if (v == null || v === "") return "(blank)";
  if (kind === "date" || bucket) {
    const d = parseDateValue(v);
    if (!d) return "(blank)";
    return bucketKey(d, bucket ?? "day");
  }
  if (typeof v === "boolean") return v ? "Yes" : "No";
  return String(v);
}

export type KpiResult = {
  id: string;
  label: string;
  value: number;
  hint: string;
};

export function evalKpi(kpi: ReportKpi, rows: Record<string, unknown>[]): KpiResult {
  const n = rows.length;
  if (kpi.metric === "count") {
    return { id: kpi.id, label: kpi.label || "Rows", value: n, hint: "this page" };
  }
  const field = kpi.field ?? "";
  if (kpi.metric === "distinct") {
    const set = new Set<string>();
    for (const row of rows) {
      const v = cell(row, field);
      if (!isScalar(v) || v == null || v === "") continue;
      set.add(String(v));
    }
    return { id: kpi.id, label: kpi.label || `Distinct ${field}`, value: set.size, hint: field };
  }
  const nums: number[] = [];
  for (const row of rows) {
    const nval = toNumber(cell(row, field));
    if (nval != null) nums.push(nval);
  }
  const sum = nums.reduce((a, b) => a + b, 0);
  const value = kpi.metric === "avg" ? (nums.length ? sum / nums.length : 0) : sum;
  const word = kpi.metric === "avg" ? "Avg" : "Sum";
  return {
    id: kpi.id,
    label: kpi.label || `${word} ${field}`,
    value,
    hint: field,
  };
}

export type ChartPoint = { name: string; value: number };

export type ChartResult = {
  id: string;
  title: string;
  kind: ChartKind;
  points: ChartPoint[];
  blank: number;
};

export function chartTitle(chart: ReportChart): string {
  if (chart.title) return chart.title;
  const m =
    chart.metric === "count"
      ? "Count"
      : chart.metric === "sum"
        ? `Sum of ${chart.valueField}`
        : `Avg ${chart.valueField}`;
  if (chart.bucket) return `${m} by ${chart.groupBy} (${chart.bucket})`;
  return `${m} by ${chart.groupBy}`;
}

export function evalChart(
  chart: ReportChart,
  rows: Record<string, unknown>[],
  fieldKind?: ReportFieldKind,
): ChartResult {
  const kind = fieldKind ?? (chart.bucket ? "date" : "cat");
  const bucket = kind === "date" ? (chart.bucket ?? "month") : undefined;
  const groups = new Map<string, { sum: number; count: number }>();
  let blank = 0;
  for (const row of rows) {
    const raw = cell(row, chart.groupBy);
    const name = groupLabel(raw, bucket, kind);
    if (name === "(blank)") blank += 1;
    const entry = groups.get(name) ?? { sum: 0, count: 0 };
    entry.count += 1;
    if (chart.metric !== "count") {
      const nval = toNumber(cell(row, chart.valueField ?? ""));
      if (nval != null) entry.sum += nval;
    }
    groups.set(name, entry);
  }
  let points: ChartPoint[] = [...groups.entries()].map(([name, g]) => ({
    name,
    value:
      chart.metric === "count"
        ? g.count
        : chart.metric === "avg"
          ? (g.count ? g.sum / g.count : 0)
          : g.sum,
  }));
  if (kind === "date") {
    points.sort((a, b) => a.name.localeCompare(b.name));
  } else {
    points.sort((a, b) => b.value - a.value);
    const top = chart.top ?? 8;
    if (points.length > top) {
      const head = points.slice(0, top);
      const rest = points.slice(top).reduce((s, p) => s + p.value, 0);
      points = [...head, { name: "Other", value: rest }];
    }
  }
  return { id: chart.id, title: chartTitle(chart), kind: chart.kind, points, blank };
}

export function formatKpiValue(n: number): string {
  if (!Number.isFinite(n)) return "-";
  const abs = Math.abs(n);
  if (abs >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (abs >= 10_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, "")}k`;
  if (Number.isInteger(n)) return String(n);
  return n.toLocaleString(undefined, { maximumFractionDigits: 2 });
}

export function formatChartValue(n: number): string {
  return formatKpiValue(n);
}
