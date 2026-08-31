/** CORE + intent-token field suggestions (not Assist). */
import { FieldInfo } from "../types";

/**
 * Suggested columns - not the Assist model and not a per-OS encyclopedia.
 *
 * Score = static CORE identity/status fields (wonum, ticketid, status, ...)
 * plus any attribute whose name or title overlaps the intent sentence.
 * Top 24 with score > 0. Empty intent still surfaces CORE fields present
 * on this object.
 */
const CORE = new Set([
  "wonum", "assetnum", "siteid", "orgid", "status", "description", "location",
  "cinum", "ticketid", "worktype", "woclass", "reportdate", "changedate",
  "reportedby", "priority", "failurecode", "problemcode", "istask", "historyflag",
  "assetid", "workorderid", "locationid", "pluspcustomer",
]);

export function intentTokens(intent: string): string[] {
  return intent.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2);
}

export function usefulFields(fields: FieldInfo[], intent: string): FieldInfo[] {
  const tokens = intentTokens(intent);
  const scored = fields.map((f) => {
    let n = 0;
    if (CORE.has(f.name.toLowerCase())) n += 5;
    const hay = `${f.name} ${f.title}`.toLowerCase();
    for (const t of tokens) if (hay.includes(t)) n += 3;
    return { f, n };
  });
  return scored
    .filter((s) => s.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 24)
    .map((s) => s.f);
}

/** Useful hits, or the first 18 attributes if this object has none of CORE/intent. */
export function usefulOrFallback(fields: FieldInfo[], intent: string): FieldInfo[] {
  const u = usefulFields(fields, intent);
  return u.length ? u : fields.slice(0, 18);
}

export function matchFields(fields: FieldInfo[], intent: string): string[] {
  return usefulOrFallback(fields, intent).map((f) => f.name);
}

/** Append names that are not already selected - Useful is additive, Search is too. */
export function mergeFieldNames(current: string[], extra: string[]): string[] {
  const seen = new Set(current);
  const out = [...current];
  for (const n of extra) {
    if (!seen.has(n)) {
      seen.add(n);
      out.push(n);
    }
  }
  return out;
}
