/** Query graph overlay: hops, joins, and shape of the GET. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { paramColor, parseQueryParams, splitEndpoint } from "../../lib/highlight";
import { splitCommaAware } from "../../lib/oslcImport";
import {
  osPathFromEndpoint,
  parseSelectFieldsTree,
  SelectBranch,
} from "../../lib/selectTree";
import { Icon, faCopy } from "../Icon";
import QueryGraph from "./QueryGraph";

function CopyBtn({ text, label = "Copy" }: { text: string; label?: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      className="ghost copy-btn"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1200);
        } catch {
          /* ignore */
        }
      }}
    >
      {done ? "Copied" : <><Icon icon={faCopy} /> {label}</>}
    </button>
  );
}

function BranchView({ branch, depth = 0 }: { branch: SelectBranch; depth?: number }) {
  const color = branch.rel ? "var(--accent-2)" : depth === 0 ? "var(--accent)" : "var(--type-str)";
  return (
    <div className={`insight-branch d${Math.min(depth, 4)}`}>
      <div className="insight-branch-name" style={{ borderLeftColor: color }}>
        {branch.rel && <span className="badge count">rel.</span>}
        <span className="mono">{branch.name}</span>
        {branch.alias && <span className="muted"> as {branch.alias}</span>}
        {branch.star && <span className="badge count">*</span>}
      </div>
      {branch.fields.length > 0 && (
        <div className="insight-fields">
          {branch.fields.map((f) => (
            <span key={f.name} className="insight-chip">
              <span className="mono">{f.name}</span>
              {f.alias && <span className="muted">{" -> "}{f.alias}</span>}
            </span>
          ))}
        </div>
      )}
      {branch.kids.map((kid, i) => (
        <BranchView key={`${kid.name}-${i}`} branch={kid} depth={depth + 1} />
      ))}
    </div>
  );
}

function SelectTree({ fields }: { fields: string[] }) {
  if (!fields.length) return <Empty label="No columns yet" />;
  const roots = parseSelectFieldsTree(fields);
  const leaves = roots.filter((b) => !b.kids.length && !b.star && b.fields.length === 0);
  const nested = roots.filter((b) => !leaves.includes(b));
  return (
    <div className="insight-select">
      {leaves.length > 0 && (
        <div className="insight-fields" style={{ marginBottom: nested.length ? 10 : 0 }}>
          {leaves.map((b) => (
            <span key={b.name} className="insight-chip">
              <span className="mono">{b.name}</span>
              {b.alias && <span className="muted">{" -> "}{b.alias}</span>}
              {b.star && <span className="badge count">*</span>}
            </span>
          ))}
        </div>
      )}
      {nested.map((b, i) => (
        <BranchView key={`${b.name}-${i}`} branch={b} />
      ))}
    </div>
  );
}

function Empty({ label = "-" }: { label?: string }) {
  return <span className="anatomy-empty">{label}</span>;
}

function formatCond(c: Record<string, unknown>): string {
  const field = String(c.field ?? "");
  const op = String(c.op ?? "=");
  if (op === "isnull") return `${field} is null`;
  if (op === "isnotnull") return `${field} is not null`;
  const value = Array.isArray(c.value) ? `[${c.value.join(", ")}]` : String(c.value ?? "");
  return `${field} ${op} ${value}`;
}

const OSLC_EXPLAIN: Record<string, string> = {
  "oslc.select": "Columns Maximo returns. Nested rel.NAME{...} loads related objects in the same response.",
  "oslc.where": "Which parent rows return. A dotted path (asset.assetnum) means only parents with a matching related object.",
  "oslc.orderby": "Sorts parent rows. + ascending, - descending.",
  "oslc.pagesize": "How many parent rows Maximo sends per page.",
  "oslc.pageno": "Which page of parent rows.",
  "oslc.searchterms": "Free-text search across the attributes listed in searchAttributes.",
  "oslc.lean": "1 = compact JSON. Does not change which records or fields you asked for.",
  collectioncount: "Ask Maximo to include a total-count of matching parent rows.",
};

