/**
 * Shared TypeScript shapes for tenants, query builder state, and API errors.
 * Keep in sync with the backend proxy payloads, not with Maximo OSLC itself.
 */
export interface Tenant {
  id: string;
  name: string;
  url: string;
  devMode: boolean;
  readonly: boolean;
  copilotMode: boolean;
  embeddingsMode?: "none" | "local" | "openai";
  createdAt: string;
}

export interface TenantStatus {
  tenant_id: string;
  state: "not_started" | "loading" | "ready" | "error";
  stage: string | null;
  percentage: number | null;
  object_structures: number | null;
  elapsed_ms: number | null;
  message: string | null;
  // Live warm-client pool state, not the cached sync state - a "ready"
  // tenant can still have no connected client right now (idle-reaped, or
  // the backend just restarted). See backend/app/mcp/manager.py's is_warm().
  mcp_connected: boolean;
}

export interface ApiErrorEnvelope {
  error: { code: string; message: string; correlation_id?: string; detail?: unknown };
}

export class ApiError extends Error {
  code: string;
  detail: unknown;
  constructor(env: ApiErrorEnvelope["error"]) {
    super(env.message);
    this.code = env.code;
    this.detail = env.detail;
  }
}

export type WhereOp = "=" | "!=" | "<" | ">" | "<=" | ">=" | "in" | "like" | "isnull" | "isnotnull";

export interface WhereCondition {
  field: string;
  op: WhereOp;
  value: string;
  isDynamic?: boolean;
  dynamicPlaceholder?: string;
}

export interface ChildHop {
  relationship: string;
  objectName: string;
  selectAll: boolean;
  selected: string[];
  aliases: Record<string, string>;
  /** Included in searchAttributes as `relationship.field` (every hop, never `rel.`). */
  searchFields: string[];
  conditions: WhereCondition[];
  /** Exposed by this object structure - select omits `rel.` by default */
  inOs?: boolean;
  /**
   * Opt into `rel.NAME{...}` in select. Only honored when this hop is OS-scoped
   * and `relationship` equals `objectName` (e.g. MULTIASSETLOCCI). Default off.
   */
  useRel?: boolean;
  /** Join predicate from MAXRELATIONSHIP (shown after this hop is picked). */
  whereClause?: string | null;
  /** childOptions.opmodeor - Maximo combines this hop's WHERE with OR. */
  opmodeor?: boolean;
  /** childOptions.tlrange + tlattribute (DATE/DATETIME). */
  timeline?: TimelineQuery | null;
  /** childOptions.domaininternalwhere - internal/domain-coded values. */
  domainInternal?: DomainInternalClause[];
  /** childOptions.limit - nested fetch cap. Default 50 (MCP warns if omitted). */
  limit?: number;
  /** childOptions.noLimit - unbounded nested fetch. */
  noLimit?: boolean;
}

export interface ChildChain {
  hops: ChildHop[];
}

export interface RelatedWhere {
  hops: {
    relationship: string;
    objectName: string;
    whereClause?: string | null;
    /** EXISTS conditions on this hop - prefix is the path up to here. */
    conditions?: WhereCondition[];
  }[];
  /** Legacy: leaf-only conditions. Prefer hops[i].conditions. */
  conditions: WhereCondition[];
}

export interface FieldInfo {
  name: string;
  title: string;
  type: string;
  subType?: string;
  domainId?: string;
  /** Present on `maximo://object/{name}/attributes`. OS schema extras (class_description) are not. */
  searchable?: boolean;
}

export interface ChildRel {
  relation: string;
  objectName: string;
  inOs?: boolean;
  /** Parent MBO this name was inherited from (SR <- TICKET). */
  inheritedFrom?: string;
  /** MAXRELATIONSHIP whereclause from compact metadata (join predicate). */
  whereClause?: string | null;
}

export interface OsSearchResult {
  osName: string;
  description?: string;
  primaryObject?: string;
  meta?: { queryCapability?: SavedQueryRaw[] };
}

export interface SavedQueryRaw {
  name?: string;
  title?: string;
  href?: string;
  uri?: string;
  url?: string;
  ispublic?: boolean;
  isPublic?: boolean;
  javaMethod?: boolean;
  hasParams?: boolean;
  params?: string[];
}

export interface SavedQuery {
  name: string;
  title?: string;
  href: string;
  ispublic?: boolean;
  javaMethod?: boolean;
  params: string[];
}

export interface QueryParam {
  value: string;
  isDynamic: boolean;
  dynamicPlaceholder?: string;
}

export interface SortRule {
  field: string;
  dir: "asc" | "desc";
}

export type TimelineSign = "-" | "+" | "+-";
export type TimelineUnit = "D" | "W" | "M" | "Y" | "h" | "m" | "s";

/** Parent or childOptions tlrange + tlattribute. Both required together. */
export interface TimelineQuery {
  sign: TimelineSign;
  amount: number;
  unit: TimelineUnit;
  attribute: string;
  /** Pin the index date instead of now: tlattribute becomes attr=<ISO date>. */
  indexDate?: string;
}

/** One clause in domaininternalwhere (field=internalValue, no quotes). */
export interface DomainInternalClause {
  field: string;
  value: string;
}

export interface LoadMeta {
  count?: number;
  totalCount?: number;
  hasMore?: boolean;
}

export const OPS: WhereOp[] = ["=", "!=", "<", ">", "<=", ">=", "in", "like", "isnull", "isnotnull"];

/** Public status from GET /api/llm/config - never includes the API key. */
export type LLMProvider =
  | "openai"
  | "anthropic"
  | "azure"
  | "gemini"
  | "groq"
  | "openrouter"
  | "ollama"
  | "custom";

export interface LLMConfigStatus {
  configured: boolean;
  provider: string | null;
  model: string | null;
  apiBaseSet: boolean;
  source: "db" | "env" | null;
}

export interface LLMConfigSave {
  provider: string;
  model: string;
  apiKey?: string;
  apiBase?: string;
  apiVersion?: string;
}

export interface LLMTestResult {
  ok: true;
  provider: string;
  model: string;
  reply: string;
  elapsedMs: number;
}

export interface AdminSession {
  enabled: boolean;
  authenticated: boolean;
}
