/** Parse pasted os_query_builder args and hydrate builder state. */
import {
  ChildChain,
  ChildHop,
  ChildRel,
  DomainInternalClause,
  FieldInfo,
  QueryParam,
  RelatedWhere,
  SortRule,
  TimelineQuery,
  WhereCondition,
  WhereOp,
} from "../types";
import { unpackDisplay } from "./displayConfig";
import { emptyHop, matchOsChild, matchRel, matchRelExact, parseDomainInternal, parseTimeline, DisplaySpec } from "./schema";
import { isReportEmpty, parseReport, ReportSpec } from "./resultReport";
import { isTableViewEmpty, parseTableView, TableView } from "./tableView";

const DROPPED_PARAMS = new Set([
  "ignorecollectionref",
  "checkesig",
  "lean",
  "relativeuri",
  "internalvalues",
  "_format",
  "oslc.paging",
  "oslc.pageNo",
  "oslc.pageno",
  "addschema",
]);

const OPS: WhereOp[] = ["=", "!=", "<=", ">=", "<", ">", "in", "like", "isnull", "isnotnull"];

export type ImportOk = {
  ok: true;
  source: "json" | "url";
  osName?: string;
  dropped: string[];
  notes: string[];
  selectAll: boolean;
  selected: string[];
  aliases: Record<string, string>;
  extraSelect: string[];
  selectLog?: string[];
  chains: ChildChain[];
  where: WhereCondition[];
  /** EXISTS hop filters unfolded from dotted parent WHERE (`asset.priority`). */
  relatedWhere?: RelatedWhere[];
  rawWhere?: string;
  pageSize?: number;
  searchTerms?: string;
  searchAttributes?: string[];
  sortRules: SortRule[];
  savedQuery?: string;
  savedQueryParams?: Record<string, string>;
  collectioncount?: boolean;
  childCollection?: { parentRecordId: string; relationship: string };
  childOptions?: Record<string, unknown>[];
  orMode?: boolean;
  timeline?: TimelineQuery | null;
  domainInternal?: DomainInternalClause[];
  /** Client-only; never part of the live MCP tool call. */
  displayFlatten?: DisplaySpec;
  displayExtra?: Record<string, unknown>;
  displayReport?: ReportSpec;
  displayTable?: TableView;
};

export type ImportResult = ImportOk | { ok: false; error: string };

export type ImportStep = {
  id: string;
  label: string;
  detail?: string;
  lines?: string[];
  status: "pending" | "running" | "done" | "warn";
};

export function parseImport(text: string): ImportResult {
  const raw = text.trim();
  if (!raw) return { ok: false, error: "Paste a tool-call JSON object or an OSLC GET URL." };
  if (raw.startsWith("{") || raw.startsWith("os_query_builder")) return parseToolJson(raw);
  if (/^https?:\/\//i.test(raw) || raw.startsWith("/") || /[?&]oslc\./i.test(raw)) {
    return parseOslcUrl(raw);
  }
  return parseToolJson(raw);
}

function parseToolJson(raw: string): ImportResult {
  let body = raw;
  const wrapped = body.match(/^os_query_builder\s*\(\s*([\s\S]*)\s*\)\s*;?\s*$/);
  if (wrapped) body = wrapped[1];
  let parsed: unknown;
  try {
    parsed = JSON.parse(body);
  } catch {
    return { ok: false, error: "Could not parse JSON. Paste os_query_builder args or wrap them in { }." };
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    return { ok: false, error: "JSON must be an os_query_builder arguments object." };
  }
  return fromArgs(unwrapQueryJson(parsed as Record<string, unknown>), "json");
}

/** Accept `{ ...args, display }`, `{ os_query_builder: args, display }`, or `{ query: args, display }`. */
function unwrapQueryJson(parsed: Record<string, unknown>): Record<string, unknown> {
  const nested = pickNestedArgs(parsed);
  if (!nested) return parsed;
  const display = parsed.display ?? nested.display;
  return display !== undefined ? { ...nested, display } : { ...nested };
}

function pickNestedArgs(parsed: Record<string, unknown>): Record<string, unknown> | null {
  for (const key of ["os_query_builder", "query"] as const) {
    const v = parsed[key];
    if (
      v &&
      typeof v === "object" &&
      !Array.isArray(v) &&
      ("osName" in v || "opAction" in v || "select" in v)
    ) {
      return v as Record<string, unknown>;
    }
  }
  return null;
}

