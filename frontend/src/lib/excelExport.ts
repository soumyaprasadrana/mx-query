/** Build an .xlsx from nested query rows. Options stay on the table dialog, not in query JSON. */
import ExcelJS from "exceljs";
import { childCollections, flattenNestedRows, isChildArray, isInternalField, isRelatedValue } from "./schema";
import { APP_NAME } from "./brand";

export type ExcelLayout = "outline" | "sheets" | "leaves";

export type ExcelExportOptions = {
  layout: ExcelLayout;
  includeNested: boolean;
  includeParentsWithoutChildren: boolean;
  coverSheet: boolean;
  groupHeaders: boolean;
  freeze: boolean;
  autoFilter: boolean;
  /** Excel Table object. Off for outline: tables and row grouping conflict. */
  excelTable: boolean;
  outlineGroups: boolean;
};

export type ExcelExportMeta = {
  osName?: string;
  title?: string;
  totalCount?: number;
  /** Snapshot of the live mxQuery pack. Excel has no CSS variables. */
  themeKind?: "light" | "dark";
  themeAccent?: string;
  themeAccent2?: string;
  themeOnAccent?: string;
  themeText?: string;
  themeMuted?: string;
  themeSurface?: string;
  themeBorder?: string;
};

export const DEFAULT_EXCEL_OPTIONS: ExcelExportOptions = {
  layout: "sheets",
  includeNested: true,
  includeParentsWithoutChildren: true,
  coverSheet: true,
  groupHeaders: true,
  freeze: true,
  autoFilter: true,
  excelTable: true,
  outlineGroups: true,
};

const JOIN_KEYS = ["wonum", "workorderid", "assetnum", "siteid", "orgid", "location"];
const PARENT_GROUP = "Parent";
const RESULT_SHEET = "Result Set";
const COVER_SHEET = "mxQuery";
const PARENT_COL = "Parent";

type ExcelPaint = {
  accent: string;
  accentDark: string;
  paper: string;
  white: string;
  text: string;
  muted: string;
  child: string;
  grandchild: string;
  headerText: string;
  border: string;
  zebra: string;
};

const IRIS_PAINT: ExcelPaint = {
  accent: "FF7C3AED",
  accentDark: "FF6D28D9",
  paper: "FFF4F0FA",
  white: "FFFFFFFF",
  text: "FF1A1228",
  muted: "FF6B5F80",
  child: "FFFBFAFE",
  grandchild: "FFF3EDFA",
  headerText: "FFF8F5FF",
  border: "FFD4C4EE",
  zebra: "FFF7F3FC",
};

/** Mutated for the current workbook write so Excel follows the live mxQuery theme. */
let THEME: ExcelPaint = { ...IRIS_PAINT };

function cellBorder(): Partial<ExcelJS.Borders> {
  return {
    top: { style: "thin", color: { argb: THEME.border } },
    left: { style: "thin", color: { argb: THEME.border } },
    bottom: { style: "thin", color: { argb: THEME.border } },
    right: { style: "thin", color: { argb: THEME.border } },
  };
}

export type OutlineCol = { key: string; group: string; field: string };
export type OutlineLine = { depth: number; values: Record<string, unknown> };
export type OutlineModel = { cols: OutlineCol[]; lines: OutlineLine[] };

export function pickScalars(row: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) {
    if (isInternalField(k) || isRelatedValue(v)) continue;
    out[k] = v;
  }
  return out;
}

function pickJoin(row: Record<string, unknown>): Record<string, unknown> {
  const scalars = pickScalars(row);
  const out: Record<string, unknown> = {};
  for (const k of JOIN_KEYS) {
    const hit = Object.keys(scalars).find((x) => x.toLowerCase() === k);
    if (hit) out[`parent.${hit}`] = scalars[hit];
  }
  if (!Object.keys(out).length) {
    const first = Object.keys(scalars)[0];
    if (first) out[`parent.${first}`] = scalars[first];
  }
  return out;
}

function sheetName(raw: string): string {
  const cleaned = raw.replace(/[:\\/?*[\]]+/g, "_").slice(0, 31);
  return cleaned || "sheet";
}

function uniqueName(used: Set<string>, base: string): string {
  let name = sheetName(base);
  let n = 2;
  while (used.has(name.toLowerCase())) {
    const suffix = `_${n}`;
    name = sheetName(base.slice(0, 31 - suffix.length) + suffix);
    n += 1;
  }
  used.add(name.toLowerCase());
  return name;
}

