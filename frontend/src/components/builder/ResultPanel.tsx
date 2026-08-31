/** Execute output: table, JSON, charts, searchTerms. */
import { lazy, Suspense, useEffect, useMemo, useState, CSSProperties } from "react";
import { LoadMeta } from "../../types";
import { applyDisplayFlatten, childCollections, flattenNestedRows, rowsToCsv, scalarColumnsFor, DisplaySpec } from "../../lib/schema";
import { ReportField, ReportSpec, isReportEmpty } from "../../lib/resultReport";
import { highlightJson, paramColor, parseQueryParams, splitEndpoint } from "../../lib/highlight";
import { AppliedStyle, TableView, cellStyle, columnLabel, emptyTableView, orderedColumns, rowStyle } from "../../lib/tableView";

const ResultReport = lazy(() => import("./ResultReport"));
import { Icon, faCopy, faFloppyDisk, faMagnifyingGlass } from "../Icon";

function paint(style?: AppliedStyle): CSSProperties | undefined {
  if (!style) return undefined;
  return { background: style.background, color: style.color };
}

function mergePaint(row?: AppliedStyle, cell?: AppliedStyle): CSSProperties | undefined {
  if (!row && !cell) return undefined;
  return paint({
    background: cell?.background ?? row?.background,
    color: cell?.color ?? row?.color,
  });
}

function renderCell(v: unknown, type: string | undefined) {
  if (v == null || v === "") return <span className="muted">-</span>;
  if (typeof v === "object") return <span className="mono">{JSON.stringify(v)}</span>;
  if (type === "boolean" || typeof v === "boolean") {
    const truthy = v === true || v === "true" || v === 1 || v === "1";
    return <span className="badge" style={{ color: truthy ? "var(--type-str)" : "var(--muted)" }}>{truthy ? "Yes" : "No"}</span>;
  }
  if (type === "integer" || type === "number" || typeof v === "number") {
    return <span className="mono" style={{ display: "block", textAlign: "right", fontVariantNumeric: "tabular-nums" }}>{String(v)}</span>;
  }
  return <span className="mono">{String(v)}</span>;
}

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

