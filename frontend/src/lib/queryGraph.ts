/** Derive hop nodes/edges from child chains for the insight graph. */
import { parseSelectFieldsTree, SelectBranch } from "./selectTree";

export type GraphNode = {
  id: string;
  parentId: string | null;
  label: string;
  kind: "os" | "rel";
  rel: boolean;
  fields: string[];
  /** Filters that decide whether this node's parent rows return (oslc.where / EXISTS). */
  parentWhere: string[];
  /** MAXRELATIONSHIP join predicate for this hop. */
  joinWhere: string[];
  /** Filters that trim this collection's own rows (childOptions / *.where). */
  rowWhere: string[];
};

function idFor(path: string[]): string {
  if (!path.length) return "os";
  return path.map((p) => p.toLowerCase()).join(".");
}

function ensure(
  nodes: Map<string, GraphNode>,
  path: string[],
  label: string,
  rel: boolean,
): GraphNode {
  const id = idFor(path);
  const existing = nodes.get(id);
  if (existing) return existing;
  const parentId = path.length ? idFor(path.slice(0, -1)) : null;
  const node: GraphNode = {
    id,
    parentId: path.length ? parentId : null,
    label,
    kind: path.length ? "rel" : "os",
    rel,
    fields: [],
    parentWhere: [],
    joinWhere: [],
    rowWhere: [],
  };
  nodes.set(id, node);
  return node;
}

function walkSelect(nodes: Map<string, GraphNode>, branch: SelectBranch, path: string[]) {
  const nextPath = [...path, branch.name];
  const node = ensure(nodes, nextPath, branch.name, branch.rel);
  for (const f of branch.fields) {
    if (!node.fields.includes(f.name)) node.fields.push(f.alias ? `${f.name} -> ${f.alias}` : f.name);
  }
  if (branch.star && !node.fields.includes("*")) node.fields.push("*");
  for (const kid of branch.kids) walkSelect(nodes, kid, nextPath);
}

function formatCond(c: Record<string, unknown>): string {
  const field = String(c.field ?? "");
  const op = String(c.op ?? "=");
  if (op === "isnull") return `${field} is null`;
  if (op === "isnotnull") return `${field} is not null`;
  const value = Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value ?? "");
  return `${field} ${op} ${value}`;
}

function attachWhere(nodes: Map<string, GraphNode>, field: string, text: string, kind: "parent" | "row") {
  const parts = field.split(".").filter(Boolean);
  if (parts.length <= 1) {
    const os = nodes.get("os");
    if (!os) return;
    (kind === "parent" ? os.parentWhere : os.rowWhere).push(text);
    return;
  }
  let path: string[] = [];
  for (const part of parts.slice(0, -1)) {
    path = [...path, part];
    ensure(nodes, path, part, false);
  }
  const node = nodes.get(idFor(path));
  if (!node) return;
  (kind === "parent" ? node.parentWhere : node.rowWhere).push(text);
}

function formatWherePayload(where: unknown): string[] {
  if (where == null || where === "") return [];
  if (typeof where === "string") return [where];
  if (typeof where === "object" && where !== null && Array.isArray((where as { conditions?: unknown }).conditions)) {
    return ((where as { conditions: Record<string, unknown>[] }).conditions).map(formatCond);
  }
  try {
    return [JSON.stringify(where)];
  } catch {
    return [String(where)];
  }
}

export function joinsFromChains(
  chains: { hops: { relationship?: string; objectName?: string; whereClause?: string | null }[] }[],
  clauseAt?: (
    hops: { relationship?: string; objectName?: string; whereClause?: string | null }[],
    index: number,
  ) => string | null,
): { path: string[]; whereClause: string | null }[] {
  const out: { path: string[]; whereClause: string | null }[] = [];
  for (const chain of chains) {
    const path: string[] = [];
    chain.hops.forEach((h, i) => {
      if (!h.relationship) return;
      path.push(h.relationship);
      const clause = (h.whereClause ?? "").trim() || clauseAt?.(chain.hops, i) || null;
      out.push({ path: [...path], whereClause: clause });
    });
  }
  return out;
}

