/** Fetch MAXRELATIONSHIP (including inherited via extendsObject). */
import { callTool } from "../api";
import { ChildRel } from "../types";
import {
  mergeInheritedRels,
  parentMboFromMeta,
  parseObjectMeta,
  parseRelationships,
  type ObjectMeta,
} from "./schema";

const MAX_EXTENDS = 6;

/**
 * Compact MAXRELATIONSHIP for an object, plus every MBO it extends.
 * Walks `extendsObject` from `maximo://object/{name}` (MCP 1.4.3) until null.
 * SR does not define ASSET; TICKET does - Maximo still accepts rel.asset on MXAPISR.
 */
export async function fetchRelsForObject(tenantId: string, objectName: string): Promise<ChildRel[]> {
  const want = objectName.trim().toUpperCase();
  if (!want) return [];
  const layers: { objectName: string; rels: ChildRel[] }[] = [];
  const seen = new Set<string>();
  let current: string | null = want;
  let hops = 0;
  while (current && !seen.has(current) && hops < MAX_EXTENDS) {
    seen.add(current);
    hops += 1;
    const { rels, meta } = await loadOwn(tenantId, current);
    layers.push({ objectName: current, rels });
    current = await nextParent(tenantId, meta, seen);
  }
  layers.reverse();
  return mergeInheritedRels(layers);
}

async function loadOwn(tenantId: string, objectName: string): Promise<{ rels: ChildRel[]; meta: ObjectMeta | null }> {
  const [compactRaw, metaRaw] = await Promise.all([
    callTool(tenantId, "maximo_get_metadata", {
      uri: `maximo://object/${objectName}/relationships/compact`,
    }).catch(() => null),
    callTool(tenantId, "maximo_get_metadata", {
      uri: `maximo://object/${objectName}`,
    }).catch(() => null),
  ]);
  return {
    rels: compactRaw ? parseRelationships(compactRaw) : [],
    meta: metaRaw ? parseObjectMeta(metaRaw) : null,
  };
}

async function nextParent(tenantId: string, child: ObjectMeta | null, seen: Set<string>): Promise<string | null> {
  if (!child) return null;
  const ext = child.extendsObject;
  if (ext && !seen.has(ext) && ext !== child.objectName) return ext;
  const service = child.serviceName;
  if (!service || seen.has(service) || service === child.objectName) return null;
  const parentRaw = await callTool(tenantId, "maximo_get_metadata", {
    uri: `maximo://object/${service}`,
  }).catch(() => null);
  const parent = parentRaw ? parseObjectMeta(parentRaw) : null;
  return parentMboFromMeta(child, parent);
}
