/** Parse MCP metadata payloads and build os_query_builder args. No OSLC HTTP here. */
import { ChildChain, ChildHop, ChildRel, DomainInternalClause, FieldInfo, QueryParam, RelatedWhere, SavedQuery, SavedQueryRaw, TimelineQuery, TimelineSign, TimelineUnit, WhereCondition } from "../types";

export function accentForType(type: string, subType?: string): string {
  const t = (subType || type || "").toLowerCase();
  if (t === "boolean") return "var(--type-bool)";
  if (t === "integer" || t === "number" || t === "float" || t === "decimal") return "var(--type-num)";
  if (t.includes("date") || t.includes("time")) return "var(--type-date)";
  if (t === "array") return "var(--accent)";
  return "var(--type-str)";
}

export function typeLabel(type: string, subType?: string): string {
  if (subType) return subType.toLowerCase();
  return (type || "unknown").toLowerCase();
}

export function isInternalField(name: string): boolean {
  if (!name) return true;
  if (name.startsWith("_")) return true;
  if (name === "href" || name === "localref") return true;
  if (name.endsWith("_collectionref")) return true;
  return false;
}

/** MCP tool payloads are usually `{ type, objectName, metadata|relationships }`. Some SDKs wrap that in `result`. */
export function unwrapToolPayload(raw: unknown): Record<string, unknown> | null {
  if (raw == null) return null;
  if (typeof raw === "string") {
    try {
      return unwrapToolPayload(JSON.parse(raw));
    } catch {
      return null;
    }
  }
  if (typeof raw !== "object") return null;
  if (Array.isArray(raw)) {
    for (const item of raw) {
      const inner = unwrapToolPayload(item);
      if (inner) return inner;
    }
    return null;
  }
  const rec = raw as Record<string, unknown>;
  if (rec.result != null && typeof rec.result === "object" && rec.type == null && rec.metadata == null && rec.relationships == null) {
    return unwrapToolPayload(rec.result);
  }
  return rec;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (!value) return null;
  if (typeof value === "string") {
    try {
      return asRecord(JSON.parse(value));
    } catch {
      return null;
    }
  }
  if (typeof value === "object" && !Array.isArray(value)) return value as Record<string, unknown>;
  return null;
}

/** Object / relationship names from metadata. Skips JSON null and the string "null". */
export function readUpperName(value: unknown): string | undefined {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const s = String(value).trim().toUpperCase();
  if (!s || s === "NULL" || s === "NONE" || s === "UNDEFINED" || s === "NIL") return undefined;
  return s;
}