function explainParam(k: string): string | undefined {
  const lower = k.toLowerCase();
  if (OSLC_EXPLAIN[lower]) return OSLC_EXPLAIN[lower];
  if (lower.startsWith("sqp:")) return "Value for a saved-query parameter.";
  if (lower.endsWith(".where")) return "Filters rows of this related collection - not which parents return.";
  return undefined;
}

const META_KEYS = new Set(["oslc.lean", "collectioncount", "lean"]);

export default function InsightDialog({
  args,
  endpoint,
  joins,
  onClose,
}: {
  args: Record<string, unknown> | null;
  endpoint?: string;
  joins?: { path: string[]; whereClause?: string | null }[];
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  const selectFields = Array.isArray((args?.select as { fields?: unknown } | undefined)?.fields)
    ? ((args!.select as { fields: unknown[] }).fields.filter((f) => typeof f === "string") as string[])
    : [];
  const whereConds = Array.isArray((args?.where as { conditions?: unknown } | undefined)?.conditions)
    ? ((args!.where as { conditions: Record<string, unknown>[] }).conditions)
    : [];
  const childOptions = Array.isArray(args?.childOptions)
    ? (args!.childOptions as Record<string, unknown>[])
    : [];
  const orderRules = Array.isArray((args?.orderBy as { rules?: unknown } | undefined)?.rules)
    ? ((args!.orderBy as { rules: unknown[] }).rules.map(String))
    : [];
  const params = endpoint ? parseQueryParams(endpoint) : [];
  const { base } = endpoint ? splitEndpoint(endpoint) : { base: "" };
  const osMeta = endpoint ? osPathFromEndpoint(endpoint) : { path: "", os: String(args?.osName ?? "") };
  const osName = String(args?.osName ?? osMeta.os ?? "");
  const getSelect = params.find(([k]) => k.toLowerCase() === "oslc.select")?.[1];
  const getWhere = params.find(([k]) => k.toLowerCase() === "oslc.where")?.[1];
  const getOrder = params.find(([k]) => k.toLowerCase() === "oslc.orderby")?.[1];
  const getPage = params.find(([k]) => k.toLowerCase() === "oslc.pagesize")?.[1];
  const metaParams = params.filter(([k]) => META_KEYS.has(k.toLowerCase()));
  const otherParams = params.filter(([k]) => {
    const n = k.toLowerCase();
    return !META_KEYS.has(n) && n !== "oslc.select" && n !== "oslc.where" && n !== "oslc.orderby" && n !== "oslc.pagesize";
  });

  return createPortal(
    <div
      className="insight-overlay"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="insight-dialog" role="dialog" aria-modal="true" aria-labelledby="insight-title">
        <header className="insight-head">
          <div>
            <p className="insight-kicker">Query anatomy</p>
            <h2 id="insight-title">{osName || "Untitled query"}</h2>
            <p className="muted">How this GET is driven - parent rows, related hops, and which filters apply where.</p>
          </div>
          <div className="row" style={{ gap: 8 }}>
            {endpoint && <CopyBtn text={endpoint} label="Copy GET URL" />}
            {args && <CopyBtn text={JSON.stringify(args, null, 2)} label="Copy tool call" />}
            <button type="button" className="ghost" onClick={onClose}>
              Close
            </button>
          </div>
        </header>

        <div className="insight-body">
          <section className="insight-section">
            <h3>How the query is driven</h3>
            <p className="insight-blurb">
              Each box is an object in the GET. <strong>WHERE</strong> on the parent decides which rows return.
              <strong> JOIN</strong> is the relationship predicate. <strong>ROW</strong> filters nested collection rows only.
            </p>
            <QueryGraph
              osName={osName}
              selectFields={getSelect ? splitCommaAware(getSelect) : selectFields}
              whereConds={whereConds}
              rawWhere={typeof args?.rawWhere === "string" ? String(args.rawWhere) : undefined}
              oslcWhere={getWhere}
              childOptions={childOptions}
              joins={joins}
              orMode={args?.orMode === true}
            />
          </section>

          <section className="insight-section">
            <h3>OSLC GET</h3>
            {endpoint ? (
              <div className="insight-get">
                <span className="verb">GET</span> <span className="mono">{base || osMeta.path}</span>
              </div>
            ) : (
              <p className="muted" style={{ marginTop: 0 }}>
                Execute once to fill the GET Maximo actually received. The map below is still the live query.
              </p>
            )}
          </section>

          <section className="insight-section">
            <h3>Select</h3>
            <p className="insight-blurb">{OSLC_EXPLAIN["oslc.select"]}</p>
            <SelectTree fields={getSelect ? splitCommaAware(getSelect) : selectFields} />
          </section>

          <section className="insight-section">
            <h3>Where <span className="mono muted">oslc.where</span></h3>
            <p className="insight-blurb">{OSLC_EXPLAIN["oslc.where"]}</p>
            {getWhere ? (
              <pre className="insight-pre">{getWhere}</pre>
            ) : args?.rawWhere ? (
              <pre className="insight-pre">{String(args.rawWhere)}</pre>
            ) : whereConds.length ? (
              <ul className="insight-list">
                {whereConds.map((c, i) => (
                  <li key={i} className="mono">{formatCond(c)}</li>
                ))}
              </ul>
            ) : (
              <Empty label="No parent where - every matching parent can return" />
            )}
          </section>

          <section className="insight-section">
            <h3>Related-row filters</h3>
            <p className="insight-blurb">
              Nested collection filters. These trim which related rows load (SR{" -> "}ASSET{" -> "}ACTIVEASSETMETER), not which parent rows return.
            </p>
            {childOptions.length ? (
              <ul className="insight-list insight-rel-filters">
                {childOptions.map((c, i) => {
                  const path = Array.isArray(c.path) ? (c.path as string[]) : [String(c.relationship ?? "")];
                  return (
                    <li key={i}>
                      <div className="mono">{path.filter(Boolean).join(" -> ")}</div>
                      {c.where != null && (
                        <pre className="insight-pre">
                          {typeof c.where === "string" ? c.where : JSON.stringify(c.where, null, 2)}
                        </pre>
                      )}
                    </li>
                  );
                })}
              </ul>
            ) : (
              <Empty label="No nested row filters" />
            )}
          </section>

          <section className="insight-section">
            <h3>Order | page</h3>
            <p className="insight-blurb">{OSLC_EXPLAIN["oslc.orderby"]} {OSLC_EXPLAIN["oslc.pagesize"]}</p>
            <div className="insight-chips-row">
              {(getOrder ? getOrder.split(",") : orderRules).filter(Boolean).map((r) => (
                <span key={r} className="insight-chip mono">{r.trim()}</span>
              ))}
              {(getPage || args?.pageSize != null) && (
                <span className="insight-chip mono">{String(getPage ?? args?.pageSize)} rows</span>
              )}
              {!getOrder && !orderRules.length && !getPage && args?.pageSize == null && (
                <Empty label="Default order and page size" />
              )}
            </div>
          </section>

          {(metaParams.length > 0 || otherParams.length > 0) && (
            <section className="insight-section">
              <h3>Also on this request</h3>
              <p className="insight-blurb">Flags Maximo accepts on the same GET. They don't change the select / where story above.</p>
              <div className="insight-meta-row">
                {[...metaParams, ...otherParams].map(([k, v], i) => (
                  <span key={`${k}-${i}`} className="insight-meta-chip" title={explainParam(k)}>
                    <span className="mono" style={{ color: paramColor(k) }}>{k}</span>
                    <span className="mono">{v}</span>
                  </span>
                ))}
              </div>
            </section>
          )}
        </div>
      </div>
    </div>,
    document.body,
  );
}

