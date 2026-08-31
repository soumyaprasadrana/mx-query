/** Pool of short Maximo/MCP facts for InsightStamp. */
export type Insight = {
  id: string;
  title: string;
  body: string;
  doodle: "stamp" | "crane" | "funnel" | "book" | "sign" | "warm" | "lock" | "grid";
};

export const INSIGHTS: Insight[] = [
  { id: "ws", doodle: "stamp", title: "Working sets", body: "Edits land on a scratch copy. Nothing is written to Maximo until ws_commit. Discard and it never happened." },
  { id: "ws2", doodle: "lock", title: "ws_commit is the write", body: "Preview, discard, remove - all local to the set. Commit is the only call that touches Maximo records." },
  { id: "saved", doodle: "book", title: "Saved queries", body: "Those names live in Maximo. We pass savedQuery through - we don't reinvent the query catalog." },
  { id: "sqp", doodle: "book", title: "sqp: parameters", body: "Saved-query parameters travel as sqp:name=value. Fill them here; the server substitutes." },
  { id: "os", doodle: "crane", title: "Object structures", body: "You query an OS (MXAPIWODETAIL), not a table. WORKORDER is the object inside it." },
  { id: "os2", doodle: "crane", title: "OS != object", body: "MXAPIASSET and ASSET are related, not the same. Schema, children, and saved queries hang off the OS name." },
  { id: "select", doodle: "sign", title: "Select spellings", body: "worklog.description is an OS child. rel.ASSET is a relationship. Same English, different OSLC." },
  { id: "rel", doodle: "sign", title: "rel. is optional", body: "When the OS object name matches the relationship (MULTIASSETLOCCI), select can omit rel. Nested hops still use it." },
  { id: "kids", doodle: "funnel", title: "Two filters", body: "childOptions trims child rows. A related WHERE on the parent is EXISTS - which parents return." },
  { id: "exists", doodle: "funnel", title: "EXISTS is not a child trim", body: "assetsite.organization.orgid = EAGLENA decides which work orders return. It does not shrink the child collection." },
  { id: "star", doodle: "sign", title: "isnull on the wire", body: "You pick is empty. The server sends = *STAR*. You don't have to remember that." },
  { id: "inlist", doodle: "funnel", title: "in lists", body: "The in operator is a comma-separated list. One box. We split it." },
  { id: "order", doodle: "sign", title: "Order needs a sign", body: "+wonum ascending, -reportdate descending. Direction is required - the server said so." },
  { id: "page", doodle: "book", title: "No page number", body: "ws_load is { id, useLean }. Load more rebuilds with a bigger pageSize, then loads the set again." },
  { id: "get", doodle: "crane", title: "The GET is theirs", body: "os_query_builder returns the URL. This app never fakes oslc.select. That's why it stays honest." },
  { id: "warm", doodle: "warm", title: "Warm process", body: "Metadata sync is a warmup, not a spinner on every click. The MCP server stays warm for you." },
  { id: "ro", doodle: "lock", title: "readonly", body: "A read-only tenant means the server refuses writes - not just a greyed button." },
  { id: "proxy", doodle: "grid", title: "No bespoke /query", body: "Every lookup is a tool call through the generic proxy. The client does not duplicate server OSLC logic." },
  { id: "lean", doodle: "book", title: "useLean", body: "ws_load can ask for a lean payload. Fewer wrappers, same records. Toggle it when the grid feels heavy." },
  { id: "alias", doodle: "sign", title: "field--alias", body: "Select aliases use field--alias. Results columns use whatever key Maximo returns, not the original name." },
  { id: "search", doodle: "funnel", title: "searchAttributes", body: "Search terms only hit the attributes you mark. Selecting a field includes it by default; you can opt out." },
  { id: "dyn", doodle: "stamp", title: "{{PARAM}}", body: "WHERE values and saved-query params can be templates. The Dynamic tab fills them at execute time." },
  { id: "path", doodle: "crane", title: "childOptions.path", body: "A nested hop where is not a flat {relationship, where}. Current servers want path, noLimit, searchTerms..." },
  { id: "nested", doodle: "grid", title: "Nested rel.", body: "rel.multiassetlocci{rel.asset{assetnum}} is one select tree. Each hop with a where becomes its own childOptions entry." },
  { id: "compact", doodle: "book", title: "Compact relationships", body: "MAXRELATIONSHIP compact names are hops outside the OS. They always spell rel.NAME in select." },
  { id: "oschild", doodle: "sign", title: "OS children first", body: "The picker lists OS-exposed children before compact hops. That's the difference between worklog.description and rel.ASSET." },
  { id: "starselect", doodle: "warm", title: "Select *", body: "Parent * is honest and heavy. Child hops without a select default to * so a where still has something to attach to." },
  { id: "like", doodle: "funnel", title: "like is not regex", body: "OSLC like uses Maximo wildcards. % is the usual contains. Don't paste a JavaScript regex." },
  { id: "domain", doodle: "book", title: "Domain lists", body: "Attributes with a domainId can load a datalist from metadata. If the lookup fails, the text box still works." },
  { id: "yorn", doodle: "sign", title: "YORN", body: "Yes/no Maximo fields are YORN, not boolean true/false. The builder sends what Maximo expects." },
  { id: "dates", doodle: "grid", title: "maxType dates", body: "DATE, DATETIME, and TIME get native pickers. The wire format is Maximo's, not ISO-unless-we-feel-like-it." },
  { id: "upper", doodle: "stamp", title: "UPPER / LOWER", body: "Some attributes store folded case. The input can match that so you don't miss rows you can see in the UI." },
  { id: "import", doodle: "crane", title: "Import a GET", body: "Paste an OSLC URL or os_query_builder JSON. Path is trimmed to /os/{osName}. We never rebuild the GET to fix it." },
  { id: "leanparam", doodle: "lock", title: "Dropped params", body: "lean, checkesig, and friends are not query shape. Import drops them instead of pretending they are filters." },
  { id: "live", doodle: "warm", title: "Live mode", body: "After the form settles, execute runs again. Errors or zero rows keep the last good grid so you don't lose context." },
  { id: "hasmore", doodle: "book", title: "hasMore", body: "meta.hasMore and totalCount come from ws_load, not from guessing page math on the client." },
  { id: "wsid", doodle: "grid", title: "Working-set id", body: "Sometimes workingSet is a string, sometimes workingSet.result.id. extractWsId() accepts both." },
  { id: "csv", doodle: "sign", title: "CSV flatten", body: "Export repeats parent fields on every leaf row. Child columns look like assetsite.organization.site.siteid." },
  { id: "json", doodle: "book", title: "JSON is the tree", body: "JSON export is the nested payload as returned. CSV is the flattened view. They are not the same document." },
  { id: "tool", doodle: "crane", title: "Tool call map", body: "Insight shows what this app sends to MCP. The GET tab is only filled after os_query_builder has run once." },
  { id: "warmup2", doodle: "warm", title: "Warmup is once", body: "Tenant warmup syncs metadata into the MCP process. Switching OS later is a tool call, not a full resync." },
  { id: "tenant", doodle: "lock", title: "Tenant is a process", body: "Each tenant is an isolated MCP stdio session. Credentials never go to the browser as a reusable token." },
  { id: "copilot", doodle: "stamp", title: "copilotMode", body: "That's a Maximo tenant flag, not the wizard Assist hook. Don't confuse the two when we plug a local model in." },
  { id: "assist", doodle: "grid", title: "Assist is a later plug", body: "The wizard can infer step-by-step against live metadata. A model must only return names that exist on the OS." },
  { id: "ops", doodle: "funnel", title: "Operators", body: "= != < > <= >= in like isnull isnotnull. That's the loose where schema the current server accepts." },
  { id: "raw", doodle: "sign", title: "rawWhere", body: "If you import a raw oslc.where string, we can pass it through. The form does not try to parse it back into chips." },
  { id: "childcol", doodle: "crane", title: "childCollection", body: "A GET under /os/OS/child means the query is already scoped. Import sets childCollection instead of rewriting the path." },
  { id: "nolimit", doodle: "book", title: "noLimit", body: "childOptions can ask for noLimit. Use it when a child set is small and you don't want a silent cap." },
  { id: "searchchild", doodle: "funnel", title: "Child searchTerms", body: "Children can search too - searchTerms and searchAttributes on the child option, not only on the parent query." },
  { id: "timeline", doodle: "grid", title: "Timeline range", body: "tlrange=-3M and tlattribute=reportdate is Maximo date-math, not two WHERE rows. Both keys are required. Same pair on childOptions." },
  { id: "domainwhere", doodle: "lock", title: "domaininternalwhere", body: "Internal/domain-coded values (often synonym status), not the display label. We list every attribute that has a domain because the catalog does not say synonym vs ALN." },
  { id: "order2", doodle: "sign", title: "orderBy.rules", body: "The live 1.4.2 shape is { rules: [\"+assetnum\"] }. That becomes oslc.orderBy=%2Bassetnum in the returned URL." },
  { id: "selecttree", doodle: "grid", title: "One nest", body: "Select merges to a single nest. Two hops on the same chain are not two sibling selects." },
  { id: "wherehop", doodle: "funnel", title: "WHERE without select", body: "A hop that only has a where still needs a select to hang on. Default is * so the filter isn't dropped." },
  { id: "status", doodle: "stamp", title: "op_success", body: "If os_query_builder or ws_load returns op_success: false, the status bar shows error.detail. Don't ignore a 200 with a failed op." },
];

export function pickInsight(excludeId?: string): Insight {
  const pool = excludeId ? INSIGHTS.filter((i) => i.id !== excludeId) : INSIGHTS;
  if (!pool.length) return INSIGHTS[0];
  return pool[Math.floor(Math.random() * pool.length)]!;
}

/** @deprecated use pickInsight - kept so old call sites don't break during edits */
export function insightFor(_step?: string): Insight {
  return pickInsight();
}
