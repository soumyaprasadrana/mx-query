/** Highlight matched substrings in search hits. */
import { ReactNode } from "react";

export function highlightJson(value: unknown): ReactNode[] {
  const json = JSON.stringify(value, null, 2);
  const tokenRe =
    /("(\\u[a-zA-Z0-9]{4}|\\[^u]|[^\\"])*"(\s*:)?|\b(?:true|false|null)\b|-?\d+(?:\.\d*)?(?:[eE][+-]?\d+)?)/g;
  const parts: ReactNode[] = [];
  let lastIndex = 0;
  let m: RegExpExecArray | null;
  let key = 0;
  while ((m = tokenRe.exec(json))) {
    if (m.index > lastIndex) parts.push(json.slice(lastIndex, m.index));
    const token = m[0];
    let cls = "num";
    if (token.startsWith('"')) cls = token.endsWith(":") ? "key" : "str";
    else if (token === "true" || token === "false" || token === "null") cls = "punc";
    parts.push(
      <span key={key++} className={cls}>
        {token}
      </span>,
    );
    lastIndex = tokenRe.lastIndex;
  }
  parts.push(json.slice(lastIndex));
  return parts;
}

const PARAM_COLOR: Record<string, string> = {
  "oslc.select": "var(--accent)",
  "oslc.where": "var(--type-str)",
  "oslc.orderBy": "var(--type-date)",
  "oslc.pageSize": "var(--type-num)",
  "oslc.pageNo": "var(--accent)",
  "oslc.paging": "var(--accent)",
  collectioncount: "var(--type-str)",
  savedQuery: "var(--type-str)",
  searchAttributes: "var(--accent)",
  osName: "var(--accent)",
  lean: "var(--muted)",
  relativeuri: "var(--type-date)",
  internalvalues: "var(--type-bool)",
};

export function paramColor(key: string): string {
  if (key.startsWith("sqp:")) return "var(--type-str)";
  if (key.endsWith(".where")) return "var(--type-date)";
  return PARAM_COLOR[key] || "var(--text)";
}

export function parseQueryParams(endpoint: string): [string, string][] {
  const q = endpoint.includes("?") ? endpoint.slice(endpoint.indexOf("?") + 1) : "";
  if (!q) return [];
  return q.split("&").map((pair) => {
    const eq = pair.indexOf("=");
    if (eq < 0) return [decodeURIComponent(pair), ""];
    return [decodeURIComponent(pair.slice(0, eq)), decodeURIComponent(pair.slice(eq + 1))];
  });
}

export function splitEndpoint(endpoint: string): { base: string; query: string } {
  const i = endpoint.indexOf("?");
  if (i < 0) return { base: endpoint, query: "" };
  return { base: endpoint.slice(0, i), query: endpoint.slice(i + 1) };
}