export function parseOslcUrl(raw: string): ImportResult {
  const dropped: string[] = [];
  const notes: string[] = [];
  let url: URL;
  try {
    url = new URL(raw, "http://local.invalid");
  } catch {
    return { ok: false, error: "That does not look like a URL." };
  }
  const osName = osNameFromPath(url.pathname);
  if (!osName) {
    return { ok: false, error: "Could not find /os/{objectStructure} in the path." };
  }
  const childCollection = childCollectionFromPath(url.pathname);
  if (childCollection) {
    notes.push(`Child collection ${childCollection.relationship} of ${childCollection.parentRecordId} - applied as childCollection.`);
  }

  const args: Record<string, unknown> = { osName, opAction: "query" };
  if (childCollection) args.childCollection = childCollection;

  for (const [key, value] of url.searchParams.entries()) {
    const k = key.trim();
    const lower = k.toLowerCase();
    if (DROPPED_PARAMS.has(lower) || DROPPED_PARAMS.has(k)) {
      dropped.push(k);
      continue;
    }
    if (lower === "oslc.select") {
      args.rawSelect = value;
      args.select = { fields: splitCommaAware(value) };
    }
    else if (lower === "oslc.where") args.rawWhere = value;
    else if (lower === "oslc.pagesize") args.pageSize = Number(value);
    else if (lower === "oslc.searchterms" || lower === "searchterms") args.searchTerms = value;
    else if (lower === "searchattributes") args.searchAttributes = value.split(",").map((s) => s.trim()).filter(Boolean);
    else if (lower === "collectioncount") args.collectioncount = value === "1" || value.toLowerCase() === "true";
    else if (lower === "oslc.orderby") args.orderBy = { rules: value.split(",").map((s) => s.trim()).filter(Boolean) };
    else if (lower === "savedquery") args.savedQuery = value;
    else if (lower.startsWith("sqp:")) {
      const params = (args.savedQueryParams as Record<string, string>) ?? {};
      params[k.slice(4)] = value;
      args.savedQueryParams = params;
    } else if (lower === "opmodeor") args.orMode = value === "1" || value.toLowerCase() === "true";
    else if (lower === "tlrange") args.tlrange = value;
    else if (lower === "tlattribute") args.tlattribute = value;
    else if (lower === "domaininternalwhere") args.domaininternalwhere = value;
    else if (lower.endsWith(".opmodeor")) {
      const childOptions = (args.childOptions as Record<string, unknown>[]) ?? [];
      const path = k.slice(0, -".opmodeor".length).split(".").filter(Boolean);
      const relationship = path[path.length - 1] ?? k;
      const on = value === "1" || value.toLowerCase() === "true";
      const existing = childOptions.find((c) => {
        const p = Array.isArray(c.path) ? (c.path as string[]) : [String(c.relationship ?? "")];
        return p.join(".").toLowerCase() === path.join(".").toLowerCase()
          || String(c.relationship ?? "").toLowerCase() === relationship.toLowerCase();
      });
      if (existing) existing.opmodeor = on;
      else {
        childOptions.push({
          relationship,
          path: path.length > 1 ? path : undefined,
          opmodeor: on,
        });
      }
      args.childOptions = childOptions;
    } else if (lower.endsWith(".tlrange") || lower.endsWith(".tlattribute") || lower.endsWith(".domaininternalwhere")) {
      const suffix = lower.endsWith(".tlrange")
        ? ".tlrange"
        : lower.endsWith(".tlattribute")
          ? ".tlattribute"
          : ".domaininternalwhere";
      const key = suffix.slice(1);
      const childOptions = (args.childOptions as Record<string, unknown>[]) ?? [];
      const path = k.slice(0, -suffix.length).split(".").filter(Boolean);
      const relationship = path[path.length - 1] ?? k;
      const existing = childOptions.find((c) => {
        const p = Array.isArray(c.path) ? (c.path as string[]) : [String(c.relationship ?? "")];
        return p.join(".").toLowerCase() === path.join(".").toLowerCase()
          || String(c.relationship ?? "").toLowerCase() === relationship.toLowerCase();
      });
      if (existing) existing[key] = value;
      else {
        childOptions.push({
          relationship,
          path: path.length > 1 ? path : undefined,
          [key]: value,
        });
      }
      args.childOptions = childOptions;
    } else if (lower.endsWith(".where")) {
      const childOptions = (args.childOptions as Record<string, unknown>[]) ?? [];
      const path = k.slice(0, -".where".length).split(".").filter(Boolean);
      const relationship = path[path.length - 1] ?? k;
      childOptions.push({
        relationship,
        path: path.length > 1 ? path : undefined,
        where: value,
      });
      args.childOptions = childOptions;
      notes.push(`Child WHERE on ${k} kept as childOptions (raw).`);
    } else {
      dropped.push(k);
    }
  }

  const result = fromArgs(args, "url");
  if (!result.ok) return result;
  result.dropped = [...new Set([...result.dropped, ...dropped])];
  result.notes = [...result.notes, ...notes];
  return result;
}