function oneToOneKids(row: Record<string, unknown>): [string, Record<string, unknown>][] {
  const out: [string, Record<string, unknown>][] = [];
  for (const [k, v] of Object.entries(row)) {
    if (isInternalField(k) || Array.isArray(v) || !isRelatedValue(v)) continue;
    out.push([k, v as Record<string, unknown>]);
  }
  return out;
}

function oneToNKids(row: Record<string, unknown>): [string, Record<string, unknown>[]][] {
  const out: [string, Record<string, unknown>[]][] = [];
  for (const [k, v] of Object.entries(row)) {
    if (isInternalField(k) || !isChildArray(v)) continue;
    out.push([k, v]);
  }
  return out;
}

function pathGroup(path: string[]): string {
  return path.length ? path.join(".") : PARENT_GROUP;
}

function colKey(path: string[], field: string): string {
  return path.length ? `${path.join(".")}.${field}` : field;
}

/**
 * Same-sheet parent/child: parent scalars (and 1:1 hops) on the parent row only.
 * 1:N children are extra rows with ancestor cells left blank.
 */
export function outlineModel(
  rows: Record<string, unknown>[],
  opts: ExcelExportOptions,
): OutlineModel {
  const groupFields = new Map<string, string[]>();

  function addField(path: string[], field: string) {
    const g = pathGroup(path);
    const list = groupFields.get(g) ?? [];
    if (!list.includes(field)) list.push(field);
    groupFields.set(g, list);
  }

  function collect(list: Record<string, unknown>[], path: string[], depth: number) {
    for (const row of list) {
      for (const field of Object.keys(pickScalars(row))) addField(path, field);
      for (const [rel, child] of oneToOneKids(row)) {
        collect([child], [...path, rel], depth);
      }
      if (!(path.length === 0 || opts.includeNested)) continue;
      for (const [rel, arr] of oneToNKids(row)) {
        collect(arr, [...path, rel], depth + 1);
      }
    }
  }

  collect(rows, [], 0);

  const cols: OutlineCol[] = [];
  for (const [group, fields] of groupFields) {
    const path = group === PARENT_GROUP ? [] : group.split(".");
    const label = group === PARENT_GROUP ? PARENT_GROUP : group;
    for (const field of fields) {
      cols.push({ key: colKey(path, field), group: label, field });
    }
  }

  const lines: OutlineLine[] = [];

  function emit(row: Record<string, unknown>, path: string[], depth: number) {
    const values: Record<string, unknown> = {};
    const pending: { path: string[]; depth: number; rows: Record<string, unknown>[] }[] = [];

    function fill(cur: Record<string, unknown>, curPath: string[]) {
      for (const [k, v] of Object.entries(pickScalars(cur))) {
        values[colKey(curPath, k)] = v;
      }
      for (const [rel, child] of oneToOneKids(cur)) {
        const childPath = [...curPath, rel];
        fill(child, childPath);
        if (!opts.includeNested) continue;
        for (const [nrel, arr] of oneToNKids(child)) {
          pending.push({ path: [...childPath, nrel], depth: Math.min(7, childPath.length), rows: arr });
        }
      }
    }

    fill(row, path);
    lines.push({ depth, values });

    if (path.length === 0 || opts.includeNested) {
      for (const [rel, arr] of oneToNKids(row)) {
        pending.push({ path: [...path, rel], depth: depth + 1, rows: arr });
      }
    }
    for (const block of pending) {
      for (const child of block.rows) emit(child, block.path, block.depth);
    }
  }

  for (const row of rows) emit(row, [], 0);
  return { cols, lines };
}

export function leafRows(
  rows: Record<string, unknown>[],
  opts: ExcelExportOptions,
): Record<string, unknown>[] {
  if (!opts.includeNested) {
    const out: Record<string, unknown>[] = [];
    for (const row of rows) {
      const current = pickScalars(row);
      const kids = childCollections(row);
      if (!kids.length) {
        out.push(current);
        continue;
      }
      if (opts.includeParentsWithoutChildren) out.push(current);
      for (const [rel, arr] of kids) {
        for (const child of arr) {
          const line = { ...current };
          for (const [k, v] of Object.entries(pickScalars(child))) {
            line[`${rel}.${k}`] = v;
          }
          out.push(line);
        }
      }
    }
    return out;
  }
  const leaves = flattenNestedRows(rows);
  if (!opts.includeParentsWithoutChildren) return leaves;
  const extras: Record<string, unknown>[] = [];
  for (const row of rows) {
    if (childCollections(row).length) extras.push(pickScalars(row));
  }
  return extras.length ? [...extras, ...leaves] : leaves;
}