/** MAXRELATIONSHIP whereclause - MCP compact uses camelCase; some payloads use the DB name. */
export function readJoinClause(raw: unknown): string | null {
  if (typeof raw === "string" && raw.trim()) return raw.trim();
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  for (const key of ["whereClause", "whereclause", "WHERECLAUSE"]) {
    const v = r[key];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return null;
}

export function parseRelationships(raw: unknown): ChildRel[] {
  const rec = unwrapToolPayload(raw);
  if (!rec) return [];
  const list = rec.relationships;
  if (!Array.isArray(list)) return [];
  const out: ChildRel[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as { relationshipName?: string; targetObject?: string };
    if (!r.relationshipName) continue;
    out.push({
      relation: r.relationshipName,
      objectName: r.targetObject ?? r.relationshipName,
      whereClause: readJoinClause(item),
    });
  }
  out.sort((a, b) => a.relation.localeCompare(b.relation));
  return out;
}

export function mergeRels(osRels: ChildRel[], compact: ChildRel[]): ChildRel[] {
  const map = new Map<string, ChildRel>();
  for (const r of compact) map.set(r.relation.toUpperCase(), { ...r, inOs: false });
  for (const r of osRels) {
    const prev = map.get(r.relation.toUpperCase());
    map.set(r.relation.toUpperCase(), {
      ...r,
      inOs: true,
      inheritedFrom: undefined,
      whereClause: r.whereClause?.trim() || prev?.whereClause || null,
    });
  }
  return Array.from(map.values()).sort((a, b) => a.relation.localeCompare(b.relation));
}

export function lookupJoin(relationship: string, pools: (readonly ChildRel[] | undefined)[]): string | null {
  const want = relationship.trim().toUpperCase();
  if (!want) return null;
  for (const pool of pools) {
    if (!pool) continue;
    for (const r of pool) {
      if (r.relation.toUpperCase() !== want) continue;
      const clause = r.whereClause?.trim();
      if (clause) return clause;
    }
  }
  return null;
}

export function hopJoinClause(
  hops: { relationship?: string; objectName?: string; whereClause?: string | null }[],
  index: number,
  primaryRels: ChildRel[],
  relsByObject: Record<string, ChildRel[]>,
): string | null {
  const h = hops[index];
  if (!h?.relationship) return null;
  const own = h.whereClause?.trim();
  if (own) return own;
  const parentName = index > 0 ? hops[index - 1]?.objectName : undefined;
  return lookupJoin(h.relationship, [
    parentName ? relsByObject[parentName] : undefined,
    primaryRels,
    ...Object.values(relsByObject),
  ]);
}

export type ObjectMeta = {
  objectName: string;
  serviceName?: string;
  extendsObject?: string;
  primaryKeys: string[];
};

export function parseObjectMeta(raw: unknown): ObjectMeta | null {
  const rec = unwrapToolPayload(raw);
  if (!rec) return null;
  const nested = asRecord(rec.metadata) ?? rec;
  const blob = asRecord(nested.meta);
  const objectName = readUpperName(nested.objectName) ?? readUpperName(rec.objectName);
  if (!objectName) return null;
  const extendsObject =
    readUpperName(nested.extendsObject)
    ?? readUpperName(nested.extendsoBject)
    ?? readUpperName(nested.EXTENDSOBJECT)
    ?? readUpperName(rec.extendsObject)
    ?? readUpperName(blob?.extendsObject)
    ?? readUpperName(blob?.extendsoBject);
  const serviceName =
    readUpperName(nested.serviceName)
    ?? readUpperName(nested.servicename)
    ?? readUpperName(rec.serviceName);
  const pkRaw = nested.primaryKeys ?? nested.primarykeys ?? rec.primaryKeys;
  const primaryKeys: string[] = [];
  if (Array.isArray(pkRaw)) {
    for (const item of pkRaw) {
      const name = typeof item === "string" || typeof item === "number"
        ? readUpperName(item)
        : item && typeof item === "object"
          ? readUpperName((item as { name?: string }).name)
          : undefined;
      if (name) primaryKeys.push(name);
    }
  }
  primaryKeys.sort();
  return { objectName, serviceName, extendsObject, primaryKeys };
}

function samePrimaryKeys(a: string[], b: string[]): boolean {
  if (!a.length || a.length !== b.length) return false;
  return a.every((k, i) => k === b[i]);
}

/** Later layers win on the same relationship name (child MBO overrides parent). */
export function mergeInheritedRels(layers: { objectName: string; rels: ChildRel[] }[]): ChildRel[] {
  if (!layers.length) return [];
  const leaf = layers[layers.length - 1].objectName.toUpperCase();
  const map = new Map<string, ChildRel>();
  for (const layer of layers) {
    const owner = layer.objectName.toUpperCase();
    for (const r of layer.rels) {
      map.set(r.relation.toUpperCase(), {
        ...r,
        inOs: false,
        inheritedFrom: owner === leaf ? undefined : owner,
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => a.relation.localeCompare(b.relation));
}

export function parentMboFromMeta(child: ObjectMeta, parent: ObjectMeta | null): string | null {
  if (child.extendsObject && child.extendsObject !== child.objectName) return child.extendsObject;
  if (!parent) return null;
  if (parent.objectName === child.objectName) return null;
  if (child.serviceName && parent.objectName === child.serviceName && samePrimaryKeys(child.primaryKeys, parent.primaryKeys)) {
    return parent.objectName;
  }
  return null;
}

export function parseRelatedObjects(raw: unknown): ChildRel[] {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const list = (rec.relatedObjects ?? rec.relatedobjects ?? rec.result) as unknown;
  if (!Array.isArray(list)) return [];
  const out: ChildRel[] = [];
  for (const item of list) {
    if (!item || typeof item !== "object") continue;
    const r = item as Record<string, unknown>;
    const objectName = String(r.objectName ?? r.objectname ?? r.object ?? "").trim();
    if (!objectName) continue;
    const relation = String(r.relation ?? r.relationship ?? r.relationshipName ?? objectName);
    out.push({ relation, objectName, inOs: true, whereClause: readJoinClause(r) });
  }
  out.sort((a, b) => a.relation.localeCompare(b.relation));
  return out;
}

export function parseSubschemaFields(raw: unknown, objectName: string): FieldInfo[] {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const schemas = rec.schemas;
  if (schemas && typeof schemas === "object") {
    const wanted = objectName.toUpperCase();
    const map = schemas as Record<string, unknown>;
    const key = Object.keys(map).find((k) => k.toUpperCase() === wanted);
    if (key) return splitProperties(map[key]).fields;
    const vals = Object.values(map);
    if (vals.length === 1) return splitProperties(vals[0]).fields;
  }
  return splitProperties(raw).fields;
}

function maxTypeToField(maxType: string): { type: string; subType?: string } {
  const t = (maxType || "").toUpperCase();
  if (t === "YORN") return { type: "boolean", subType: t };
  if (t === "INTEGER" || t === "SMALLINT" || t === "BIGINT") return { type: "integer", subType: t };
  if (t === "DECIMAL" || t === "FLOAT" || t === "DURATION" || t === "AMOUNT") return { type: "number", subType: t };
  if (t === "DATE" || t === "DATETIME" || t === "TIME") return { type: "string", subType: t };
  return { type: "string", subType: t || undefined };
}

export function parseObjectAttributes(raw: unknown): FieldInfo[] {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const attrs = rec.attributes;
  if (!attrs || typeof attrs !== "object") return [];
  const entries = Array.isArray(attrs)
    ? attrs.map((item) => {
        const d = item && typeof item === "object" ? (item as Record<string, unknown>) : {};
        return [String(d.attributeName ?? d.name ?? ""), d] as const;
      })
    : Object.entries(attrs as Record<string, unknown>);
  const fields: FieldInfo[] = [];
  for (const [key, def] of entries) {
    const d = def && typeof def === "object" ? (def as Record<string, unknown>) : {};
    const rawName = String(d.attributeName ?? d.attribute_name ?? key);
    const name = rawName.toLowerCase();
    if (!name || isInternalField(name)) continue;
    const mapped = maxTypeToField(String(d.maxType ?? d.maxtype ?? d.type ?? ""));
    fields.push({
      name,
      title: String(d.title ?? d.remarks ?? ""),
      type: mapped.type,
      subType: mapped.subType,
      domainId: String(d.domainId ?? d.domainid ?? "").trim() || undefined,
      searchable: true,
    });
  }
  fields.sort((a, b) => a.name.localeCompare(b.name));
  return fields;
}

export function splitProperties(raw: unknown): { fields: FieldInfo[]; relations: ChildRel[] } {
  const dig = (o: unknown): Record<string, unknown> | undefined => {
    if (!o || typeof o !== "object") return undefined;
    const rec = o as Record<string, unknown>;
    if (rec.properties && typeof rec.properties === "object") return rec.properties as Record<string, unknown>;
    for (const v of Object.values(rec)) {
      const found = dig(v);
      if (found) return found;
    }
    return undefined;
  };
  const props = dig(raw) ?? {};
  const fields: FieldInfo[] = [];
  const relations: ChildRel[] = [];
  for (const [name, def] of Object.entries(props)) {
    const d = def as Record<string, unknown>;
    if ((d.type === "array" || d.type === "object") && (typeof d.objectName === "string" || typeof d.relation === "string")) {
      relations.push({
        relation: (typeof d.relation === "string" && d.relation) || name,
        objectName: (typeof d.objectName === "string" && d.objectName) || name,
        inOs: true,
        whereClause: readJoinClause(d),
      });
    } else if (typeof d.type === "string" && !isInternalField(name)) {
      fields.push({
        name,
        title: (d.title as string) || "",
        type: d.type,
        subType: typeof d.subType === "string" ? d.subType : undefined,
        domainId: typeof d.domainId === "string" && d.domainId.trim() ? d.domainId.trim() : undefined,
      });
    }
  }
  fields.sort((a, b) => a.name.localeCompare(b.name));
  relations.sort((a, b) => a.relation.localeCompare(b.relation));
  return { fields, relations };
}

export function extractSavedQueries(raw: SavedQueryRaw[] | undefined): SavedQuery[] {
  if (!raw?.length) return [];
  const out: SavedQuery[] = [];
  for (const item of raw) {
    const name = item.name || item.title;
    if (!name) continue;
    const href = item.href || item.uri || item.url || "";
    const params = item.params?.length ? item.params : extractSqpParams(href);
    out.push({
      name,
      title: item.title,
      href,
      ispublic: item.ispublic ?? item.isPublic,
      javaMethod: item.javaMethod,
      params,
    });
  }
  return out;
}

function extractSqpParams(href: string): string[] {
  if (!href) return [];
  const names: string[] = [];
  for (const m of href.matchAll(/sqp:(\w+)=/g)) names.push(m[1]);
  return names;
}

/** MCP tools often return HTTP 200 with `{ op_success: false, error: { detail } }`. */
export function toolFailure(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;
  const rec = payload as Record<string, unknown>;
  if (rec.op_success === false || rec.opSuccess === false) {
    const err = rec.error;
    if (typeof err === "string" && err.trim()) return err;
    if (err && typeof err === "object") {
      const e = err as Record<string, unknown>;
      const detail = e.detail ?? e.message ?? e.reason;
      if (typeof detail === "string" && detail.trim()) return detail;
      return JSON.stringify(err);
    }
    return "Tool returned op_success: false";
  }
  if (rec.workingSet && typeof rec.workingSet === "object") {
    return toolFailure(rec.workingSet);
  }
  return null;
}

export function extractWsId(built: Record<string, unknown>): string | undefined {
  const ws = built.workingSet;
  if (typeof ws === "string" && ws) return ws;
  if (ws && typeof ws === "object") {
    const rec = ws as Record<string, unknown>;
    const result = rec.result as { id?: string } | undefined;
    if (typeof result?.id === "string") return result.id;
    if (typeof rec.id === "string") return rec.id;
  }
  if (typeof built.wsId === "string") return built.wsId;
  if (typeof built.id === "string") return built.id;
  return undefined;
}

export function extractEndpoint(built: unknown): string | undefined {
  if (!built || typeof built !== "object") return undefined;
  const rec = built as Record<string, unknown>;
  const url = rec.url ?? rec.href ?? rec.relativeuri;
  return typeof url === "string" ? url : undefined;
}

export interface ConditionMode {
  dynValues?: Record<string, string>;
  template?: boolean;
}

export function dynKey(c: WhereCondition): string {
  const raw = (c.dynamicPlaceholder || c.field || "param").replace(/^\{\{|\}\}$/g, "");
  return raw.toLowerCase();
}

export function dynPlaceholder(c: WhereCondition): string {
  if (c.dynamicPlaceholder?.trim()) return c.dynamicPlaceholder.trim();
  const name = (c.field || "PARAM").toUpperCase().replace(/[^A-Z0-9]+/g, "_") || "PARAM";
  return `{{${name}}}`;
}

function resolveWhereValue(c: WhereCondition, mode?: ConditionMode): string {
  if (!c.isDynamic) return c.value;
  if (mode?.template) return dynPlaceholder(c);
  const fromPanel = mode?.dynValues?.[dynKey(c)];
  if (fromPanel != null && fromPanel !== "") return fromPanel;
  return c.value;
}

export function toCondition(c: WhereCondition, mode?: ConditionMode): Record<string, unknown> {
  if (c.op === "isnull" || c.op === "isnotnull") return { field: c.field, op: c.op };
  const value = resolveWhereValue(c, mode);
  if (c.op === "in") {
    return { field: c.field, op: "in", value: value.split(",").map((s) => s.trim()).filter(Boolean) };
  }
  return { field: c.field, op: c.op, value };
}

export function emptyRelatedWhere(rel: ChildRel | undefined): RelatedWhere {
  return {
    hops: rel
      ? [{ relationship: rel.relation, objectName: rel.objectName, whereClause: rel.whereClause, conditions: [] }]
      : [],
    conditions: [],
  };
}

export function normalizeRelatedHops(filter: RelatedWhere): RelatedWhere["hops"] {
  const last = filter.hops.length - 1;
  return filter.hops.map((h, i) => ({
    ...h,
    conditions: h.conditions ?? (i === last ? filter.conditions ?? [] : []),
  }));
}

export function relatedCondsAt(filter: RelatedWhere, index: number): WhereCondition[] {
  return normalizeRelatedHops(filter)[index]?.conditions ?? [];
}

export function setRelatedCondsAt(filter: RelatedWhere, index: number, conditions: WhereCondition[]): RelatedWhere {
  const hops = normalizeRelatedHops(filter).map((h, i) => (i === index ? { ...h, conditions } : h));
  return { hops, conditions: hops[hops.length - 1]?.conditions ?? [] };
}

export function trimRelatedHops(filter: RelatedWhere, keepCount: number): RelatedWhere {
  const hops = normalizeRelatedHops(filter).slice(0, Math.max(0, keepCount));
  return { hops, conditions: hops[hops.length - 1]?.conditions ?? [] };
}

export function appendRelatedHop(filter: RelatedWhere, rel: ChildRel): RelatedWhere {
  const hops = [
    ...normalizeRelatedHops(filter),
    { relationship: rel.relation, objectName: rel.objectName, whereClause: rel.whereClause, conditions: [] as WhereCondition[] },
  ];
  return { hops, conditions: [] };
}

export function relatedHasConds(filter: RelatedWhere): boolean {
  return normalizeRelatedHops(filter).some((h) => (h.conditions ?? []).some((c) => c.field));
}

export function relatedWhereConditions(filters: RelatedWhere[], mode?: ConditionMode): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const f of filters) {
    const hops = normalizeRelatedHops(f);
    hops.forEach((h, i) => {
      const prefix = hops.slice(0, i + 1).map((x) => x.relationship.toLowerCase()).filter(Boolean).join(".");
      if (!prefix) return;
      for (const c of (h.conditions ?? []).filter((cond) => cond.field)) {
        const cond = toCondition(c, mode);
        cond.field = `${prefix}.${c.field}`;
        out.push(cond);
      }
    });
  }
  return out;
}

export function emptyHop(rel: ChildRel | undefined): ChildHop {
  return {
    relationship: rel?.relation ?? "",
    objectName: rel?.objectName ?? "",
    selectAll: true,
    selected: [],
    aliases: {},
    searchFields: [],
    conditions: [],
    inOs: rel?.inOs,
    useRel: rel?.inOs && relNamesMatch(rel.relation, rel.objectName) ? false : undefined,
    whereClause: rel?.whereClause,
  };
}

export function emptyChain(rel: ChildRel | undefined): ChildChain {
  return { hops: [emptyHop(rel)] };
}

type RelNode = { star: boolean; fields: string[]; kids: Map<string, RelNode>; inOs?: boolean; useRel?: boolean };

function newNode(): RelNode {
  return { star: false, fields: [], kids: new Map() };
}

function hopSelectIsStar(hop: ChildHop): boolean {
  if (hop.selectAll) return true;
  if (hop.selected.length > 0) return false;
  return hopHasChildFilter(hop);
}

function aliasedAttr(name: string, aliases: Record<string, string> | undefined): string {
  const alias = aliases?.[name]?.trim();
  return alias ? `${name}--${alias}` : name;
}

export function hopInOs(hop: ChildHop, osChildObjects: Set<string>): boolean {
  if (hop.inOs != null) return hop.inOs;
  return osChildObjects.has((hop.objectName || "").toUpperCase());
}

/** OS children select by object name, no `rel.`. Compact hops use the relationship name. */
export function hopSelectKey(hop: ChildHop, osChildObjects: Set<string>): string {
  if (hopInOs(hop, osChildObjects)) return (hop.relationship || hop.objectName).toLowerCase();
  return hop.relationship;
}

export function relNamesMatch(relation: string, objectName: string): boolean {
  const a = (relation || "").toUpperCase();
  const b = (objectName || "").toUpperCase();
  return !!a && !!b && a === b;
}

/** `rel.` in select is optional only when this OS child uses the same name as the relationship. */
export function hopCanToggleRel(hop: ChildHop, osChildObjects: Set<string>): boolean {
  return hopInOs(hop, osChildObjects) && relNamesMatch(hop.relationship, hop.objectName);
}

export function hopUseRel(hop: ChildHop, osChildObjects: Set<string>): boolean {
  if (hopCanToggleRel(hop, osChildObjects)) return hop.useRel === true;
  if (hopInOs(hop, osChildObjects)) return false;
  return true;
}

function mergeHop(parent: RelNode, hop: ChildHop, osChildObjects: Set<string>): RelNode {
  const key = hopSelectKey(hop, osChildObjects);
  let node = parent.kids.get(key);
  if (!node) {
    node = newNode();
    parent.kids.set(key, node);
  }
  node.inOs = hopInOs(hop, osChildObjects);
  node.useRel = node.useRel || hopUseRel(hop, osChildObjects);
  if (hopSelectIsStar(hop)) node.star = true;
  else {
    for (const f of hop.selected) {
      if (!f) continue;
      const token = aliasedAttr(f, hop.aliases);
      if (!node.fields.includes(token)) node.fields.push(token);
    }
  }
  return node;
}

function renderInner(node: RelNode): string {
  const parts: string[] = [];
  if (node.star) parts.push("*");
  else parts.push(...node.fields);
  for (const [rel, child] of node.kids) {
    parts.push(renderChild(rel, child));
  }
  if (!parts.length) parts.push("*");
  return parts.join(",");
}

function renderChild(rel: string, node: RelNode): string {
  const inner = renderInner(node);
  return node.useRel ? `rel.${rel}{${inner}}` : `${rel}{${inner}}`;
}

export function buildSelectFields(
  selectAll: boolean,
  selected: Set<string>,
  chains: ChildChain[],
  aliases: Record<string, string> = {},
  extra: string[] = [],
  osChildObjects: Set<string> = new Set(),
): string[] {
  const fields = selectAll
    ? ["*"]
    : Array.from(selected).map((f) => aliasedAttr(f, aliases));
  const root = newNode();
  for (const chain of chains) {
    let node = root;
    for (const hop of chain.hops) {
      if (!hop.relationship) continue;
      node = mergeHop(node, hop, osChildObjects);
    }
  }
  for (const [rel, child] of root.kids) {
    if (child.inOs && child.kids.size === 0 && !child.useRel) {
      if (child.star) {
        const token = `${rel}{*}`;
        if (!fields.includes(token)) fields.push(token);
      } else {
        for (const f of child.fields) {
          const token = `${rel}.${f}`;
          if (!fields.includes(token)) fields.push(token);
        }
      }
    } else {
      const token = renderChild(rel, child);
      if (!fields.includes(token)) fields.push(token);
    }
  }
  for (const e of extra) {
    if (e && !fields.includes(e)) fields.push(e);
  }
  return fields;
}

export function childOptionsFromChains(chains: ChildChain[], mode?: ConditionMode): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  for (const chain of chains) {
    const names: string[] = [];
    for (const hop of chain.hops) {
      if (!hop.relationship) continue;
      names.push(hop.relationship);
      const conditions = hop.conditions.filter((c) => c.field).map((c) => toCondition(c, mode));
      const diw = serializeDomainInternal(hop.domainInternal);
      const readyTl = timelineReady(hop.timeline);
      if (!conditions.length && !readyTl && !diw) continue;
      const payload: Record<string, unknown> = { relationship: hop.relationship };
      if (conditions.length) {
        payload.where = { conditions };
        if (hop.opmodeor) payload.opmodeor = true;
      }
      if (readyTl && hop.timeline) {
        payload.tlrange = formatTlRange(hop.timeline);
        payload.tlattribute = formatTlAttribute(hop.timeline);
      }
      if (diw) payload.domaininternalwhere = diw;
      if (names.length > 1) payload.path = [...names];
      out.push(payload);
    }
  }
  return out;
}

export function collectSearchAttributes(
  selectAll: boolean,
  selected: Set<string>,
  parentFields: FieldInfo[],
  searchOff: Set<string>,
  chains: ChildChain[],
  childFieldsByObject: Record<string, FieldInfo[]> = {},
): string[] {
  const out: string[] = [];
  const parentNames = selectAll ? parentFields.map((f) => f.name) : Array.from(selected);
  const parentByName = new Map(parentFields.map((f) => [f.name.toLowerCase(), f]));
  for (const name of parentNames) {
    if (searchOff.has(name)) continue;
    const f = parentByName.get(name.toLowerCase());
    if (!fieldAllowsSearch(f, parentFields)) continue;
    out.push(name);
  }
  for (const chain of chains) {
    const prefix: string[] = [];
    for (const hop of chain.hops) {
      if (!hop.relationship) continue;
      prefix.push(hop.relationship.toLowerCase());
      const catalog = hopFieldCatalog(hop, childFieldsByObject);
      const catalogByName = new Map(catalog.map((f) => [f.name.toLowerCase(), f]));
      const names = hop.selectAll
        ? catalog.map((f) => f.name)
        : hop.selected;
      const wanted = new Set((hop.searchFields ?? hop.selected).map((n) => n.toLowerCase()));
      for (const name of names) {
        if (!hop.selectAll && !wanted.has(name.toLowerCase())) continue;
        const f = catalogByName.get(name.toLowerCase());
        if (!fieldAllowsSearch(f, catalog)) continue;
        out.push(`${prefix.join(".")}.${name}`);
      }
    }
  }
  return [...new Set(out)];
}

export interface DynSlot {
  key: string;
  placeholder: string;
  source: string;
}

export function collectDynSlots(
  savedParams: Record<string, QueryParam>,
  where: WhereCondition[],
  related: RelatedWhere[],
  chains: ChildChain[],
): DynSlot[] {
  const out: DynSlot[] = [];
  const seen = new Set<string>();
  const add = (key: string, placeholder: string, source: string) => {
    if (seen.has(key)) return;
    seen.add(key);
    out.push({ key, placeholder, source });
  };
  for (const [name, p] of Object.entries(savedParams)) {
    if (!p.isDynamic) continue;
    add(name, p.dynamicPlaceholder ?? `{{${name.toUpperCase()}}}`, "saved query");
  }
  const walk = (c: WhereCondition, source: string) => {
    if (!c.isDynamic || !c.field) return;
    add(dynKey(c), dynPlaceholder(c), source);
  };
  for (const c of where) walk(c, "where");
  for (const f of related) {
    for (const h of normalizeRelatedHops(f)) {
      for (const c of h.conditions ?? []) walk(c, h.relationship || "related where");
    }
  }
  for (const chain of chains) {
    for (const hop of chain.hops) {
      for (const c of hop.conditions) walk(c, hop.relationship || "child where");
    }
  }
  return out;
}

export function displayColumns(
  selectAll: boolean,
  selected: Set<string>,
  aliases: Record<string, string>,
  rows: Record<string, unknown>[],
): string[] {
  if (selectAll) {
    if (!rows.length) return [];
    return Object.keys(rows[0]).filter((k) => !isInternalField(k) && !isRelatedValue(rows[0][k]));
  }
  if (selected.size > 0) {
    return Array.from(selected).map((f) => aliases[f]?.trim() || f);
  }
  if (!rows.length) return [];
  return Object.keys(rows[0]).filter((k) => !isInternalField(k) && !isRelatedValue(rows[0][k]));
}

export function isChildArray(v: unknown): v is Record<string, unknown>[] {
  return Array.isArray(v) && v.length > 0 && typeof v[0] === "object" && v[0] !== null && !Array.isArray(v[0]);
}

/** Nested related record: a collection, or a 1:1 object that isn't just href/_rowstamp. */
export function isRelatedValue(v: unknown): boolean {
  if (isChildArray(v)) return true;
  if (!v || typeof v !== "object" || Array.isArray(v)) return false;
  return Object.keys(v as Record<string, unknown>).some((k) => !isInternalField(k));
}

export function childCollections(row: Record<string, unknown> | undefined): [string, Record<string, unknown>[]][] {
  if (!row) return [];
  const out: [string, Record<string, unknown>[]][] = [];
  for (const [k, v] of Object.entries(row)) {
    if (isInternalField(k) || !isRelatedValue(v)) continue;
    const recs = relatedRecords(v);
    if (recs.length) out.push([k, recs]);
  }
  return out;
}

export function scalarColumnsFor(rows: Record<string, unknown>[], preferred: string[] = []): string[] {
  const childKeys = new Set<string>();
  for (const r of rows) {
    for (const [k] of childCollections(r)) childKeys.add(k);
  }
  const pref = preferred.filter((c) => !isInternalField(c) && !childKeys.has(c));
  if (pref.length && rows.some((r) => pref.some((c) => c in r))) return pref;
  const sample = rows[0];
  if (!sample) return [];
  return Object.keys(sample).filter((k) => !isInternalField(k) && !childKeys.has(k));
}

function canonRelKey(name: string): string {
  return name.replace(/^rel\./i, "").toLowerCase();
}

/** Match a related collection on a result row, ignoring `rel.` and case. */
export function matchRelatedKey(row: Record<string, unknown>, key: string): string | null {
  const want = canonRelKey(key);
  for (const k of Object.keys(row)) {
    if (isInternalField(k)) continue;
    if (canonRelKey(k) === want) return k;
  }
  return null;
}

function relatedRecords(value: unknown): Record<string, unknown>[] {
  if (isChildArray(value)) return value;
  if (Array.isArray(value) && value.length === 0) return [];
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return [value as Record<string, unknown>];
  }
  return [];
}

