/**
 * Optional Assist hook. The wizard calls `assistInfer` from Suggest, and
 * auto-runs keyword extract when you land on the object-structure step
 * with Assist on and an intent.
 *
 * TRANSPORT: provider-agnostic via `/api/assist/*`, backed by litellm on the
 * backend (`app/llm/client.py`) - whichever provider an admin has configured
 * in Settings (OpenAI, Anthropic, Azure, local Ollama, any OpenAI-compatible
 * endpoint). Assist is only enabled once a provider is configured - see
 * `GET /api/llm/config`'s `configured` flag, gated in the UI (docs/DECISIONS.md
 * MQB-006). Prompt, schema, and candidate validation stay here. The model may
 * only pick names that already exist in AssistInput. Prompt copy lives in
 * assistPrompts.ts.
 *
 * SESSIONS (docs/DECISIONS.md MQB-007): pass a `sessionId` (from
 * `startAssistSession()`) to `assistInfer` to give one wizard run's Assist
 * calls shared memory - each step's call then sees what earlier steps
 * already decided (via `POST /api/assist/session/{id}/chat`), instead of
 * every call being a fresh, memoryless 2-message exchange (the default
 * when `sessionId` is omitted - still `POST /api/assist/chat`, unchanged).
 * The backend auto-expires an idle session after a few minutes regardless
 * of whether `endAssistSession` is called.
 */

import { assistChatOptions, assistSystemPrompt, assistUserPrompt } from "./assistPrompts";

export type AssistStep = "intentRewrite" | "osKeyword" | "os" | "fields" | "children" | "where" | "related";

export type AssistInput = {
  intent: string;
  /** Per-step note, e.g. "filter on site Bedford". */
  need?: string;
  step: AssistStep;
  /** Wizard scene: which object, hop path, select vs EXISTS vs child-row filter. */
  scene?: string;
  osHits?: { osName: string; description?: string; primaryObject?: string; savedQueries?: number }[];
  fields?: { name: string; title: string; type?: string; domainId?: string }[];
  children?: { relation: string; objectName: string; inOs?: boolean; inheritedFrom?: string; whereClause?: string | null }[];
};

export type AssistOutput = {
  intent?: string;
  keyword?: string;
  osName?: string;
  osNames?: string[];
  fields?: string[];
  relations?: string[];
  where?: { field: string; op: string; value: string }[];
};

export type AssistHealth = {
  available: boolean;
  model?: string;
  models?: string[];
  reason?: string;
};

const ASSIST_KEY = "mqb.assist";

let healthCache: AssistHealth | null = null;
let firstChat = true;
let lastError: string | null = null;
let lastSessionExpired = false;

/** True if the most recent `assistInfer(input, sessionId)` call failed
 * because that sessionId no longer exists server-side (idle-expired, or the
 * backend restarted). Callers should drop their cached sessionId and let the
 * next call start a fresh one via `startAssistSession()` - cleared at the
 * start of every `assistInfer` call. */
export function lastAssistSessionExpired(): boolean {
  return lastSessionExpired;
}

export function assistOn(): boolean {
  return localStorage.getItem(ASSIST_KEY) === "1";
}

export function setAssistOn(on: boolean) {
  localStorage.setItem(ASSIST_KEY, on ? "1" : "0");
}

export function lastAssistHealth(): AssistHealth | null {
  return healthCache;
}

export function lastAssistError(): string | null {
  return lastError;
}

export function clearAssistHealthCache() {
  healthCache = null;
}

export function assistNeedsWarmup(): boolean {
  return firstChat;
}

export async function ensureAssistModel(force = false): Promise<boolean> {
  if (!force && healthCache?.available) return true;
  try {
    const res = await fetch("/api/assist/health", { signal: AbortSignal.timeout(5000) });
    if (!res.ok) {
      healthCache = { available: false, reason: `HTTP ${res.status}` };
      return false;
    }
    const data = (await res.json()) as AssistHealth;
    healthCache = {
      available: !!data.available,
      model: data.model,
      models: data.models,
      reason: data.reason,
    };
    return healthCache.available;
  } catch {
    healthCache = { available: false, reason: "Assist health check failed - is the backend running?" };
    return false;
  }
}