export type RelLink = { rel: string; sheetKey: string; count: number };

export type RelSheetRow = {
  cells: Record<string, unknown>;
  rid: string;
  parentRid: string | null;
  parentLabel: string;
  parentSheetKey: string | null;
  links: RelLink[];
};

export type RelSheet = {
  key: string;
  name: string;
  rows: RelSheetRow[];
};

function childSheetKey(parentKey: string, rel: string): string {
  return parentKey === "parent" ? rel : `${parentKey}.${rel}`;
}

function joinLabel(row: Record<string, unknown>): string {
  const vals = Object.values(pickJoin(row)).filter((v) => v != null && v !== "");
  return vals.map(String).join(" | ");
}

/**
 * One Excel table per relationship. Parent sheet is parent columns only; each
 * hop is its own sheet. Click-through hyperlinks are written later.
 */
export function buildRelSheets(
  rows: Record<string, unknown>[],
  opts: ExcelExportOptions,
): RelSheet[] {
  const buckets = new Map<string, RelSheetRow[]>();

  function visit(
    list: Record<string, unknown>[],
    key: string,
    parentRid: string | null,
    parentLabel: string,
    parentSheetKey: string | null,
    inherited: Record<string, unknown>,
    depth: number,
  ) {
    list.forEach((row, i) => {
      const rid = parentRid == null ? `r${i}` : `${parentRid}.${i}`;
      const scalars = pickScalars(row);
      const kids = childCollections(row);
      const go = depth === 0 || opts.includeNested;
      const links: RelLink[] = [];
      if (go) {
        for (const [rel, arr] of kids) {
          links.push({ rel, sheetKey: childSheetKey(key, rel), count: arr.length });
        }
      }
      const cells = key === "parent" ? { ...scalars } : { ...inherited, ...scalars };
      const bucket = buckets.get(key) ?? [];
      bucket.push({
        cells,
        rid,
        parentRid,
        parentLabel: key === "parent" ? "" : parentLabel,
        parentSheetKey,
        links,
      });
      buckets.set(key, bucket);
      if (!go) return;
      const join = pickJoin(row);
      const label = joinLabel(row);
      for (const [rel, arr] of kids) {
        visit(arr, childSheetKey(key, rel), rid, label, key, join, depth + 1);
      }
    });
  }

  visit(rows, "parent", null, "", null, {}, 0);
  const used = new Set<string>();
  return [...buckets.entries()].map(([key, sheetRows]) => ({
    key,
    name: uniqueName(used, key),
    rows: sheetRows,
  }));
}

export function sheetTables(
  rows: Record<string, unknown>[],
  opts: ExcelExportOptions,
): { name: string; rows: Record<string, unknown>[] }[] {
  return buildRelSheets(rows, opts).map((s) => ({
    name: s.name,
    rows: s.rows.map((r) => r.cells),
  }));
}

function applyParentSheetName(sheets: RelSheet[], osName?: string) {
  const raw = osName?.trim();
  if (!raw) return;
  const parent = sheets.find((s) => s.key === "parent");
  if (!parent) return;
  const used = new Set(sheets.filter((s) => s !== parent).map((s) => s.name.toLowerCase()));
  parent.name = uniqueName(used, raw);
}

function displayCells(cells: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(cells)) {
    if (k.startsWith("parent.")) continue;
    out[k] = v;
  }
  return out;
}

function unionKeys(records: Record<string, unknown>[]): string[] {
  const seen = new Set<string>();
  const keys: string[] = [];
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (seen.has(k)) continue;
      seen.add(k);
      keys.push(k);
    }
  }
  return keys;
}

function excelInternalRef(sheetName: string, row: number): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `#'${escaped}'!A${row}`;
}

type LinkedCol =
  | { kind: "parent" }
  | { kind: "field"; key: string }
  | { kind: "link"; rel: string; sheetKey: string };

function linkLabel(count: number): string {
  return count === 1 ? "Open" : `${count} rows`;
}

function xmlSafe(s: string): string {
  return s.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "");
}

function cssToArgb(input: string | undefined, fallback: string): string {
  const s = (input ?? "").trim();
  const hex = s.match(/^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i);
  if (hex) {
    let h = hex[1].toUpperCase();
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    if (h.length === 6) return `FF${h}`;
    return h;
  }
  const rgb = s.match(/^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i);
  if (rgb) {
    const r = Math.max(0, Math.min(255, Math.round(Number(rgb[1]))));
    const g = Math.max(0, Math.min(255, Math.round(Number(rgb[2]))));
    const b = Math.max(0, Math.min(255, Math.round(Number(rgb[3]))));
    const a = rgb[4] == null ? 255 : Math.max(0, Math.min(255, Math.round(Number(rgb[4]) * 255)));
    const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
    return `${hex2(a)}${hex2(r)}${hex2(g)}${hex2(b)}`;
  }
  return fallback;
}