function isNestedObject(v: unknown): boolean {
  if (v == null) return false;
  if (Array.isArray(v)) return true;
  return typeof v === "object";
}

/**
 * Display-only: lift chosen fields from the first related record onto the parent
 * as `rel.field` columns (dotted for child-of-child) and drop that collection
 * from nested tables.
 */
export type DisplaySpec = Record<string, string[]>;

function cloneRow(row: Record<string, unknown>): Record<string, unknown> {
  try {
    return structuredClone(row);
  } catch {
    return JSON.parse(JSON.stringify(row)) as Record<string, unknown>;
  }
}

function specPathParts(key: string): string[] {
  return key.split(".").filter(Boolean);
}

function walkFirst(
  row: Record<string, unknown>,
  parts: string[],
): { leaf: Record<string, unknown> | undefined; parent: Record<string, unknown>; leafKey: string; prefix: string } | null {
  let cursor: Record<string, unknown> = row;
  let parent: Record<string, unknown> = row;
  let leafKey = "";
  const foundNames: string[] = [];
  for (const part of parts) {
    const found = matchRelatedKey(cursor, part);
    if (!found) return null;
    parent = cursor;
    leafKey = found;
    foundNames.push(found.replace(/^rel\./i, ""));
    const recs = relatedRecords(cursor[found]);
    const first = recs[0];
    if (!first) return { leaf: undefined, parent, leafKey, prefix: foundNames.join(".") };
    cursor = first;
  }
  return { leaf: cursor, parent, leafKey, prefix: foundNames.join(".") };
}

