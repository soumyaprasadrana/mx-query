/** SVG hop graph for the insight dialog. PNG export is for the full scrollable map. */
import { useMemo, useRef, useState } from "react";
import { buildQueryGraph, layoutQueryGraph } from "../../lib/queryGraph";
import { Icon, faDownload } from "../Icon";

async function pngOf(el: HTMLElement): Promise<string> {
  const { toPng } = await import("html-to-image");
  const prevMax = el.style.maxHeight;
  const prevOverflow = el.style.overflow;
  el.style.maxHeight = "none";
  el.style.overflow = "visible";
  try {
    const bg = getComputedStyle(el).backgroundColor || "#ffffff";
    return await toPng(el, {
      pixelRatio: 2,
      cacheBust: true,
      backgroundColor: bg,
      width: Math.max(el.scrollWidth, el.clientWidth),
      height: Math.max(el.scrollHeight, el.clientHeight),
    });
  } finally {
    el.style.maxHeight = prevMax;
    el.style.overflow = prevOverflow;
  }
}

export default function QueryGraph({
  osName,
  selectFields,
  whereConds,
  rawWhere,
  oslcWhere,
  childOptions,
  joins,
  orMode,
}: {
  osName: string;
  selectFields: string[];
  whereConds: Record<string, unknown>[];
  rawWhere?: string;
  oslcWhere?: string;
  childOptions: Record<string, unknown>[];
  joins?: { path: string[]; whereClause?: string | null }[];
  orMode?: boolean;
}) {
  const laid = useMemo(() => {
    const nodes = buildQueryGraph({ osName, selectFields, whereConds, rawWhere, oslcWhere, childOptions, joins });
    return layoutQueryGraph(nodes);
  }, [osName, selectFields, whereConds, rawWhere, oslcWhere, childOptions, joins]);

  const byId = useMemo(() => new Map(laid.nodes.map((n) => [n.id, n])), [laid.nodes]);
  const wrapRef = useRef<HTMLDivElement>(null);
  const [saving, setSaving] = useState(false);

  if (!laid.nodes.length) return null;

  async function savePng() {
    const el = wrapRef.current;
    if (!el || saving) return;
    setSaving(true);
    try {
      const url = await pngOf(el);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${osName || "query"}-graph.png`;
      a.click();
    } catch (err) {
      console.error("graph png failed", err);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div>
      <div className="spread" style={{ marginBottom: 8 }}>
        <span className="muted" style={{ fontSize: "0.75rem" }}>
          Scroll the map. JOIN is MAXRELATIONSHIP. ROW trims the child array, not the parent.
        </span>
        <button
          type="button"
          className="ghost copy-btn"
          onClick={() => void savePng()}
          disabled={saving}
          title="Export the full scrollable graph, not the clipped viewport"
        >
          <Icon icon={faDownload} /> {saving ? "PNG..." : "PNG"}
        </button>
      </div>
      <div ref={wrapRef} className="qgraph" data-tour="qgraph" style={{ minHeight: laid.height }}>
      <svg
        className="qgraph-edges"
        width={laid.width}
        height={laid.height}
        aria-hidden
      >
        {laid.nodes.map((n) => {
          if (!n.parentId) return null;
          const parent = byId.get(n.parentId);
          if (!parent) return null;
          const x1 = parent.x + parent.w;
          const y1 = parent.y + parent.h / 2;
          const x2 = n.x;
          const y2 = n.y + n.h / 2;
          const mid = (x1 + x2) / 2;
          const hasJoin = n.joinWhere.some((w) => w.trim());
          return (
            <path
              key={`${n.parentId}-${n.id}`}
              d={`M ${x1} ${y1} C ${mid} ${y1}, ${mid} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke={hasJoin ? "var(--accent-2)" : "var(--border)"}
              strokeWidth={hasJoin ? "2" : "1.5"}
            />
          );
        })}
      </svg>
      {laid.nodes.map((n) => {
        if (!n.parentId || !n.joinWhere.length) return null;
        const parent = byId.get(n.parentId);
        if (!parent) return null;
        const x1 = parent.x + parent.w;
        const y1 = parent.y + parent.h / 2;
        const x2 = n.x;
        const y2 = n.y + n.h / 2;
        const clause = n.joinWhere.join(" | ");
        return (
          <div
            key={`join-${n.id}`}
            className="qgraph-edge-join"
            style={{ left: (x1 + x2) / 2, top: (y1 + y2) / 2 }}
            title={clause}
          >
            <span className="qgraph-kicker">JOIN</span>
            <code>{clause}</code>
          </div>
        );
      })}
      {laid.nodes.map((n) => (
        <article
          key={n.id}
          className={`qgraph-node ${n.kind}${n.rel ? " is-rel" : ""}`}
          style={{ left: n.x, top: n.y, width: n.w, minHeight: n.h }}
        >
          <header>
            {n.rel && <span className="badge count">rel.</span>}
            <span className="mono">{n.label}</span>
          </header>
          {n.fields.length > 0 && (
            <div className="qgraph-fields">
              {n.fields.slice(0, 8).map((f) => (
                <span key={f} className="qgraph-chip">{f}</span>
              ))}
              {n.fields.length > 8 && <span className="muted">+{n.fields.length - 8}</span>}
            </div>
          )}
          {(n.kind === "os" || n.parentWhere.length > 0) && (
            <div className="qgraph-where-block">
              <span className="qgraph-kicker">WHERE{orMode && n.kind === "os" ? " | OR" : ""}</span>
              {n.parentWhere.length ? (
                n.parentWhere.map((w, i) => (
                  <div key={`p-${i}`} className="qgraph-where parent" title="Decides which parent rows return">
                    {w}
                  </div>
                ))
              ) : (
                <div className="qgraph-where empty">no parent filter - every matching row can return</div>
              )}
            </div>
          )}
          {n.joinWhere.map((w, i) => (
            <div key={`j-${i}`} className="qgraph-where join" title="Relationship join predicate from MAXRELATIONSHIP">
              <span className="qgraph-kicker">JOIN</span> {w}
            </div>
          ))}
          {n.rowWhere.map((w, i) => {
            const opt = childOptions.find((c) => {
              const path = Array.isArray(c.path)
                ? (c.path as string[]).join(".")
                : String(c.relationship ?? "");
              return path.toLowerCase() === n.id;
            });
            return (
              <div key={`r-${i}`} className="qgraph-where row" title="Trims rows of this related collection">
                <span className="qgraph-kicker">ROW{opt?.opmodeor ? " | OR" : ""}</span> {w}
              </div>
            );
          })}
        </article>
      ))}
    </div>
    </div>
  );
}