function mixArgb(a: string, b: string, t: number): string {
  const parse = (s: string) => {
    const h = s.length === 8 ? s : `FF${s}`;
    return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16), parseInt(h.slice(6, 8), 16)];
  };
  const [aa, ar, ag, ab] = parse(a);
  const [ba, br, bg, bb] = parse(b);
  const m = (x: number, y: number) => Math.round(x + (y - x) * t);
  const hex2 = (n: number) => n.toString(16).toUpperCase().padStart(2, "0");
  return `${hex2(m(aa, ba))}${hex2(m(ar, br))}${hex2(m(ag, bg))}${hex2(m(ab, bb))}`;
}

function paintFromMeta(meta: ExcelExportMeta): ExcelPaint {
  if (!meta.themeAccent) return { ...IRIS_PAINT };
  const dark = meta.themeKind === "dark";
  const accent = cssToArgb(meta.themeAccent, IRIS_PAINT.accent);
  const accent2 = cssToArgb(meta.themeAccent2, IRIS_PAINT.accentDark);
  const onAccent = cssToArgb(meta.themeOnAccent, IRIS_PAINT.headerText);
  const text = cssToArgb(meta.themeText, dark ? "FFE7EEF4" : IRIS_PAINT.text);
  const muted = cssToArgb(meta.themeMuted, IRIS_PAINT.muted);
  const paper = cssToArgb(meta.themeSurface, dark ? "FF10141A" : IRIS_PAINT.paper);
  const border = cssToArgb(meta.themeBorder, IRIS_PAINT.border);
  const white = dark ? paper : "FFFFFFFF";
  return {
    accent,
    accentDark: accent2,
    paper,
    white,
    text,
    muted,
    headerText: onAccent,
    border,
    child: mixArgb(white, accent, dark ? 0.16 : 0.06),
    grandchild: mixArgb(white, accent, dark ? 0.28 : 0.12),
    zebra: mixArgb(white, accent, dark ? 0.1 : 0.04),
  };
}

function parseDate(raw: string): Date | null {
  const t = raw.trim();
  if (!/^\d{4}-\d{2}-\d{2}/.test(t)) return null;
  const d = new Date(t);
  return Number.isNaN(+d) ? null : d;
}

function cellPayload(v: unknown): { value: ExcelJS.CellValue; numFmt?: string } {
  if (v == null || v === "") return { value: "" };
  if (typeof v === "boolean") return { value: v };
  if (typeof v === "number" && Number.isFinite(v)) {
    return { value: v, numFmt: Number.isInteger(v) ? "#,##0" : "#,##0.##" };
  }
  if (v instanceof Date && !Number.isNaN(+v)) {
    return { value: v, numFmt: "yyyy-mm-dd hh:mm" };
  }
  if (typeof v === "string") {
    if (/^https?:\/\//i.test(v)) {
      const href = xmlSafe(v);
      return { value: { text: href, hyperlink: href } };
    }
    const d = parseDate(v);
    if (d) return { value: d, numFmt: "yyyy-mm-dd hh:mm" };
    return { value: xmlSafe(v) };
  }
  if (typeof v === "object") return { value: xmlSafe(JSON.stringify(v)) };
  return { value: xmlSafe(String(v)) };
}

function fillArgb(argb: string): ExcelJS.FillPattern {
  return { type: "pattern", pattern: "solid", fgColor: { argb } };
}

function font(opts: Partial<ExcelJS.Font>): Partial<ExcelJS.Font> {
  return { name: "Calibri", size: 11, color: { argb: THEME.text }, ...opts };
}

/**
 * Always-on print chrome. Do not set fitToPage together with outlineProperties:
 * ExcelJS 4.4 writes invalid sheetPr XML and Excel refuses to open the file
 * (exceljs/exceljs#1348).
 */
function applyPrint(ws: ExcelJS.Worksheet, titleRows: string) {
  ws.pageSetup = {
    orientation: "landscape",
    paperSize: 9,
    horizontalCentered: true,
    printTitlesRow: titleRows,
    scale: 80,
    margins: { left: 0.5, right: 0.5, top: 0.75, bottom: 0.75, header: 0.3, footer: 0.3 },
  };
  ws.headerFooter = {
    oddHeader: `&C&B ${APP_NAME} Result Set`,
    oddFooter: `&LGenerated by ${APP_NAME}&RPage &P of &N`,
  };
}