export function flattenOneToOne(
  row: Record<string, unknown>,
  spec: DisplaySpec,
): { row: Record<string, unknown>; extraCols: string[] } {
  const extraCols: string[] = [];
  const next = cloneRow(row);
  const entries = Object.entries(spec)
    .filter(([, fields]) => fields.length)
    .sort((a, b) => specPathParts(b[0]).length - specPathParts(a[0]).length);
  for (const [key, fields] of entries) {
    const parts = specPathParts(key);
    if (!parts.length) continue;
    const walked = walkFirst(next, parts);
    if (!walked) continue;
    const { leaf, parent, leafKey, prefix } = walked;
    const byLower = new Map(
      leaf ? Object.keys(leaf).map((k) => [k.toLowerCase(), k]) : [],
    );
    for (const want of fields) {
      const real = byLower.get(want.toLowerCase()) ?? want;
      const fv = leaf?.[real];
      if (isNestedObject(fv) && fv != null) continue;
      const col = `${prefix}.${real}`;
      next[col] = leaf ? leaf[real] : undefined;
      extraCols.push(col);
    }
    if (!leafKey) continue;
    const recs = relatedRecords(parent[leafKey]);
    const first = recs[0];
    const firstHasKids = first ? childCollections(first).length > 0 : false;
    const rest = recs.slice(1);
    if (firstHasKids) parent[leafKey] = recs;
    else if (rest.length) parent[leafKey] = rest;
    else delete parent[leafKey];
  }
  return { row: next, extraCols };
}