function osNameFromPath(pathname: string): string | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p.toLowerCase() === "os");
  if (idx >= 0 && parts[idx + 1]) return parts[idx + 1];
  return undefined;
}

function childCollectionFromPath(pathname: string): { parentRecordId: string; relationship: string } | undefined {
  const parts = pathname.split("/").filter(Boolean);
  const idx = parts.findIndex((p) => p.toLowerCase() === "os");
  if (idx < 0) return undefined;
  const rest = parts.slice(idx + 2);
  if (rest.length >= 2) return { parentRecordId: rest[0], relationship: rest[1] };
  return undefined;
}

function fromArgs(args: Record<string, unknown>, source: "json" | "url"): ImportOk {
  const dropped: string[] = [];
  const notes: string[] = [];
  const osName = typeof args.osName === "string" ? args.osName : undefined;
  const selectFields = readSelectFields(args.select, args.rawSelect);
  const parsedSelect = parseSelectFields(selectFields);

  let where: WhereCondition[] = [];
  let rawWhere: string | undefined;
  const whereObj = args.where && typeof args.where === "object" ? (args.where as { conditions?: unknown }) : null;
  if (Array.isArray(whereObj?.conditions)) {
    where = whereObj.conditions.map(readCondition).filter((c): c is WhereCondition => !!c);
  } else if (typeof args.rawWhere === "string" && args.rawWhere.trim()) {
    const parsed = parseOslcWhere(args.rawWhere);
    if (parsed) where = parsed;
    else {
      rawWhere = args.rawWhere;
      notes.push("Could not parse oslc.where into conditions - kept as rawWhere.");
    }
  }

  const sortRules = readOrderBy(args.orderBy);
  const savedQuery = typeof args.savedQuery === "string" ? args.savedQuery : undefined;
  const savedQueryParams = readStringRecord(args.savedQueryParams);
  const searchTerms = typeof args.searchTerms === "string" ? args.searchTerms : undefined;
  const searchAttributes = Array.isArray(args.searchAttributes)
    ? args.searchAttributes.map((s) => String(s).trim()).filter(Boolean)
    : undefined;
  const pageSize = args.pageSize != null && Number.isFinite(Number(args.pageSize)) ? Number(args.pageSize) : undefined;
  const collectioncount = typeof args.collectioncount === "boolean" ? args.collectioncount : undefined;
  const childCollection = readChildCollection(args.childCollection);
  const childOptions = Array.isArray(args.childOptions) ? (args.childOptions as Record<string, unknown>[]) : undefined;
  const orMode = args.orMode === true || args.orMode === "true" || args.orMode === 1;
  const timeline = parseTimeline(args.tlrange, args.tlattribute);
  const domainInternal = parseDomainInternal(args.domaininternalwhere);

  if (childOptions?.length && !parsedSelect.chains.length) {
    notes.push("Imported childOptions without a matching rel. select - execute still sends them.");
  }

  const display = unpackDisplay(args.display);
  let displayExtra = display?.extra;
  let displayReport: ReportSpec | undefined;
  let displayTable: TableView | undefined;
  if (display) {
    const hops = Object.keys(display.flatten).length;
    if (hops) notes.push(`Display flatten: ${hops} hop${hops === 1 ? "" : "s"}.`);
    let extra = display.extra;
    if (extra.report != null) {
      displayReport = parseReport(extra.report);
      const { report: _r, ...rest } = extra;
      extra = rest;
      if (!isReportEmpty(displayReport)) {
        const bits = [];
        if (displayReport.kpis.length) bits.push(`${displayReport.kpis.length} tile${displayReport.kpis.length === 1 ? "" : "s"}`);
        if (displayReport.charts.length) bits.push(`${displayReport.charts.length} chart${displayReport.charts.length === 1 ? "" : "s"}`);
        notes.push(`Display report: ${bits.join(", ")}.`);
      }
    }
    if (extra.table != null) {
      displayTable = parseTableView(extra.table);
      const { table: _t, ...rest } = extra;
      extra = rest;
      if (!isTableViewEmpty(displayTable)) notes.push("Display table presentation restored.");
    }
    displayExtra = extra;
    if (displayExtra && Object.keys(displayExtra).length) {
      notes.push("Preserved extra display keys for a later round-trip.");
    }
  }

  return {
    ok: true,
    source,
    osName,
    dropped,
    notes,
    selectAll: parsedSelect.selectAll,
    selected: parsedSelect.selected,
    aliases: parsedSelect.aliases,
    extraSelect: parsedSelect.extra,
    chains: parsedSelect.chains,
    where,
    rawWhere,
    pageSize,
    searchTerms,
    searchAttributes,
    sortRules,
    savedQuery,
    savedQueryParams,
    collectioncount,
    childCollection,
    childOptions,
    orMode: orMode || undefined,
    timeline,
    domainInternal: domainInternal.length ? domainInternal : undefined,
    displayFlatten: display?.flatten,
    displayExtra,
    displayReport,
    displayTable,
  };
}