function styleHeaderCell(cell: ExcelJS.Cell, group: boolean) {
  cell.font = font({ bold: true, color: { argb: THEME.headerText }, size: group ? 10 : 11 });
  cell.fill = fillArgb(group ? THEME.accentDark : THEME.accent);
  cell.alignment = { vertical: "middle", horizontal: group ? "center" : "left", wrapText: true };
  cell.border = cellBorder();
}

function paintDataCell(cell: ExcelJS.Cell, depth: number, rowIndex: number) {
  const bg = depth >= 2 ? THEME.grandchild : depth === 1 ? THEME.child : rowIndex % 2 === 0 ? THEME.zebra : THEME.white;
  cell.fill = fillArgb(bg);
  cell.font = font({ color: { argb: depth ? THEME.muted : THEME.text } });
  cell.alignment = { vertical: "middle", wrapText: true };
  cell.border = cellBorder();
}

function columnWidths(headers: string[], records: Record<string, unknown>[], keys: string[]) {
  return keys.map((key, i) => {
    let max = headers[i]?.length ?? 8;
    for (const r of records.slice(0, 80)) {
      const v = r[key];
      const s = v == null ? "" : typeof v === "object" ? JSON.stringify(v) : String(v);
      if (s.length > max) max = s.length;
    }
    return Math.min(42, Math.max(10, max + 2));
  });
}

function writeBanner(ws: ExcelJS.Worksheet, lastCol: number, meta: ExcelExportMeta) {
  const os = meta.osName?.trim();
  const title = meta.title?.trim();
  const label = [APP_NAME + " Result Set", os, title].filter(Boolean).join(" | ");
  ws.mergeCells(1, 1, 1, Math.max(1, lastCol));
  const cell = ws.getCell(1, 1);
  cell.value = xmlSafe(label);
  cell.font = font({ bold: true, size: 14, color: { argb: THEME.headerText } });
  cell.fill = fillArgb(THEME.accent);
  cell.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 26;
}

function writeCover(ws: ExcelJS.Worksheet, meta: ExcelExportMeta, opts: ExcelExportOptions, stats: string[]) {
  ws.properties.tabColor = { argb: THEME.accent };
  ws.columns = [{ width: 28 }, { width: 64 }];
  ws.mergeCells("A1:B1");
  const title = ws.getCell("A1");
  title.value = `${APP_NAME} Result Set`;
  title.font = font({ bold: true, size: 20, color: { argb: THEME.headerText } });
  title.fill = fillArgb(THEME.accent);
  title.alignment = { vertical: "middle", horizontal: "left" };
  ws.getRow(1).height = 36;

  const lines: [string, string][] = [
    ["Generated by", APP_NAME],
    ["Object structure", meta.osName?.trim() || "-"],
    ["Title", meta.title?.trim() || "-"],
    ["Exported", new Date().toISOString()],
    ["Layout", opts.layout === "outline" ? "Same sheet (parent once, children indented)" : opts.layout === "sheets" ? "One sheet per relationship" : "Flat leaves (parent repeated)"],
    ...stats.map((s, i) => (i === 0 ? (["Summary", s] as [string, string]) : (["", s] as [string, string]))),
  ];
  lines.forEach(([k, v], i) => {
    const row = 3 + i;
    ws.getCell(row, 1).value = k;
    ws.getCell(row, 1).font = font({ bold: true, color: { argb: THEME.muted }, size: 10 });
    ws.getCell(row, 2).value = xmlSafe(v);
    ws.getCell(row, 2).font = font({ size: 11 });
  });

  const noteRow = 4 + lines.length;
  ws.mergeCells(noteRow, 1, noteRow + 3, 2);
  const note = ws.getCell(noteRow, 1);
  note.value =
    opts.layout === "outline"
      ? "Parent field values appear once; child and grandchild cells under those columns stay blank. Collapse rows with the Excel outline controls. Excel cannot nest a child table inside a parent cell the way the results tree does -- use one sheet per relationship for click-through."
      : opts.layout === "sheets"
        ? "Excel cannot nest a child table inside a parent cell. Each relationship is its own sheet. Click a child name to jump to that parent's rows. Click Parent to go back. Use the Parent column filter to keep one parent."
        : `Workbook produced by ${APP_NAME}. Each sheet is a table you can filter and sort. Insert PivotTables or charts in Excel from this data if you need them.`;
  note.alignment = { wrapText: true, vertical: "top" };
  note.font = font({ size: 10, color: { argb: THEME.muted } });
  ws.getRow(noteRow).height = 72;
  applyPrint(ws, "1:1");
}