/** Starts a wizard-run Assist conversation. Returns null (not thrown) on any
 * failure - session memory is a nice-to-have, so callers should fall back to
 * stateless `assistInfer(input)` (omit `sessionId`) rather than blocking the
 * wizard on this. Call once, lazily, on first Assist use per wizard mount. */
export async function startAssistSession(): Promise<string | null> {
  try {
    const res = await fetch("/api/assist/session", {
      method: "POST",
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) return null;
    const data = (await res.json()) as { sessionId?: string };
    return data.sessionId ?? null;
  } catch {
    return null;
  }
}

/** Best-effort cleanup when a wizard closes normally. Never throws - an
 * idle session expires server-side on its own (see MQB-007), so a failed or
 * skipped call here (tab closed, network drop) is not a leak. `keepalive`
 * lets the request survive the page/component teardown that usually
 * triggers this call. */
export function endAssistSession(sessionId: string): void {
  try {
    void fetch(`/api/assist/session/${sessionId}`, { method: "DELETE", keepalive: true });
  } catch {
    /* best-effort */
  }
}

/**
 * What gets stored in session history in place of this turn's real user
 * message. The real message (`assistUserPrompt`'s output) embeds the whole
 * candidate catalog for this step - every OS hit, every field, every
 * relationship, sometimes hundreds of entries - which only matters for THIS
 * call's own decision. If session replay stored that verbatim, every later
 * wizard step would re-pay (in tokens, against a paid provider's budget, and
 * against a small local model's context window) for every earlier step's
 * catalog, compounding turn over turn. The model's reply doesn't need this
 * treatment - it's already small, schema-constrained JSON (e.g.
 * `{"fields":["assetnum"]}`), not a catalog - so only the user side needs a
 * stand-in. This line just needs to remind the model what step ran and any
 * free-text note the user gave it; the actual decision is recoverable from
 * the stored assistant reply on the next turn.
 */
function memoryLineFor(input: AssistInput): string {
  const need = input.need?.trim();
  return `[${input.step}]${need ? ` note: ${need}` : ""}`;
}

export async function assistInfer(input: AssistInput, sessionId?: string): Promise<AssistOutput | null> {
  lastError = null;
  lastSessionExpired = false;
  const format = schemaFor(input);
  if (!format) {
    lastError = "Nothing to infer for this step.";
    return null;
  }
  const user = assistUserPrompt(input, input.step === "children" || input.step === "related" ? rankChildren(input) : undefined);
  if (!user) {
    lastError = "Nothing to infer for this step.";
    return null;
  }
  const url = sessionId ? `/api/assist/session/${sessionId}/chat` : "/api/assist/chat";
  try {
    const res = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      signal: AbortSignal.timeout(120000),
      body: JSON.stringify({
        step: input.step,
        messages: [
          { role: "system", content: assistSystemPrompt(input.step) },
          { role: "user", content: user },
        ],
        format,
        options: assistChatOptions(input.step),
        // Session-history stand-in for this call's user message - see
        // memoryLineFor() below for why the full `user` text (it embeds the
        // whole candidate catalog: every field, every OS hit, every
        // relationship) must never be what gets replayed into later steps.
        ...(sessionId ? { memory: memoryLineFor(input) } : {}),
      }),
    });
    firstChat = false;
    if (!res.ok) {
      let detail = `Assist HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string } };
        if (body?.error?.message) detail = body.error.message;
        if (sessionId && res.status === 404 && body?.error?.code === "assist_session_not_found") {
          lastSessionExpired = true;
        }
      } catch { /* keep detail */ }
      lastError = detail;
      return null;
    }
    const data = (await res.json()) as { content?: string };
    const raw = data?.content;
    if (!raw || typeof raw !== "string") {
      lastError = "Model returned an empty reply.";
      return null;
    }
    let parsed: AssistOutput;
    try {
      parsed = JSON.parse(raw) as AssistOutput;
    } catch {
      lastError = "Model did not return JSON. Try Suggest again.";
      return null;
    }
    const out = validate(input, parsed);
    if (!out) lastError = "Could not use the model reply. Try a clearer intent.";
    return out;
  } catch (e) {
    firstChat = false;
    const name = e instanceof DOMException ? e.name : "";
    lastError = name === "TimeoutError"
      ? "Assist timed out waiting for the model. It may still be loading."
      : e instanceof Error ? e.message : "Assist request failed.";
    return null;
  }
}

const STOP = new Set([
  "build", "query", "fetch", "all", "with", "and", "its", "the", "for", "to", "from",
  "this", "that", "into", "include", "including", "data", "information", "info",
  "result", "results", "related", "child", "rows", "row", "show", "get", "give",
  "make", "want", "need", "please", "also", "each", "every",
]);

function intentTokens(input: AssistInput): string[] {
  const raw = `${input.intent} ${input.need ?? ""}`.toLowerCase().split(/[^a-z0-9]+/).filter((t) => t.length > 2 && !STOP.has(t));
  const out: string[] = [];
  for (const t of raw) {
    out.push(t);
    if (t === "asset" || t === "assets") out.push("ci", "actci", "multiasset");
    if (t === "reading" || t === "readings" || t === "meter") out.push("meter", "reading", "measure");
    if (t === "log" || t === "worklog") out.push("worklog");
    if (t === "document" || t === "attachment") out.push("doclink");
  }
  return out;
}

/** Tokens that describe the parent row, not a child relation. */
const CHILD_WEAK = new Set(["status", "service", "request", "requests", "ticket", "tickets", "last", "overall"]);

function intentHayScore(hay: string, input: AssistInput, mode: "any" | "child" = "any"): number {
  const h = hay.toLowerCase();
  const tokens = mode === "child"
    ? intentTokens(input).filter((t) => !CHILD_WEAK.has(t))
    : intentTokens(input);
  let n = 0;
  const relation = h.split(/\s+/)[0] ?? h;
  for (const t of tokens) {
    if (h.includes(t)) n += 1;
    if (mode === "child" && relation === t) n += 2;
  }
  const text = `${input.intent} ${input.need ?? ""}`.toLowerCase();
  if (!/\bsite\b/.test(text) && /\bsite\b/.test(h)) n -= 1.5;
  if (!/\b(doc|attach)/.test(text) && /doclink/.test(h)) n -= 1.5;
  if (!/\b(worklog|log|note)\b/.test(text) && /worklog/.test(h)) n -= 1;
  if (!/\b(workflow|assign)/.test(text) && /\b(wf|workflow)/.test(h)) n -= 1;
  return n;
}

function rankChildren(input: AssistInput): NonNullable<AssistInput["children"]> {
  const list = [...(input.children ?? [])];
  return list.sort((a, b) => {
    const ds = intentHayScore(`${b.relation} ${b.objectName} ${b.inheritedFrom ?? ""}`, input, "child")
      - intentHayScore(`${a.relation} ${a.objectName} ${a.inheritedFrom ?? ""}`, input, "child");
    if (ds !== 0) return ds;
    return Number(!!b.inOs) - Number(!!a.inOs);
  });
}

/**
 * Trims the model's own picks to `max` - it does NOT re-filter by keyword
 * overlap unless there are actually more picks than `max` to choose among.
 *
 * This used to filter to items scoring >0 on intent-keyword overlap
 * unconditionally, discarding anything the model picked that didn't share a
 * literal word with the typed intent/note. That was a reasonable guardrail
 * for a small local model prone to dumping the whole catalog, but it
 * actively fights a capable hosted model that already reasons about
 * relevance semantically: a good field pick with no lexical overlap
 * ("station" fields for an intent about "readings", say) was silently
 * dropped even when the model returned well under the cap. Only fall back
 * to keyword-based selection when there's an actual excess to choose among.
 */
function capByIntent<T>(
  items: T[],
  max: number,
  score: (item: T) => number,
  opts?: { emptyIfNoHit?: boolean },
): T[] {
  const uniq = [...new Set(items)];
  if (uniq.length <= max) return uniq;
  const ranked = [...uniq].sort((a, b) => score(b) - score(a));
  const hits = ranked.filter((i) => score(i) > 0).slice(0, max);
  if (hits.length) return hits;
  if (opts?.emptyIfNoHit) return [];
  return uniq.slice(0, max);
}

/** Small models love isnotnull as a cop-out. Only offer null-ops when the user asked. */
function whereOpsFor(input: AssistInput): string[] {
  const text = `${input.intent} ${input.need ?? ""}`.toLowerCase();
  const wantsNull = /\b(empty|blank|missing|null|unset|not set|not empty|is filled|has a value)\b/.test(text);
  const ops = ["=", "like", "in", "!=", "<", ">", "<=", ">="];
  if (wantsNull) ops.push("isnull", "isnotnull");
  return ops;
}

/**
 * Ceilings on how many picks a step can return. Deliberately generous, not
 * "typical" counts - the system prompt (assistPrompts.ts) tells the model
 * what's typical; these just stop a pathological response from producing an
 * unusable wall of chips. A capable hosted model asked for "all fields" or a
 * specific larger set should get real headroom to do that, not be silently
 * clipped back down to a small default. Shared between `schemaFor` (the
 * hard JSON-Schema `maxItems`) and `validate` (`capByIntent`'s `max`) so the
 * two never drift out of sync with each other.
 */
const PICK_CAPS: Record<"fields" | "children" | "related" | "where", number> = {
  fields: 25,
  children: 6,
  related: 4,
  where: 6,
};

function schemaFor(input: AssistInput): Record<string, unknown> | null {
  if (input.step === "intentRewrite") {
    return {
      type: "object",
      properties: { intent: { type: "string" } },
      required: ["intent"],
    };
  }
  if (input.step === "osKeyword") {
    return {
      type: "object",
      properties: { keyword: { type: "string" } },
      required: ["keyword"],
    };
  }
  if (input.step === "os") {
    const names = (input.osHits ?? []).map((h) => h.osName).filter(Boolean);
    if (!names.length) return null;
    return {
      type: "object",
      properties: { osNames: { type: "array", items: { type: "string", enum: names }, maxItems: 3 } },
      required: ["osNames"],
    };
  }
  if (input.step === "fields") {
    const names = (input.fields ?? []).map((f) => f.name).filter(Boolean);
    if (!names.length) return null;
    return {
      type: "object",
      properties: {
        fields: { type: "array", items: { type: "string", enum: names }, maxItems: Math.min(names.length, PICK_CAPS.fields) },
      },
      required: ["fields"],
    };
  }
  if (input.step === "children" || input.step === "related") {
    const names = (input.children ?? []).map((c) => c.relation).filter(Boolean);
    if (!names.length) return null;
    const cap = input.step === "related" ? PICK_CAPS.related : PICK_CAPS.children;
    return {
      type: "object",
      properties: { relations: { type: "array", items: { type: "string", enum: names }, maxItems: Math.min(names.length, cap) } },
      required: ["relations"],
    };
  }
  if (input.step === "where") {
    const names = (input.fields ?? []).map((f) => f.name).filter(Boolean);
    if (!names.length) return null;
    return {
      type: "object",
      properties: {
        where: {
          type: "array",
          maxItems: PICK_CAPS.where,
          items: {
            type: "object",
            properties: {
              field: { type: "string", enum: names },
              op: { type: "string", enum: whereOpsFor(input) },
              value: { type: "string" },
            },
            required: ["field", "op", "value"],
          },
        },
      },
      required: ["where"],
    };
  }
  return null;
}

function validate(input: AssistInput, raw: AssistOutput): AssistOutput | null {
  if (input.step === "intentRewrite") {
    const intent = sanitizeIntent(raw.intent);
    return intent ? { intent } : null;
  }
  if (input.step === "osKeyword") {
    const keyword = sanitizeSearchKeyword(parentSearchKeyword(input.intent, input.need) ?? raw.keyword);
    return keyword ? { keyword } : null;
  }
  if (input.step === "os") {
    const names = new Set((input.osHits ?? []).map((h) => h.osName));
    const listed = [...(raw.osNames ?? []), raw.osName].filter((n): n is string => !!n);
    const osNames = listed.filter((n) => names.has(n) || [...names].some((x) => x.toUpperCase() === n.toUpperCase()))
      .map((n) => [...names].find((x) => x === n || x.toUpperCase() === n.toUpperCase())!);
    const uniq = [...new Set(osNames)].slice(0, 3);
    return uniq.length ? { osNames: uniq, osName: uniq[0] } : null;
  }
  if (input.step === "fields") {
    const names = new Set((input.fields ?? []).map((f) => f.name));
    const fields = capByIntent(
      (raw.fields ?? []).filter((n) => names.has(n)),
      PICK_CAPS.fields,
      (n) => intentHayScore(n, input),
    );
    return { fields };
  }
  if (input.step === "children" || input.step === "related") {
    const byName = new Map((input.children ?? []).map((c) => [c.relation, c]));
    const max = input.step === "related" ? PICK_CAPS.related : PICK_CAPS.children;
    const relations = capByIntent(
      (raw.relations ?? []).filter((n) => byName.has(n)),
      max,
      (n) => {
        const c = byName.get(n)!;
        return intentHayScore(`${c.relation} ${c.objectName} ${c.inheritedFrom ?? ""}`, input, "child") + (c.inOs ? 0.25 : 0);
      },
      { emptyIfNoHit: true },
    );
    return { relations };
  }
  if (input.step === "where") {
    const names = new Set((input.fields ?? []).map((f) => f.name));
    const allowedOps = new Set(whereOpsFor(input));
    const needsValue = (op: string) => op !== "isnull" && op !== "isnotnull";
    const where = (raw.where ?? []).filter((c) => {
      if (!c || !names.has(c.field) || !allowedOps.has(c.op) || typeof c.value !== "string") return false;
      if (needsValue(c.op) && !c.value.trim()) return false;
      return true;
    }).slice(0, PICK_CAPS.where);
    return { where };
  }
  return null;
}

/**
 * Object-structure search is for the parent row you are listing, not a
 * related object or a site. "find service requests with assets from site
 * BEDFORD" -> "service request". Related nouns sit after with/from/for.
 */
const PARENT_TYPES: { pattern: RegExp; keyword: string }[] = [
  { pattern: /\bservice\s+requests?\b/, keyword: "service request" },
  { pattern: /\bsrs?\b/, keyword: "service request" },
  { pattern: /\bwork\s*orders?\b/, keyword: "work order" },
  { pattern: /\bwos?\b/, keyword: "work order" },
  { pattern: /\bpurchase\s+orders?\b/, keyword: "purchase order" },
  { pattern: /\bincidents?\b/, keyword: "incident" },
  { pattern: /\bproblems?\b/, keyword: "problem" },
  { pattern: /\btickets?\b/, keyword: "ticket" },
  { pattern: /\blocations?\b/, keyword: "location" },
  { pattern: /\bsites?\b/, keyword: "site" },
  { pattern: /\bpersons?\b|\bpeople\b/, keyword: "person" },
  { pattern: /\binvoices?\b/, keyword: "invoice" },
  { pattern: /\bitems?\b/, keyword: "item" },
  { pattern: /\bassets?\b/, keyword: "asset" },
];

const RELATED_CLAUSE = /\b(?:with|including|that\s+have|that\s+has|whose|from|for|on\s+site|at)\b/i;

function firstParentType(text: string): string | null {
  const lower = text.toLowerCase();
  let best: { keyword: string; index: number } | null = null;
  for (const { pattern, keyword } of PARENT_TYPES) {
    const found = new RegExp(pattern.source, "i").exec(lower);
    if (!found) continue;
    if (!best || found.index < best.index) best = { keyword, index: found.index };
  }
  return best?.keyword ?? null;
}

export function parentSearchKeyword(intent: string, need?: string): string | null {
  const text = `${intent} ${need ?? ""}`.trim();
  if (!text) return null;
  const cut = text.search(RELATED_CLAUSE);
  const head = cut >= 0 ? text.slice(0, cut) : text;
  return firstParentType(head) ?? (cut >= 0 ? null : firstParentType(text));
}

export function sanitizeSearchKeyword(raw?: string): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/["'`]/g, "");
  if (/https?:\/\//i.test(s) || /oslc/i.test(s)) return null;
  s = s.replace(/\bMXAPI[A-Z0-9]*\b/gi, " ").replace(/[^a-zA-Z0-9 _-]/g, " ");
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 2 || s.length > 40) return null;
  return s.split(" ").slice(0, 3).join(" ");
}

function sanitizeIntent(raw?: string): string | null {
  if (!raw) return null;
  let s = raw.trim().replace(/^["'`]+|["'`]+$/g, "");
  if (/https?:\/\//i.test(s) || /oslc/i.test(s)) return null;
  s = s.replace(/\s+/g, " ").trim();
  if (s.length < 8 || s.length > 280) return null;
  return s;
}