function download(name: string, body: string, mime: string) {
  const blob = new Blob([body], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

function queryExportName(args: Record<string, unknown> | null): string {
  const raw = String(args?.osName ?? "query").trim() || "query";
  const os = raw.replace(/[^A-Za-z0-9._-]+/g, "_");
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}-${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  return `${os}_${stamp}.json`;
}

function EndpointStrip({ url }: { url: string }) {
  const { base, query } = splitEndpoint(url);
  const params = parseQueryParams(url);
  return (
    <div className="endpoint-wrap">
      <div className="endpoint-strip">
        <span className="verb">GET</span> <span className="base">{base}</span>
        {query && (
          <>
            <span className="base">?</span>
            {params.map(([k, v], i) => (
              <span key={`${k}-${i}`}>
                {i > 0 && <span className="base">&amp;</span>}
                <span className="pk" style={{ color: paramColor(k) }}>{k}</span>
                <span className="base">=</span>
                <span className="pv">{v}</span>
              </span>
            ))}
          </>
        )}
      </div>
    </div>
  );
}

function TreeTable({
  rows,
  label,
  depth,
  preferredColumns,
  fieldTypeByName,
  expandAll,
  view,
}: {
  rows: Record<string, unknown>[];
  label: string;
  depth: number;
  preferredColumns?: string[];
  fieldTypeByName: Record<string, string>;
  expandAll: boolean;
  view?: TableView;
}) {
  const [open, setOpen] = useState<Set<number>>(new Set());
  const raw = scalarColumnsFor(rows, preferredColumns ?? []);
  const columns = view ? orderedColumns(raw, view) : raw;
  const depthClass = `d${Math.min(depth, 4)}`;

  useEffect(() => {
    setOpen(expandAll ? new Set(rows.map((_, i) => i)) : new Set());
  }, [expandAll]);

  function toggle(i: number) {
    setOpen((prev) => {
      const next = new Set(prev);
      next.has(i) ? next.delete(i) : next.add(i);
      return next;
    });
  }

  return (
    <div className={`tree-level ${depthClass}`}>
      <div className="tree-level-head">
        <span>{label}</span>
        <span className="muted">{rows.length}</span>
      </div>
      <div className="tree-table">
        <table>
          <thead>
            <tr>
              <th style={{ width: 28 }} />
              {columns.map((c) => (
                <th key={c}>{view ? columnLabel(c, view) : c}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const kids = childCollections(r);
              const expanded = open.has(i);
              return (
                <RowGroup
                  key={i}
                  row={r}
                  columns={columns}
                  kids={kids}
                  expanded={expanded}
                  fieldTypeByName={fieldTypeByName}
                  onToggle={() => toggle(i)}
                  depth={depth}
                  expandAll={expandAll}
                  view={view}
                />
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function RowGroup({
  row,
  columns,
  kids,
  expanded,
  fieldTypeByName,
  onToggle,
  depth,
  expandAll,
  view,
}: {
  row: Record<string, unknown>;
  columns: string[];
  kids: [string, Record<string, unknown>[]][];
  expanded: boolean;
  fieldTypeByName: Record<string, string>;
  onToggle: () => void;
  depth: number;
  expandAll: boolean;
  view?: TableView;
}) {
  const rs = view ? rowStyle(row, view.rules) : undefined;
  return (
    <>
      <tr className={kids.length ? "clickable" : ""} onClick={kids.length ? onToggle : undefined} style={paint(rs)}>
        <td>
          {kids.length ? <span className="tree-chevron">{expanded ? "v" : ">"}</span> : null}
        </td>
        {columns.map((c) => (
          <td key={c} style={mergePaint(rs, view ? cellStyle(row, c, view.rules) : undefined)}>
            {renderCell(row[c], fieldTypeByName[c])}
          </td>
        ))}
      </tr>
      {expanded && kids.length > 0 && (
        <tr className="tree-child-row">
          <td colSpan={columns.length + 1}>
            <div className="tree-children">
              {kids.map(([name, nested]) => (
                <TreeTable
                  key={name}
                  rows={nested}
                  label={name}
                  depth={depth + 1}
                  fieldTypeByName={fieldTypeByName}
                  expandAll={expandAll}
                />
              ))}
            </div>
          </td>
        </tr>
      )}
    </>
  );
}

export type ResultTab = "call" | "dynamic" | "response";

export default function ResultPanel({
  tab,
  onTab,
  builtArgs,
  templateArgs,
  builtResponse,
  endpoint,
  rows,
  columns,
  fieldTypeByName,
  meta,
  busy,
  loadingMore,
  onLoadMore,
  searchTerms,
  onSearchTerms,
  flattenKeys,
  report,
  reportFields,
  tableView,
  exportDoc,
  onSave,
  onSaveAs,
  saveBusy,
  reportOnly,
  onInsight,
  onApplySearch,
}: {
  tab: ResultTab;
  onTab: (t: ResultTab) => void;
  builtArgs: Record<string, unknown> | null;
  templateArgs: Record<string, unknown> | null;
  builtResponse: unknown;
  endpoint?: string;
  rows: Record<string, unknown>[];
  columns: string[];
  fieldTypeByName: Record<string, string>;
  meta: LoadMeta | null;
  busy: boolean;
  loadingMore: boolean;
  onLoadMore: () => void;
  searchTerms: string;
  onSearchTerms: (v: string) => void;
  flattenKeys: DisplaySpec;
  report: ReportSpec;
  reportFields: ReportField[];
  tableView?: TableView;
  exportDoc?: Record<string, unknown> | null;
  onSave?: () => void;
  onSaveAs?: () => void;
  saveBusy?: boolean;
  reportOnly?: boolean;
  onInsight: () => void;
  onApplySearch?: () => void;
}) {
  const [expandAll, setExpandAll] = useState(false);
  const [maximized, setMaximized] = useState(false);
  const view = tableView ?? emptyTableView();

  useEffect(() => {
    if (!maximized) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setMaximized(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [maximized]);

  const hasDynamics = !!templateArgs;
  const shownArgs = tab === "dynamic" && templateArgs ? templateArgs : builtArgs;
  const callText = shownArgs ? `os_query_builder(${JSON.stringify(shownArgs, null, 2)})` : "";
  const exportJson = exportDoc ? JSON.stringify(exportDoc, null, 2) : "";
  const display = useMemo(
    () => applyDisplayFlatten(rows, flattenKeys),
    [rows, flattenKeys],
  );
  const tableColumns = [...columns, ...display.extraCols.filter((c) => !columns.includes(c))];

  return (
    <>
      {!reportOnly && (
      <div className="tool-panel panel-block" style={{ padding: 0 }}>
        <div className="vscode-tabs">
          <button className={tab === "call" ? "active" : ""} onClick={() => onTab("call")} disabled={!builtArgs}>
            Tool call
          </button>
          {hasDynamics && (
            <button className={tab === "dynamic" ? "active" : ""} onClick={() => onTab("dynamic")}>
              Dynamic
            </button>
          )}
          <button className={tab === "response" ? "active" : ""} onClick={() => onTab("response")} disabled={builtResponse == null}>
            Response
          </button>
          <span style={{ flex: 1 }} />
          <button className="ghost copy-btn" onClick={onInsight}>
            Insight
          </button>
          {exportJson && (
            <>
              <CopyBtn text={exportJson} label="Copy JSON" />
              <button
                className="ghost copy-btn"
                onClick={() => download(queryExportName(exportDoc ?? builtArgs), exportJson, "application/json")}
              >
                Export JSON
              </button>
              {onSave && (
                <button className="ghost copy-btn" disabled={saveBusy} onClick={onSave}>
                  <Icon icon={faFloppyDisk} /> {saveBusy ? "Saving..." : "Save"}
                </button>
              )}
              {onSaveAs && (
                <button className="ghost copy-btn" onClick={onSaveAs}>
                  Save as
                </button>
              )}
            </>
          )}
          {tab === "response" && endpoint && <CopyBtn text={endpoint} label="Copy GET URL" />}
          {tab !== "response" && callText && <CopyBtn text={callText} />}
        </div>
        {tab === "call" && builtArgs && (
          <div className="tool-call">
            <span className="fn">os_query_builder</span>
            <span className="punc">(</span>
            {highlightJson(builtArgs)}
            <span className="punc">)</span>
          </div>
        )}
        {tab === "dynamic" && templateArgs && (
          <div className="tool-call">
            <span className="fn">os_query_builder</span>
            <span className="punc">(</span>
            {highlightJson(templateArgs)}
            <span className="punc">)</span>
          </div>
        )}
        {tab === "response" && builtResponse != null && (
          <div className="tool-call">
            {typeof endpoint === "string" && <EndpointStrip url={endpoint} />}
            {highlightJson(builtResponse)}
          </div>
        )}
        {!builtArgs && (
          <div className="empty-hint" style={{ margin: 12 }}>
            Search for an object structure, pick fields, then execute - or Import from the Query toolbar.
          </div>
        )}
      </div>
      )}

      {maximized && <div className="results-backdrop" onClick={() => setMaximized(false)} />}

      <div className={`results-panel panel-block${maximized ? " maximized" : ""}`} style={{ padding: 0 }}>
        <div className="results-head">
          <div className="spread" style={{ padding: "10px 14px 8px", flexShrink: 0 }}>
            <label className="lbl" style={{ marginBottom: 0 }}>
              {view.header.trim() || "Results"}{" "}
              {meta?.totalCount != null
                ? `(${rows.length} of ${meta.totalCount}${meta.hasMore ? "+" : ""})`
                : rows.length ? `(${rows.length})` : ""}
            </label>
            <div className="row" style={{ gap: 6 }}>
              {rows.length > 0 && (
                <>
                  <button className="ghost copy-btn" onClick={() => setExpandAll((v) => !v)}>
                    {expandAll ? "Collapse all" : "Expand all"}
                  </button>
                  <button
                    className="ghost copy-btn"
                    onClick={() => download("results.json", JSON.stringify(rows, null, 2), "application/json")}
                  >
                    JSON
                  </button>
                  <button
                    className="ghost copy-btn"
                    title="One Excel row per leaf; parent fields repeat, child fields use dotted paths"
                    onClick={() => download("results.csv", rowsToCsv(flattenNestedRows(display.rows)), "text/csv")}
                  >
                    CSV
                  </button>
                  {!reportOnly && (
                    <button className="ghost copy-btn" onClick={() => setMaximized((v) => !v)}>
                      {maximized ? "Restore" : "Maximize"}
                    </button>
                  )}
                </>
              )}
              {meta?.hasMore && (
                <button className="ghost" onClick={onLoadMore} disabled={loadingMore || busy}>
                  {loadingMore ? "Loading..." : "Load more"}
                </button>
              )}
            </div>
          </div>
          <div className="results-search" data-flight="search">
            <input
              type="text"
              className="results-search-input"
              placeholder="Search Maximo - Enter or Search to re-run with searchTerms"
              value={searchTerms}
              onChange={(e) => onSearchTerms(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") {
                  e.preventDefault();
                  onApplySearch?.();
                }
              }}
            />
            <button
              type="button"
              className="ghost"
              disabled={busy || loadingMore || !onApplySearch}
              title="Re-run the query with this search text"
              onClick={() => onApplySearch?.()}
            >
              <Icon icon={faMagnifyingGlass} /> Search
            </button>
          </div>
        </div>
        {(busy || loadingMore) && (
          <div className={`results-loading${rows.length ? " overlay" : ""}`}>
            <span className="spinner" />
            <span>{loadingMore ? "Loading more..." : "Loading results..."}</span>
          </div>
        )}
        {!isReportEmpty(report) && (
          <Suspense fallback={null}>
            <ResultReport
              spec={report}
              rows={display.rows}
              fields={reportFields}
              pageHint={
                meta?.totalCount != null
                  ? `This page | ${rows.length} of ${meta.totalCount}${meta.hasMore ? "+" : ""} rows.`
                  : rows.length
                    ? `This page | ${rows.length} row${rows.length === 1 ? "" : "s"}.`
                    : "Execute to fill tiles and charts from this page of rows."
              }
            />
          </Suspense>
        )}
        {display.rows.length > 0 && (
          <div className="linked-stack">
            {view.header.trim() && (
              <div className="table-view-header">{view.header.trim()}</div>
            )}
            <TreeTable
              rows={display.rows}
              label="parent"
              depth={0}
              preferredColumns={tableColumns}
              fieldTypeByName={fieldTypeByName}
              expandAll={expandAll}
              view={view}
            />
          </div>
        )}
        {!rows.length && !busy && (
          <div className="empty-hint" style={{ margin: 12 }}>No rows yet.</div>
        )}
      </div>
    </>
  );
}