function paintLinkCell(cell: ExcelJS.Cell, depth: number, rowIndex: number) {
  paintDataCell(cell, depth, rowIndex);
  cell.font = font({ color: { argb: THEME.accent }, underline: true });
}

function writeLinkedSheets(
  wb: ExcelJS.Workbook,
  sheets: RelSheet[],
  opts: ExcelExportOptions,
  meta: ExcelExportMeta,
) {
  const nameByKey = new Map(sheets.map((s) => [s.key, s.name]));
  const rowByRid = new Map<string, number>();
  const firstChildRow = new Map<string, number>();
  for (const sheet of sheets) {
    sheet.rows.forEach((r, i) => {
      const excelRow = i + 3;
      rowByRid.set(`${sheet.key}|${r.rid}`, excelRow);
      if (!r.parentRid) return;
      const ck = `${r.parentRid}|${sheet.key}`;
      if (!firstChildRow.has(ck)) firstChildRow.set(ck, excelRow);
    });
  }

  for (const sheet of sheets) {
    const ws = wb.addWorksheet(sheet.name);
    ws.properties.tabColor = { argb: sheet.key === "parent" ? THEME.accent : THEME.accentDark };
    const fieldKeys = unionKeys(sheet.rows.map((r) => displayCells(r.cells)));
    const linkRels: { rel: string; sheetKey: string }[] = [];
    const seen = new Set<string>();
    for (const r of sheet.rows) {
      for (const l of r.links) {
        if (seen.has(l.sheetKey)) continue;
        seen.add(l.sheetKey);
        linkRels.push({ rel: l.rel, sheetKey: l.sheetKey });
      }
    }
    const cols: LinkedCol[] = [];
    if (sheet.key !== "parent") cols.push({ kind: "parent" });
    for (const key of fieldKeys) cols.push({ kind: "field", key });
    for (const l of linkRels) cols.push({ kind: "link", rel: l.rel, sheetKey: l.sheetKey });

    const lastCol = Math.max(1, cols.length);
    writeBanner(ws, lastCol, meta);
    const headers = cols.map((c) => {
      if (c.kind === "parent") return PARENT_COL;
      if (c.kind === "field") return c.key;
      return c.rel;
    });
    const widthRecords = sheet.rows.map((r) => {
      const cells = displayCells(r.cells);
      const rec: Record<string, unknown> = { ...cells };
      if (sheet.key !== "parent") rec[PARENT_COL] = r.parentLabel;
      for (const l of r.links) rec[l.rel] = linkLabel(l.count);
      return rec;
    });
    const widths = columnWidths(headers, widthRecords, headers);
    ws.columns = headers.map((_, i) => {
      const measured = widths[i] ?? 12;
      const col = cols[i];
      const min = col.kind === "field" ? 10 : 12;
      return { width: Math.max(min, measured) };
    });

    const hdr = ws.getRow(2);
    hdr.height = 22;
    cols.forEach((col, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value = headers[i];
      styleHeaderCell(cell, col.kind !== "field");
    });

    const depth = sheet.key === "parent" ? 0 : 1;
    sheet.rows.forEach((row, ri) => {
      const excelRow = ri + 3;
      const cells = displayCells(row.cells);
      cols.forEach((col, ci) => {
        const cell = ws.getCell(excelRow, ci + 1);
        if (col.kind === "parent") {
          const destName = row.parentSheetKey ? nameByKey.get(row.parentSheetKey) : undefined;
          const destRow =
            row.parentRid && row.parentSheetKey
              ? rowByRid.get(`${row.parentSheetKey}|${row.parentRid}`)
              : undefined;
          const label = row.parentLabel || "Open parent";
          if (destName && destRow) {
            cell.value = { text: String(label), hyperlink: excelInternalRef(destName, destRow) };
            paintLinkCell(cell, depth, ri);
          } else {
            cell.value = label;
            paintDataCell(cell, depth, ri);
          }
        } else if (col.kind === "field") {
          const payload = cellPayload(cells[col.key]);
          cell.value = payload.value;
          if (payload.numFmt) cell.numFmt = payload.numFmt;
          paintDataCell(cell, depth, ri);
        } else {
          const hit = row.links.find((l) => l.sheetKey === col.sheetKey);
          if (!hit || hit.count === 0) {
            cell.value = "";
            paintDataCell(cell, depth, ri);
            return;
          }
          const destName = nameByKey.get(col.sheetKey);
          const destRow = firstChildRow.get(`${row.rid}|${col.sheetKey}`);
          const text = linkLabel(hit.count);
          if (destName && destRow) {
            cell.value = { text, hyperlink: excelInternalRef(destName, destRow) };
            paintLinkCell(cell, depth, ri);
          } else {
            cell.value = text;
            paintDataCell(cell, depth, ri);
          }
        }
      });
    });

    if (opts.autoFilter && cols.length) {
      ws.autoFilter = {
        from: { row: 2, column: 1 },
        to: { row: 2, column: cols.length },
      };
    }
    if (opts.freeze) {
      ws.views = [{ state: "frozen", ySplit: 2, activeCell: "A3", showGridLines: true }];
    }
    applyPrint(ws, "1:2");
  }
}

