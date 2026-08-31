/** Related-select flatten spec stored with a saved query. */
import { ChildChain, FieldInfo } from "../types";
import { DisplaySpec } from "./schema";
import { parseSelectToken, SelectBranch } from "./selectTree";

/** Bump when the `display` export shape itself changes, not when new optional keys appear. */
export const DISPLAY_BUNDLE_VERSION = 1;

function readFlatten(raw: unknown): DisplaySpec {
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return {};
  const out: DisplaySpec = {};
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (!k || !Array.isArray(v)) continue;
    const names = v.map((s) => String(s).trim()).filter(Boolean);
    if (names.length) out[k] = names;
  }
  return out;
}

function isHopMap(raw: Record<string, unknown>): boolean {
  const values = Object.values(raw);
  if (!values.length) return true;
  return values.every((v) => v == null || Array.isArray(v));
}

/**
 * Client-only display settings for query JSON export/import.
 * Never sent on the live `os_query_builder` call - MCP would reject or ignore it.
 * Unknown keys besides `flatten` / `version` round-trip so later settings survive.
 * Known optional keys packed by callers: `report` (tiles + charts), `table`
 * (header, column order, style rules). Add new slices the same way - do not
 * bump `DISPLAY_BUNDLE_VERSION` for optional keys.
 */
export function packDisplay(
  flatten: DisplaySpec,
  extra: Record<string, unknown> = {},
): Record<string, unknown> | undefined {
  const clean = readFlatten(flatten);
  const rest: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(extra)) {
    if (k === "flatten" || k === "version") continue;
    rest[k] = v;
  }
  if (!Object.keys(clean).length && !Object.keys(rest).length) return undefined;
  return { version: DISPLAY_BUNDLE_VERSION, ...rest, flatten: clean };
}

export function unpackDisplay(raw: unknown): { flatten: DisplaySpec; extra: Record<string, unknown> } | null {
  if (raw == null) return null;
  if (typeof raw !== "object" || Array.isArray(raw)) return null;
  const rec = raw as Record<string, unknown>;
  if (rec.flatten != null && typeof rec.flatten === "object" && !Array.isArray(rec.flatten)) {
    const extra: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(rec)) {
      if (k === "flatten" || k === "version") continue;
      extra[k] = v;
    }
    return { flatten: readFlatten(rec.flatten), extra };
  }
  if (!("version" in rec) && isHopMap(rec)) {
    return { flatten: readFlatten(rec), extra: {} };
  }
  const extra: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(rec)) {
    if (k === "flatten" || k === "version") continue;
    extra[k] = v;
  }
  return { flatten: {}, extra };
}

export type RelatedSelect = {
  /** Dotted hop path (`ASSET` or `ASSET.ACTIVEASSETMETER`). */
  key: string;
  path: string;
  source: "chain" | "extra";
  selectAll: boolean;
  fieldList: string[];
  objectName: string;
};

function hopKey(parts: string[]): string {
  return parts.join(".");
}

/** Related collections currently in the query - one entry per hop, not per chain. */
export function relatedSelectsFromQuery(chains: ChildChain[], extraSelect: string[]): RelatedSelect[] {
  const out: RelatedSelect[] = [];
  const seen = new Set<string>();
  const add = (item: RelatedSelect) => {
    const k = item.key.replace(/^rel\./gi, "").toLowerCase();
    if (!k || seen.has(k)) return;
    seen.add(k);
    out.push(item);
  };
  for (const chain of chains) {
    const hops = chain.hops.filter((h) => h.relationship);
    const acc: string[] = [];
    for (const hop of hops) {
      acc.push(hop.relationship);
      add({
        key: hopKey(acc),
        path: acc.join(" -> "),
        source: "chain",
        selectAll: hop.selectAll,
        fieldList: hop.selectAll ? [] : [...(hop.selected ?? [])],
        objectName: hop.objectName,
      });
    }
  }
  const walkExtra = (branch: SelectBranch, prefix: string[]) => {
    if (!branch.name || branch.name === "*") return;
    const path = [...prefix, branch.name];
    const fieldList = branch.fields.map((f) => f.name);
    add({
      key: hopKey(path),
      path: branch.rel && path.length === 1 ? `rel.${branch.name}` : path.join(" -> "),
      source: "extra",
      selectAll: branch.star && fieldList.length === 0,
      fieldList,
      objectName: branch.name,
    });
    for (const kid of branch.kids) walkExtra(kid, path);
  };
  for (const tok of extraSelect) {
    const b = parseSelectToken(tok);
    const nested = b.rel || b.kids.length > 0 || b.star || b.fields.length > 0 || tok.includes("{") || tok.includes(".");
    if (!nested || !b.name || b.name === "*") continue;
    walkExtra(b, []);
  }
  return out;
}

export function fieldsForRelatedSelect(
  item: RelatedSelect,
  cache: Record<string, FieldInfo[]>,
): string[] {
  if (!item.selectAll) return [...item.fieldList];
  return (cache[item.objectName.toUpperCase()] ?? []).map((f) => f.name);
}
