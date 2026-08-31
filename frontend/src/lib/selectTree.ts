/** Nested select tree for related objects in display config. */
import { splitAlias, splitCommaAware } from "./oslcImport";

export type SelectBranch = {
  name: string;
  rel: boolean;
  alias?: string;
  star: boolean;
  fields: { name: string; alias?: string }[];
  kids: SelectBranch[];
};

function parseBrace(token: string): { rel: boolean; name: string; inner: string } | null {
  const m = token.match(/^(rel\.)?([^{]+)\{([\s\S]*)\}$/i);
  if (!m) return null;
  return { rel: !!m[1], name: m[2].trim(), inner: m[3] };
}

function fromDotted(name: string, alias?: string): SelectBranch {
  const parts = name.split(".").filter(Boolean);
  if (parts.length <= 1) {
    return { name: name || "*", rel: false, alias, star: name === "*", fields: [], kids: [] };
  }
  const rest = parts.slice(1).join(".");
  return {
    name: parts[0],
    rel: false,
    star: false,
    fields: [],
    kids: [rest === "*" ? { name: "*", rel: false, star: true, fields: [], kids: [] } : fromDotted(rest, alias)],
  };
}

export function parseSelectToken(token: string): SelectBranch {
  const brace = parseBrace(token.trim());
  if (brace) {
    const branch: SelectBranch = { name: brace.name, rel: brace.rel, star: false, fields: [], kids: [] };
    const inner = brace.inner.trim();
    if (!inner || inner === "*") {
      branch.star = true;
      return branch;
    }
    for (const part of splitCommaAware(inner)) {
      if (part === "*") {
        branch.star = true;
        continue;
      }
      if (parseBrace(part)) {
        branch.kids.push(parseSelectToken(part));
        continue;
      }
      const { name, alias } = splitAlias(part);
      if (name.includes(".")) {
        branch.kids.push(fromDotted(name, alias));
        continue;
      }
      if (name) branch.fields.push({ name, alias });
    }
    return branch;
  }
  const { name, alias } = splitAlias(token.trim());
  if (name.includes(".")) return fromDotted(name, alias);
  return { name, rel: false, alias, star: name === "*", fields: [], kids: [] };
}

export function parseSelectFieldsTree(fields: string[]): SelectBranch[] {
  return fields.filter(Boolean).map(parseSelectToken);
}

export function clauseLabel(key: string): string {
  const k = key.toLowerCase();
  if (k === "oslc.select") return "Select";
  if (k === "oslc.where") return "Where";
  if (k === "oslc.orderby") return "Order";
  if (k === "oslc.pagesize") return "Page size";
  if (k === "oslc.pageno") return "Page";
  if (k === "oslc.searchterms" || k === "searchterms") return "Search terms";
  if (k === "searchattributes") return "Search attributes";
  if (k === "savedquery") return "Saved query";
  if (k === "collectioncount") return "Collection count";
  if (k.startsWith("sqp:")) return `Saved param ${key.slice(4)}`;
  if (k.endsWith(".where")) return `Child where | ${key.slice(0, -".where".length)}`;
  return key;
}

export function osPathFromEndpoint(url: string): { path: string; os?: string } {
  try {
    const u = new URL(url, "http://local.invalid");
    const parts = u.pathname.split("/").filter(Boolean);
    const i = parts.findIndex((p) => p.toLowerCase() === "os");
    return { path: u.pathname, os: i >= 0 ? parts[i + 1] : undefined };
  } catch {
    return { path: url };
  }
}