function writeRecordSheet(
  ws: ExcelJS.Worksheet,
  records: Record<string, unknown>[],
  opts: ExcelExportOptions,
  meta: ExcelExportMeta,
  tableName: string,
) {
  ws.properties.tabColor = { argb: THEME.accentDark };
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of records) {
    for (const k of Object.keys(r)) {
      if (seen.has(k)) continue;
      seen.add(k);
      cols.push(k);
    }
  }
  const lastCol = Math.max(1, cols.length);
  writeBanner(ws, lastCol, meta);
  const headerRow = 2;
  const widths = columnWidths(cols, records, cols);
  ws.columns = cols.map((c, i) => ({ width: widths[i] }));

  if (opts.excelTable && cols.length && records.length) {
    ws.addTable({
      name: tableName.replace(/[^A-Za-z0-9_]/g, "_").replace(/^(\d)/, "T$1"),
      ref: `A${headerRow}`,
      headerRow: true,
      totalsRow: false,
      style: { theme: "TableStyleMedium2", showRowStripes: true, showFirstColumn: false },
      columns: cols.map((c) => ({ name: c, filterButton: opts.autoFilter })),
      rows: records.map((r) => cols.map((c) => cellPayload(r[c]).value)),
    });
    const hdr = ws.getRow(headerRow);
    hdr.height = 22;
    for (let i = 1; i <= cols.length; i++) styleHeaderCell(hdr.getCell(i), false);
  } else {
    const hdr = ws.getRow(headerRow);
    hdr.height = 22;
    cols.forEach((c, i) => {
      const cell = hdr.getCell(i + 1);
      cell.value = c;
      styleHeaderCell(cell, false);
    });
    records.forEach((r, ri) => {
      const row = ws.getRow(headerRow + 1 + ri);
      cols.forEach((c, i) => {
        const cell = row.getCell(i + 1);
        const payload = cellPayload(r[c]);
        cell.value = payload.value;
        if (payload.numFmt) cell.numFmt = payload.numFmt;
        paintDataCell(cell, 0, ri);
      });
    });
    if (opts.autoFilter && cols.length) {
      ws.autoFilter = {
        from: { row: headerRow, column: 1 },
        to: { row: headerRow, column: cols.length },
      };
    }
  }

  if (opts.freeze) ws.views = [{ state: "frozen", ySplit: headerRow, activeCell: "A3", showGridLines: true }];
  applyPrint(ws, `1:${headerRow}`);
}