export function applyDisplayFlatten(
  rows: Record<string, unknown>[],
  spec: DisplaySpec,
): { rows: Record<string, unknown>[]; extraCols: string[] } {
  if (!spec || !Object.values(spec).some((f) => f.length)) return { rows, extraCols: [] };
  const extra: string[] = [];
  const next = rows.map((r) => {
    const { row, extraCols } = flattenOneToOne(r, spec);
    extra.push(...extraCols);
    return row;
  });
  return { rows: next, extraCols: [...new Set(extra)] };
}

export function flattenNestedRows(rows: Record<string, unknown>[]): Record<string, unknown>[] {
  const out: Record<string, unknown>[] = [];
  function walk(list: Record<string, unknown>[], prefix: string, inherited: Record<string, unknown>) {
    for (const row of list) {
      const current = { ...inherited };
      for (const [k, v] of Object.entries(row)) {
        if (isInternalField(k) || isChildArray(v)) continue;
        current[prefix ? `${prefix}.${k}` : k] = v;
      }
      const kids = childCollections(row);
      if (!kids.length) {
        out.push(current);
        continue;
      }
      for (const [rel, arr] of kids) {
        walk(arr, prefix ? `${prefix}.${rel}` : rel, current);
      }
    }
  }
  walk(rows, "", {});
  return out;
}