export function buildQueryGraph(input: {
  osName: string;
  selectFields: string[];
  whereConds: Record<string, unknown>[];
  rawWhere?: string;
  oslcWhere?: string;
  childOptions: Record<string, unknown>[];
  joins?: { path: string[]; whereClause?: string | null }[];
}): GraphNode[] {
  const nodes = new Map<string, GraphNode>();
  ensure(nodes, [], input.osName || "OS", false);
  const os = nodes.get("os")!;
  for (const branch of parseSelectFieldsTree(input.selectFields)) {
    if (!branch.kids.length && !branch.star && branch.fields.length === 0 && !branch.rel) {
      const label = branch.alias ? `${branch.name} -> ${branch.alias}` : branch.name;
      if (!os.fields.includes(label)) os.fields.push(label);
      continue;
    }
    if (!branch.kids.length && !branch.rel && !branch.star && branch.name.includes(".") === false) {
      const label = branch.alias ? `${branch.name} -> ${branch.alias}` : branch.name;
      if (branch.name !== "*" && !os.fields.includes(label)) os.fields.push(label);
      if (branch.name === "*" && !os.fields.includes("*")) os.fields.push("*");
      continue;
    }
    walkSelect(nodes, branch, []);
  }
  const localConds: Record<string, unknown>[] = [];
  const dottedConds: Record<string, unknown>[] = [];
  for (const c of input.whereConds) {
    const field = String(c.field ?? "");
    if (!field) continue;
    if (field.includes(".")) dottedConds.push(c);
    else localConds.push(c);
  }
  if (input.oslcWhere) {
    os.parentWhere.push(input.oslcWhere);
  } else {
    for (const c of localConds) {
      attachWhere(nodes, String(c.field ?? ""), formatCond(c), "parent");
    }
    if (input.rawWhere && !os.parentWhere.includes(input.rawWhere)) os.parentWhere.push(input.rawWhere);
  }
  for (const c of dottedConds) {
    attachWhere(nodes, String(c.field ?? ""), formatCond(c), "parent");
  }
  for (const j of input.joins ?? []) {
    const path = j.path.filter(Boolean);
    if (!path.length) continue;
    let acc: string[] = [];
    for (const part of path) {
      acc = [...acc, part];
      ensure(nodes, acc, part, true);
    }
    const node = nodes.get(idFor(path));
    const clause = (j.whereClause ?? "").trim();
    if (node && clause && !node.joinWhere.includes(clause)) node.joinWhere.push(clause);
  }
  for (const c of input.childOptions) {
    const path = Array.isArray(c.path)
      ? (c.path as string[]).filter(Boolean)
      : [String(c.relationship ?? "")].filter(Boolean);
    if (!path.length) continue;
    let acc: string[] = [];
    for (const part of path) {
      acc = [...acc, part];
      ensure(nodes, acc, part, true);
    }
    const node = nodes.get(idFor(path));
    if (!node) continue;
    for (const line of formatWherePayload(c.where)) {
      if (!node.rowWhere.includes(line)) node.rowWhere.push(line);
    }
  }
  return [...nodes.values()];
}

export type LaidNode = GraphNode & { x: number; y: number; w: number; h: number };

const COL_W = 240;
const COL_GAP = 168;
const NODE_W = 240;

export function layoutQueryGraph(nodes: GraphNode[]): { nodes: LaidNode[]; width: number; height: number } {
  const kids = new Map<string | null, GraphNode[]>();
  for (const n of nodes) {
    const list = kids.get(n.parentId) ?? [];
    list.push(n);
    kids.set(n.parentId, list);
  }
  const laid: LaidNode[] = [];
  function heightOf(n: GraphNode): number {
    const fieldLines = Math.min(n.fields.length, 6);
    const wrap = (lines: string[]) =>
      lines.reduce((sum, w) => sum + Math.max(1, Math.ceil(w.length / 32)), 0);
    const whereLines =
      wrap(n.parentWhere) + wrap(n.joinWhere) + wrap(n.rowWhere) + (n.kind === "os" ? 1 : 0);
    return 48 + fieldLines * 16 + whereLines * 22 + 16;
  }
  function walk(n: GraphNode, depth: number, y: number): number {
    const h = heightOf(n);
    const children = kids.get(n.id) ?? [];
    let childY = y;
    let childH = 0;
    for (const c of children) {
      const used = walk(c, depth + 1, childY);
      childY += used + 16;
      childH += used + 16;
    }
    if (children.length) childH -= 16;
    const boxH = Math.max(h, childH || h);
    const ny = children.length ? y + (boxH - h) / 2 : y;
    laid.push({
      ...n,
      x: 16 + depth * (COL_W + COL_GAP),
      y: ny,
      w: NODE_W,
      h,
    });
    return Math.max(boxH, h);
  }
  const roots = kids.get(null) ?? nodes.filter((n) => n.parentId == null);
  let y = 8;
  let totalH = 0;
  for (const r of roots) {
    const used = walk(r, 0, y);
    y += used + 20;
    totalH = y;
  }
  const width = laid.reduce((m, n) => Math.max(m, n.x + n.w), NODE_W) + 32;
  return { nodes: laid, width, height: Math.max(totalH, 80) };
}