function writeOutlineSheet(
  ws: ExcelJS.Worksheet,
  model: OutlineModel,
  opts: ExcelExportOptions,
  meta: ExcelExportMeta,
) {
  ws.properties.tabColor = { argb: THEME.accent };
  const { cols, lines } = model;
  const lastCol = Math.max(1, cols.length);
  writeBanner(ws, lastCol, meta);

  const groupRow = opts.groupHeaders ? 2 : 0;
  const fieldRow = opts.groupHeaders ? 3 : 2;
  const dataStart = fieldRow + 1;

  const widths = columnWidths(
    cols.map((c) => c.field),
    lines.map((l) => l.values),
    cols.map((c) => c.key),
  );
  ws.columns = cols.map((c, i) => ({ width: widths[i], key: c.key }));

  if (opts.groupHeaders && cols.length) {
    const row = ws.getRow(groupRow);
    row.height = 18;
    let i = 0;
    while (i < cols.length) {
      const g = cols[i].group;
      let j = i;
      while (j + 1 < cols.length && cols[j + 1].group === g) j++;
      if (j > i) ws.mergeCells(groupRow, i + 1, groupRow, j + 1);
      const cell = row.getCell(i + 1);
      cell.value = g;
      styleHeaderCell(cell, true);
      for (let k = i + 1; k <= j; k++) styleHeaderCell(row.getCell(k + 1), true);
      i = j + 1;
    }
  }

  if (cols.length) {
    const row = ws.getRow(fieldRow);
    row.height = 20;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      cell.value = c.field;
      styleHeaderCell(cell, false);
    });
  }

  lines.forEach((line, ri) => {
    const row = ws.getRow(dataStart + ri);
    if (opts.outlineGroups) row.outlineLevel = Math.min(7, line.depth);
    row.height = 18;
    cols.forEach((c, i) => {
      const cell = row.getCell(i + 1);
      const payload = cellPayload(line.values[c.key]);
      cell.value = payload.value;
      if (payload.numFmt) cell.numFmt = payload.numFmt;
      paintDataCell(cell, line.depth, ri);
    });
  });

  if (opts.outlineGroups) {
    ws.properties.outlineProperties = { summaryBelow: false, summaryRight: false };
  }
  if (opts.autoFilter && cols.length) {
    ws.autoFilter = {
      from: { row: fieldRow, column: 1 },
      to: { row: fieldRow, column: cols.length },
    };
  }
  if (opts.freeze) {
    ws.views = [{ state: "frozen", ySplit: fieldRow, activeCell: `A${dataStart}`, showGridLines: true }];
  }
  applyPrint(ws, `1:${fieldRow}`);
}

function resolveMeta(meta?: ExcelExportMeta | string): ExcelExportMeta {
  if (typeof meta === "string") return { osName: meta };
  return meta ?? {};
}

function brandWorkbook(wb: ExcelJS.Workbook, meta: ExcelExportMeta) {
  const now = new Date();
  wb.creator = APP_NAME;
  wb.lastModifiedBy = APP_NAME;
  wb.company = APP_NAME;
  wb.manager = APP_NAME;
  wb.title = `${APP_NAME} Result Set`;
  wb.subject = meta.osName?.trim() || "Maximo query results";
  wb.keywords = `${APP_NAME}, Maximo, OSLC, Result Set`;
  wb.category = "Result Set";
  wb.description = `${APP_NAME} Result Set${meta.osName ? ` for ${meta.osName}` : ""}${meta.title ? ` - ${meta.title}` : ""}`;
  wb.created = now;
  wb.modified = now;
}

export async function rowsToXlsxBuffer(
  rows: Record<string, unknown>[],
  opts: ExcelExportOptions,
  metaOrTitle: ExcelExportMeta | string = {},
): Promise<ArrayBuffer> {
  const meta = resolveMeta(metaOrTitle);
  THEME = paintFromMeta(meta);
  const wb = new ExcelJS.Workbook();
  brandWorkbook(wb, meta);

  const stats: string[] = [`${rows.length} parent row${rows.length === 1 ? "" : "s"} on this page`];
  if (meta.totalCount != null) stats.push(`Maximo reported ${meta.totalCount} matching parent records`);

  let outline: OutlineModel | null = null;
  let relSheets: RelSheet[] | null = null;
  if (opts.layout === "outline") {
    outline = outlineModel(rows, opts);
    stats.push(`${outline.lines.length} sheet row${outline.lines.length === 1 ? "" : "s"} after unfolding children`);
  } else if (opts.layout === "sheets") {
    relSheets = buildRelSheets(rows, opts);
    applyParentSheetName(relSheets, meta.osName);
    for (const s of relSheets) {
      stats.push(`${s.name}: ${s.rows.length} row${s.rows.length === 1 ? "" : "s"}`);
    }
  }

  if (opts.coverSheet) {
    writeCover(wb.addWorksheet(COVER_SHEET), meta, opts, stats);
  }

  if (opts.layout === "outline" && outline) {
    writeOutlineSheet(wb.addWorksheet(sheetName(RESULT_SHEET)), outline, opts, meta);
  } else if (opts.layout === "leaves") {
    const recs = leafRows(rows, opts);
    writeRecordSheet(wb.addWorksheet(sheetName(RESULT_SHEET)), recs, opts, meta, "mxQuery_ResultSet");
  } else if (relSheets) {
    writeLinkedSheets(wb, relSheets, opts, meta);
  }

  const buf = await wb.xlsx.writeBuffer();
  return buf as ArrayBuffer;
}

export function xlsxFileName(osName?: string): string {
  const raw = String(osName ?? "results").trim() || "results";
  const os = raw.replace(/[^A-Za-z0-9._-]+/g, "_");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${APP_NAME}_${os}_${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}.xlsx`;
}