export function rowsToCsv(rows: Record<string, unknown>[]): string {
  if (!rows.length) return "";
  const cols: string[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    for (const k of Object.keys(r)) {
      if (seen.has(k)) continue;
      seen.add(k);
      cols.push(k);
    }
  }
  const esc = (v: unknown) => {
    const s = v == null ? "" : String(v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  return [cols.join(","), ...rows.map((r) => cols.map((c) => esc(r[c])).join(","))].join("\n");
}

export function matchRel(name: string, rels: ChildRel[]): ChildRel | undefined {
  const u = name.toUpperCase();
  return rels.find((r) => r.relation.toUpperCase() === u)
    ?? rels.find((r) => r.objectName.toUpperCase() === u);
}

/** Relationship-name only. Do not match target object (ASSET != ALLASSET). */
export function matchRelExact(name: string, rels: ChildRel[]): ChildRel | undefined {
  const u = name.toUpperCase();
  return rels.find((r) => r.relation.toUpperCase() === u);
}

/** OS child by relation, object name, or WO-prefixed object (SERVICEADDRESS -> WOSERVICEADDRESS). */
export function matchOsChild(name: string, osRels: ChildRel[]): ChildRel | undefined {
  const u = name.toUpperCase();
  const os = osRels.filter((r) => r.inOs !== false);
  return (
    os.find((r) => r.relation.toUpperCase() === u) ??
    os.find((r) => r.objectName.toUpperCase() === u) ??
    os.find((r) => r.objectName.toUpperCase() === `WO${u}`) ??
    os.find((r) => r.relation.toUpperCase() === `WO${u}`)
  );
}

export function mergeFieldMeta(base: FieldInfo[], extra: FieldInfo[]): FieldInfo[] {
  const map = new Map(base.map((f) => [f.name.toLowerCase(), { ...f }]));
  for (const e of extra) {
    const key = e.name.toLowerCase();
    const cur = map.get(key);
    if (!cur) {
      map.set(key, e);
      continue;
    }
    map.set(key, {
      ...cur,
      title: cur.title || e.title,
      type: e.type || cur.type,
      subType: e.subType || cur.subType,
      domainId: e.domainId || cur.domainId,
      searchable: !!(cur.searchable || e.searchable),
    });
  }
  return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
}

export function maxTypeOf(field: FieldInfo | undefined): string {
  return (field?.subType || field?.type || "").toUpperCase();
}

export function isYornField(field: FieldInfo | undefined): boolean {
  if (!field) return false;
  return maxTypeOf(field) === "YORN" || field.type === "boolean";
}

export function isDateTimeField(field: FieldInfo | undefined): boolean {
  if (!field) return false;
  const t = maxTypeOf(field);
  if (t === "DATE" || t === "DATETIME" || t === "TIME") return true;
  const raw = `${field.subType || ""} ${field.type || ""}`.toLowerCase();
  return raw.includes("date") || raw.includes("time");
}

export function dateTimeFields(fields: FieldInfo[]): FieldInfo[] {
  return fields.filter((f) => isDateTimeField(f));
}

export function domainFields(fields: FieldInfo[]): FieldInfo[] {
  return fields.filter((f) => !!(f.domainId && f.domainId.trim()));
}

export const TL_UNITS: { unit: TimelineUnit; label: string }[] = [
  { unit: "D", label: "days (D)" },
  { unit: "W", label: "weeks (W)" },
  { unit: "M", label: "months (M)" },
  { unit: "Y", label: "years (Y)" },
  { unit: "h", label: "hours (h)" },
  { unit: "m", label: "minutes (m)" },
  { unit: "s", label: "seconds (s)" },
];

const TL_RANGE_RE = /^(\+-|\+|-)(\d+)([DWMYhms])$/;
const PREFERRED_TL = ["reportdate", "statusdate", "changedate", "schedstart", "actualstart", "reportdt"];

export function emptyTimeline(fields: FieldInfo[]): TimelineQuery {
  const dates = dateTimeFields(fields);
  const prefer = PREFERRED_TL.map((n) => dates.find((f) => f.name.toLowerCase() === n)).find(Boolean);
  return {
    sign: "-",
    amount: 3,
    unit: "M",
    attribute: prefer?.name ?? dates[0]?.name ?? "",
  };
}

export function formatTlRange(tl: TimelineQuery): string {
  const n = Math.max(0, Math.floor(Number(tl.amount) || 0));
  return `${tl.sign}${n}${tl.unit}`;
}

export function formatTlAttribute(tl: TimelineQuery): string {
  const attr = tl.attribute.trim();
  const pin = (tl.indexDate ?? "").trim();
  return pin ? `${attr}=${pin}` : attr;
}

export function timelineReady(tl: TimelineQuery | null | undefined): boolean {
  if (!tl) return false;
  const n = Math.floor(Number(tl.amount) || 0);
  return n > 0 && !!tl.attribute.trim() && TL_RANGE_RE.test(formatTlRange(tl));
}

export function parseTlRange(raw: string): Pick<TimelineQuery, "sign" | "amount" | "unit"> | null {
  const m = raw.trim().match(TL_RANGE_RE);
  if (!m) return null;
  return { sign: m[1] as TimelineSign, amount: Number(m[2]), unit: m[3] as TimelineUnit };
}

export function parseTlAttribute(raw: string): { attribute: string; indexDate?: string } {
  const t = raw.trim();
  const eq = t.indexOf("=");
  if (eq <= 0) return { attribute: t };
  return { attribute: t.slice(0, eq).trim(), indexDate: t.slice(eq + 1).trim() || undefined };
}

export function parseTimeline(range: unknown, attribute: unknown): TimelineQuery | null {
  if (typeof range !== "string" || typeof attribute !== "string") return null;
  const parsed = parseTlRange(range);
  if (!parsed) return null;
  const attr = parseTlAttribute(attribute);
  if (!attr.attribute) return null;
  return { ...parsed, ...attr };
}

export function serializeDomainInternal(clauses: DomainInternalClause[] | undefined): string {
  return (clauses ?? [])
    .filter((c) => c.field.trim() && c.value.trim())
    .map((c) => {
      let v = c.value.trim();
      if ((v.startsWith("\"") && v.endsWith("\"")) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      return `${c.field.trim()}=${v.replace(/"/g, "")}`;
    })
    .join(" and ");
}

export function parseDomainInternal(raw: unknown): DomainInternalClause[] {
  if (typeof raw !== "string" || !raw.trim()) return [];
  return raw.split(/\s+and\s+/i).map((part) => {
    const m = part.trim().match(/^([^=\s]+)\s*=\s*(.*)$/);
    if (!m) return { field: part.trim(), value: "" };
    let value = m[2].trim();
    if ((value.startsWith("\"") && value.endsWith("\"")) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1);
    }
    return { field: m[1], value };
  }).filter((c) => c.field);
}

export function hopHasChildFilter(hop: ChildHop): boolean {
  if (hop.conditions.some((c) => c.field)) return true;
  if (timelineReady(hop.timeline)) return true;
  if (serializeDomainInternal(hop.domainInternal)) return true;
  return false;
}

/**
 * SearchAttributes only: real MBO attributes, never YORN.
 * If this catalog has any `searchable` rows (object attributes loaded), OS-only
 * extras such as class_description are excluded. Empty catalog -> keep the name
 * until attributes load (still drop YORN when the field is known).
 */
export function fieldAllowsSearch(field: FieldInfo | undefined, catalog: FieldInfo[]): boolean {
  if (isYornField(field)) return false;
  const hasObjectCatalog = catalog.some((f) => f.searchable === true);
  if (!field) return !hasObjectCatalog;
  if (hasObjectCatalog) return field.searchable === true;
  return true;
}

export function searchNamesFrom(fields: FieldInfo[], names: string[]): string[] {
  return names.filter((n) => {
    const f = fields.find((x) => x.name.toLowerCase() === n.toLowerCase());
    return fieldAllowsSearch(f, fields);
  });
}

function hopFieldCatalog(hop: { objectName: string }, cache: Record<string, FieldInfo[]>): FieldInfo[] {
  const n = hop.objectName || "";
  return cache[n] ?? cache[n.toUpperCase()] ?? [];
}

export interface DomainValue {
  value: string;
  description?: string;
}

export function parseDomainValues(raw: unknown, attrName: string): DomainValue[] {
  if (!raw || typeof raw !== "object") return [];
  const rec = raw as Record<string, unknown>;
  const metadata = rec.metadata && typeof rec.metadata === "object" ? rec.metadata : rec;
  const map = metadata as Record<string, unknown>;
  const wanted = attrName.toUpperCase();
  const entry =
    (map[wanted] as Record<string, unknown> | undefined) ??
    (map[attrName] as Record<string, unknown> | undefined) ??
    (Object.values(map).find((v) => v && typeof v === "object" && Array.isArray((v as { valuelist?: unknown }).valuelist)) as
      | Record<string, unknown>
      | undefined);
  const list = entry?.valuelist ?? rec.valuelist;
  if (!Array.isArray(list)) return [];
  const out: DomainValue[] = [];
  for (const item of list) {
    if (item == null) continue;
    if (typeof item === "string" || typeof item === "number") {
      out.push({ value: String(item) });
      continue;
    }
    if (typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const value = row.value ?? row.maxvalue ?? row.valueid;
    if (value == null || value === "") continue;
    out.push({
      value: String(value),
      description: row.description != null ? String(row.description) : undefined,
    });
  }
  return out;
}