function readSelectFields(select: unknown, rawSelect: unknown): string[] {
  if (typeof rawSelect === "string" && rawSelect.trim()) return splitCommaAware(rawSelect);
  if (select && typeof select === "object" && Array.isArray((select as { fields?: unknown }).fields)) {
    return (select as { fields: unknown[] }).fields.map((f) => (typeof f === "string" ? f : JSON.stringify(f)));
  }
  return [];
}

function readCondition(raw: unknown): WhereCondition | null {
  if (!raw || typeof raw !== "object") return null;
  const rec = raw as Record<string, unknown>;
  const field = String(rec.field ?? "").trim();
  if (!field) return null;
  let op = String(rec.op ?? "=").toLowerCase();
  if (op === "eq") op = "=";
  if (op === "ne") op = "!=";
  const allowed = OPS.includes(op as WhereOp) ? (op as WhereOp) : "=";
  let value = rec.value;
  if (Array.isArray(value)) value = value.map(String).join(",");
  return { field, op: allowed, value: value == null ? "" : String(value) };
}

function readOrderBy(raw: unknown): SortRule[] {
  if (!raw || typeof raw !== "object") return [];
  const rules = (raw as { rules?: unknown }).rules;
  if (!Array.isArray(rules)) return [];
  const out: SortRule[] = [];
  for (const r of rules) {
    const s = String(r).trim();
    if (!s) continue;
    if (s.startsWith("-")) out.push({ field: s.slice(1), dir: "desc" });
    else if (s.startsWith("+")) out.push({ field: s.slice(1), dir: "asc" });
    else {
      const m = s.match(/^(\S+)\s+(asc|desc)$/i);
      if (m) out.push({ field: m[1], dir: m[2].toLowerCase() as "asc" | "desc" });
      else out.push({ field: s, dir: "asc" });
    }
  }
  return out;
}

function readStringRecord(raw: unknown): Record<string, string> | undefined {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (v == null) continue;
    out[k] = String(v);
  }
  return Object.keys(out).length ? out : undefined;
}

function readChildCollection(raw: unknown): { parentRecordId: string; relationship: string } | undefined {
  if (!raw || typeof raw !== "object") return undefined;
  const rec = raw as Record<string, unknown>;
  const parentRecordId = String(rec.parentRecordId ?? rec.parentrecordid ?? "").trim();
  const relationship = String(rec.relationship ?? "").trim();
  if (!parentRecordId || !relationship) return undefined;
  return { parentRecordId, relationship };
}

export function splitCommaAware(s: string): string[] {
  const out: string[] = [];
  let cur = "";
  let depth = 0;
  for (const ch of s) {
    if (ch === "{") depth++;
    else if (ch === "}") depth = Math.max(0, depth - 1);
    if (ch === "," && depth === 0) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
    } else {
      cur += ch;
    }
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}

export function splitAlias(token: string): { name: string; alias?: string } {
  const i = token.indexOf("--");
  if (i <= 0) return { name: token };
  const name = token.slice(0, i).trim();
  const alias = token.slice(i + 2).trim();
  return alias ? { name, alias } : { name };
}

function parseRelToken(token: string): { rel: string; inner: string } | null {
  const m = token.match(/^rel\.([^{]+)\{([\s\S]*)\}$/i);
  if (!m) return null;
  return { rel: m[1].trim(), inner: m[2] };
}

function parseSelectFields(tokens: string[]): {
  selectAll: boolean;
  selected: string[];
  aliases: Record<string, string>;
  extra: string[];
  chains: ChildChain[];
} {
  const selected: string[] = [];
  const aliases: Record<string, string> = {};
  const extra: string[] = [];
  let selectAll = false;

  for (const token of tokens) {
    if (token === "*") {
      selectAll = true;
      continue;
    }
    // Dotted OS paths stay extra until hydrate, which wraps rel.NAME{...}
    // only when NAME is a real MAXRELATIONSHIP (never by target object).
    if (parseRelToken(token) || splitAlias(token).name.includes(".")) {
      if (!extra.includes(token)) extra.push(token);
      continue;
    }
    const { name, alias } = splitAlias(token);
    if (!selected.includes(name)) selected.push(name);
    if (alias) aliases[name] = alias;
  }

  return { selectAll, selected, aliases, extra, chains: [] };
}

function dottedHop(token: string): { head: string; inner: string } | null {
  const { name, alias } = splitAlias(token);
  const dot = name.indexOf(".");
  if (dot <= 0) return null;
  const head = name.slice(0, dot);
  const rest = name.slice(dot + 1);
  if (!head || !rest) return null;
  return { head, inner: alias ? `${rest}--${alias}` : rest };
}

function hopFromOsDotted(
  head: string,
  inners: string[],
  osRel: ChildRel | undefined,
  searchWant?: Set<string>,
): ChildHop {
  const rel: ChildRel = {
    relation: head,
    objectName: osRel?.objectName ?? osRel?.relation ?? head,
    inOs: true,
  };
  const hop = emptyHop(rel);
  hop.inOs = true;
  hop.useRel = false;
  hop.selectAll = false;
  hop.selected = [];
  hop.aliases = {};
  for (const inner of inners) {
    const { name, alias } = splitAlias(inner);
    if (!name.includes(".") && !hop.selected.includes(name)) hop.selected.push(name);
    if (alias) hop.aliases[name] = alias;
  }
  const prefixes = [head, rel.relation, rel.objectName].map((s) => s.toLowerCase());
  hop.searchFields = hop.selected.filter((f) => {
    if (!searchWant?.size) return true;
    return prefixes.some((p) => searchWant.has(`${p}.${f}`.toLowerCase()));
  });
  return hop;
}

function parseRelTree(token: string): RelTree | null {
  const parsed = parseRelToken(token);
  if (!parsed) return null;
  const tree: RelTree = { rel: parsed.rel, fields: [], aliases: {}, kids: [] };
  const inner = parsed.inner.trim();
  if (!inner || inner === "*") {
    tree.fields.push("*");
    return tree;
  }
  for (const part of splitCommaAware(inner)) {
    if (part === "*") {
      tree.fields.push("*");
      continue;
    }
    const kid = parseRelTree(part);
    if (kid) {
      tree.kids.push(kid);
      continue;
    }
    const { name, alias } = splitAlias(part);
    if (!name) continue;
    if (!tree.fields.includes(name)) tree.fields.push(name);
    if (alias) tree.aliases[name] = alias;
  }
  return tree;
}

type RelTree = {
  rel: string;
  fields: string[];
  aliases: Record<string, string>;
  kids: RelTree[];
};

function cloneHop(h: ChildHop): ChildHop {
  return {
    ...h,
    selected: [...h.selected],
    searchFields: [...(h.searchFields ?? [])],
    aliases: { ...h.aliases },
    conditions: h.conditions.map((c) => ({ ...c })),
    domainInternal: h.domainInternal?.map((d) => ({ ...d })),
  };
}

function chainsFromRelTree(
  tree: RelTree,
  osRels: ChildRel[],
  compactRels: ChildRel[] = [],
  prefix: ChildHop[] = [],
): ChildChain[] {
  const os = matchOsChild(tree.rel, osRels);
  const compact = os ? undefined : matchRelExact(tree.rel, compactRels);
  const hit = os ?? compact;
  const hop = emptyHop({
    relation: hit?.relation ?? tree.rel,
    objectName: hit?.objectName ?? tree.rel.toUpperCase(),
    inOs: prefix.length === 0 ? !!os : false,
  });
  hop.inOs = prefix.length === 0 ? !!os : false;
  hop.useRel = !(prefix.length === 0 && os);
  const star = tree.fields.includes("*");
  hop.selectAll = star || (tree.fields.length === 0 && tree.kids.length === 0);
  hop.selected = tree.fields.filter((f) => f !== "*");
  hop.aliases = { ...tree.aliases };
  hop.searchFields = [...hop.selected];
  const here = [...prefix, hop];
  if (!tree.kids.length) return [{ hops: here }];
  const out: ChildChain[] = [];
  for (const kid of tree.kids) {
    const branch = tree.kids.length > 1 ? here.map(cloneHop) : here;
    out.push(...chainsFromRelTree(kid, osRels, compactRels, branch));
  }
  return out;
}

function classifySelectHops(
  extra: string[],
  osRels: ChildRel[],
  compactRels: ChildRel[] = [],
  searchAttributes?: string[],
): { extra: string[]; chains: ChildChain[]; lines: string[] } {
  const outExtra: string[] = [];
  const chains: ChildChain[] = [];
  const lines: string[] = [];
  const searchWant = searchAttributes?.length
    ? new Set(searchAttributes.map((s) => s.toLowerCase()))
    : undefined;
  const grouped = new Map<string, { originals: string[]; inners: string[] }>();
  const groupOrder: string[] = [];

  for (const token of extra) {
    const relBlock = parseRelToken(token);
    if (relBlock) {
      const tree = parseRelTree(token);
      const os = matchOsChild(relBlock.rel, osRels);
      const compact = os ? undefined : matchRelExact(relBlock.rel, compactRels);
      if (tree && (os || compact || tree.kids.length)) {
        const fromTree = chainsFromRelTree(tree, osRels, compactRels);
        chains.push(...fromTree);
        const preview = token.length > 64 ? `${token.slice(0, 64)}...` : token;
        const paths = fromTree.map((c) => c.hops.map((h) => h.relationship).join(" -> ") || relBlock.rel);
        lines.push(`${preview} -> Child options | ${paths.join("; ")}`);
      } else {
        if (!outExtra.includes(token)) outExtra.push(token);
        const preview = token.length > 64 ? `${token.slice(0, 64)}...` : token;
        lines.push(`${preview} - kept rel. block as written`);
      }
      continue;
    }
    const dotted = dottedHop(token);
    if (dotted) {
      const key = dotted.head.toLowerCase();
      let g = grouped.get(key);
      if (!g) {
        g = { originals: [], inners: [] };
        grouped.set(key, g);
        groupOrder.push(key);
      }
      g.originals.push(token);
      g.inners.push(dotted.inner);
      continue;
    }
    if (!outExtra.includes(token)) outExtra.push(token);
    lines.push(`${token} - keep as-is`);
  }

  for (const key of groupOrder) {
    const g = grouped.get(key)!;
    const head = g.originals[0] ? dottedHop(g.originals[0])!.head : key;
    const os = matchOsChild(head, osRels);
    chains.push({ hops: [hopFromOsDotted(head, g.inners, os, searchWant)] });
    const label = os
      ? `OS child ${os.objectName} (${os.relation})`
      : `OS-style ${head} (dotted select, no rel.)`;
    const src = g.originals.length > 3
      ? `${g.originals.slice(0, 3).join(", ")} +${g.originals.length - 3}`
      : g.originals.join(", ");
    lines.push(`${src} -> Child options | ${label}`);
  }

  return { extra: outExtra, chains, lines };
}

function applyChildOptionFlags(
  chains: ChildChain[],
  options: Record<string, unknown>[] | undefined,
) {
  if (!options?.length) return;
  for (const opt of options) {
    const path = (Array.isArray(opt.path) ? opt.path.map(String) : [])
      .filter(Boolean)
      .map((p) => p.toLowerCase());
    const rel = String(opt.relationship ?? "").toLowerCase();
    for (const chain of chains) {
      const names = chain.hops.map((h) => h.relationship.toLowerCase());
      let hop: ChildHop | undefined;
      if (path.length) {
        if (path.length <= names.length && path.every((p, i) => names[i] === p)) {
          hop = chain.hops[path.length - 1];
        }
      } else if (rel && names[0] === rel) {
        hop = chain.hops[0];
      }
      if (!hop) continue;
      if (opt.opmodeor === true || opt.opmodeor === "true" || opt.opmodeor === 1) hop.opmodeor = true;
      if (opt.noLimit === true || opt.noLimit === "true" || opt.noLimit === 1) hop.noLimit = true;
      const lim = Number(opt.limit);
      if (Number.isFinite(lim) && lim > 0) hop.limit = Math.floor(lim);
      const tl = parseTimeline(opt.tlrange, opt.tlattribute);
      if (tl) hop.timeline = tl;
      const diw = parseDomainInternal(opt.domaininternalwhere);
      if (diw.length) hop.domainInternal = diw;
      const conds = readChildWhere(opt.where);
      if (conds?.length) hop.conditions = conds;
    }
  }
}

function readChildWhere(raw: unknown): WhereCondition[] | undefined {
  if (raw == null) return undefined;
  if (typeof raw === "string" && raw.trim()) {
    return parseOslcWhere(raw) ?? undefined;
  }
  if (typeof raw === "object" && !Array.isArray(raw)) {
    const rec = raw as { conditions?: unknown };
    if (Array.isArray(rec.conditions)) {
      const conds = rec.conditions.map(readCondition).filter((c): c is WhereCondition => !!c);
      return conds.length ? conds : undefined;
    }
  }
  return undefined;
}

export function hydrateImport(
  imported: ImportOk,
  fields: FieldInfo[],
  compactRels: ChildRel[],
  osRels: ChildRel[] = [],
): ImportOk {
  const parentNames = new Set(fields.map((f) => f.name.toLowerCase()));
  const selected: string[] = [];
  const stagedExtra: string[] = [];
  const seenExtra = new Set<string>();
  const aliases = { ...imported.aliases };
  const pushExtra = (token: string) => {
    if (!token || seenExtra.has(token)) return;
    seenExtra.add(token);
    stagedExtra.push(token);
  };
  for (const token of imported.extraSelect) pushExtra(token);

  for (const name of imported.selected) {
    if (parentNames.has(name.toLowerCase())) {
      if (!selected.includes(name)) selected.push(name);
    } else {
      pushExtra(aliases[name] ? `${name}--${aliases[name]}` : name);
      delete aliases[name];
    }
  }

  const classified = classifySelectHops(stagedExtra, osRels, compactRels, imported.searchAttributes);
  const parentLine = selected.length
    ? `${selected.length} parent field${selected.length === 1 ? "" : "s"}`
    : undefined;
  const selectLog = [
    ...(parentLine ? [parentLine] : []),
    ...classified.lines,
  ];

  const chains = [
    ...classified.chains,
    ...imported.chains.map((chain) => ({
      hops: chain.hops.map((hop) => {
        const os = matchOsChild(hop.relationship, osRels);
        const hit = os ?? matchRelExact(hop.relationship, compactRels) ?? matchRel(hop.relationship, compactRels);
        return {
          ...hop,
          relationship: hop.relationship,
          objectName: hit?.objectName ?? hop.objectName,
          inOs: hop.inOs ?? !!os,
        };
      }),
    })),
  ];

  if (imported.searchAttributes) {
    const want = new Set(imported.searchAttributes.map((s) => s.toLowerCase()));
    for (const chain of chains) {
      for (const hop of chain.hops) {
        hop.searchFields = hop.selected.filter((f) => {
          const keys = [hop.relationship, hop.objectName, hop.objectName.toLowerCase()];
          return keys.some((p) => want.has(`${p}.${f}`.toLowerCase()));
        });
      }
    }
  }

  applyChildOptionFlags(chains, imported.childOptions);

  const unfolded = unfoldDottedWhere(imported.where, compactRels, osRels, chains, parentNames);

  return {
    ...imported,
    selected,
    aliases,
    extraSelect: classified.extra,
    selectLog,
    chains,
    where: unfolded.parent,
    relatedWhere: unfolded.related,
  };
}

/** Match a dotted-WHERE hop name against OS children, compact rels, or hops already in select. */
function resolveWhereHop(
  name: string,
  compactRels: ChildRel[],
  osRels: ChildRel[],
  chains: ChildChain[],
): { relationship: string; objectName: string; whereClause?: string | null } | undefined {
  const os = matchOsChild(name, osRels);
  if (os) return { relationship: os.relation, objectName: os.objectName, whereClause: os.whereClause };
  const exact = matchRelExact(name, osRels) ?? matchRelExact(name, compactRels);
  if (exact) return { relationship: exact.relation, objectName: exact.objectName, whereClause: exact.whereClause };
  const fuzzy = matchRel(name, osRels) ?? matchRel(name, compactRels);
  if (fuzzy) return { relationship: fuzzy.relation, objectName: fuzzy.objectName, whereClause: fuzzy.whereClause };
  const want = name.toLowerCase();
  for (const chain of chains) {
    for (const hop of chain.hops) {
      if (hop.relationship.toLowerCase() === want || hop.objectName.toLowerCase() === want) {
        return { relationship: hop.relationship, objectName: hop.objectName, whereClause: hop.whereClause };
      }
    }
  }
  return undefined;
}

/**
 * Split dotted parent WHERE (`asset.priority = 2`) into related-WHERE hops.
 * Unresolved paths stay on the parent so import never drops a condition.
 */
export function unfoldDottedWhere(
  where: WhereCondition[],
  compactRels: ChildRel[],
  osRels: ChildRel[],
  chains: ChildChain[],
  parentNames: Set<string>,
): { parent: WhereCondition[]; related: RelatedWhere[] } {
  const parent: WhereCondition[] = [];
  const groups = new Map<string, RelatedWhere>();

  for (const cond of where) {
    if (!cond.field.includes(".")) {
      parent.push(cond);
      continue;
    }
    if (parentNames.has(cond.field.toLowerCase())) {
      parent.push(cond);
      continue;
    }
    const parts = cond.field.split(".").filter(Boolean);
    if (parts.length < 2) {
      parent.push(cond);
      continue;
    }
    const fieldName = parts[parts.length - 1];
    const hopNames = parts.slice(0, -1);
    const hops: RelatedWhere["hops"] = [];
    let ok = true;
    for (const hopName of hopNames) {
      const meta = resolveWhereHop(hopName, compactRels, osRels, chains);
      if (!meta) {
        ok = false;
        break;
      }
      hops.push({
        relationship: meta.relationship,
        objectName: meta.objectName,
        whereClause: meta.whereClause,
        conditions: [],
      });
    }
    if (!ok || hops.length === 0) {
      parent.push(cond);
      continue;
    }
    const key = hops.map((h) => h.relationship.toLowerCase()).join(".");
    let filter = groups.get(key);
    if (!filter) {
      filter = { hops, conditions: [] };
      groups.set(key, filter);
    }
    const leaf = { ...cond, field: fieldName };
    const last = filter.hops[filter.hops.length - 1];
    last.conditions = [...(last.conditions ?? []), leaf];
    filter.conditions = last.conditions ?? [];
  }

  return { parent, related: [...groups.values()] };
}

export function searchOffFromImport(imported: ImportOk, selected: string[]): Set<string> {
  if (!imported.searchAttributes) return new Set();
  const want = new Set(imported.searchAttributes.map((s) => s.toLowerCase()));
  const off = new Set<string>();
  for (const name of selected) {
    if (!want.has(name.toLowerCase())) off.add(name);
  }
  return off;
}

export function savedParamsFromImport(imported: ImportOk): Record<string, QueryParam> {
  const out: Record<string, QueryParam> = {};
  for (const [k, v] of Object.entries(imported.savedQueryParams ?? {})) {
    out[k] = { value: v, isDynamic: false };
  }
  return out;
}

function parseOslcWhere(clause: string): WhereCondition[] | null {
  const parts = splitBoolean(clause, "and");
  const conds: WhereCondition[] = [];
  for (const part of parts) {
    const t = part.trim();
    if (!t) continue;
    const nullish = t.match(/^([^\s=!<>]+)\s*(!=|=)\s*\*?STAR\*?$/i);
    if (nullish) {
      conds.push({ field: nullish[1], op: nullish[2] === "!=" ? "isnull" : "isnotnull", value: "" });
      continue;
    }
    const m = t.match(/^([^\s=!<>]+)\s*(=|!=|<=|>=|<|>|like|in)\s*(.*)$/i);
    if (!m) return null;
    const field = m[1];
    const op = m[2].toLowerCase() as WhereOp;
    let value = m[3].trim();
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    if (op === "in") {
      value = value.replace(/^[\[(]|[\])]$/g, "").split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).join(",");
    }
    conds.push({ field, op, value });
  }
  return conds;
}

function splitBoolean(clause: string, op: string): string[] {
  const out: string[] = [];
  let cur = "";
  let quote: string | null = null;
  let i = 0;
  while (i < clause.length) {
    const ch = clause[i];
    if (quote) {
      cur += ch;
      if (ch === quote) quote = null;
      i++;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      i++;
      continue;
    }
    const m = clause.slice(i).match(new RegExp(`^\\s+${op}\\s+`, "i"));
    if (m) {
      if (cur.trim()) out.push(cur.trim());
      cur = "";
      i += m[0].length;
      continue;
    }
    cur += ch;
    i++;
  }
  if (cur.trim()) out.push(cur.trim());
  return out;
}
