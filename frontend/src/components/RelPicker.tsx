/** Relationship picker for child hops and related WHERE. */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ChildRel } from "../types";
import { menuPosition } from "../lib/portalMenu";

export default function RelPicker({
  rels,
  value,
  onChange,
  placeholder,
  loading,
}: {
  rels: ChildRel[];
  value: string;
  onChange: (rel: ChildRel) => void;
  placeholder?: string;
  loading?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 280, maxHeight: 280 });

  function place() {
    const el = wrap.current;
    if (!el) return;
    setPos(menuPosition(el.getBoundingClientRect(), menu.current?.offsetHeight ?? 280, 280));
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    const list = !s
      ? rels
      : rels.filter(
          (r) =>
            r.relation.toLowerCase().includes(s)
            || r.objectName.toLowerCase().includes(s)
            || (r.inheritedFrom ?? "").toLowerCase().includes(s),
        );
    const os = list.filter((r) => r.inOs);
    const rest = list.filter((r) => !r.inOs);
    os.sort((a, b) => a.relation.localeCompare(b.relation));
    rest.sort((a, b) => a.relation.localeCompare(b.relation));
    return { os, rest, all: [...os, ...rest] };
  }, [rels, q]);

  useLayoutEffect(() => {
    if (!open) return;
    place();
    input.current?.focus();
    const onDoc = (e: MouseEvent) => {
      const t = e.target as Node;
      if (wrap.current?.contains(t) || menu.current?.contains(t)) return;
      setOpen(false);
    };
    const onWin = () => place();
    document.addEventListener("mousedown", onDoc);
    window.addEventListener("scroll", onWin, true);
    window.addEventListener("resize", onWin);
    return () => {
      document.removeEventListener("mousedown", onDoc);
      window.removeEventListener("scroll", onWin, true);
      window.removeEventListener("resize", onWin);
    };
  }, [open, q, filtered.all.length]);

  const current = rels.find((r) => r.relation === value);

  return (
    <div className="fpick" ref={wrap} style={{ flex: 1 }}>
      <button type="button" className="fpick-btn" onClick={() => setOpen((v) => !v)}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>
          {current ? `${current.relation} -> ${current.objectName}` : value || placeholder || "relationship"}
        </span>
        {current?.inheritedFrom && <span className="badge count">{current.inheritedFrom}</span>}
        {current?.inOs && <span className="badge count">OS</span>}
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="fpick-menu"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            <input ref={input} type="text" value={q} placeholder="Search relationships..." onChange={(e) => setQ(e.target.value)} />
            <div className="fpick-list">
              {loading && (
                <div className="row" style={{ padding: 10 }}>
                  <span className="spinner" /> <span className="muted">Loading...</span>
                </div>
              )}
              {!loading && filtered.all.length === 0 && <div className="muted" style={{ padding: 10 }}>No match</div>}
              {filtered.os.length > 0 && (
                <>
                  <div className="fpick-section">OS children - select without rel.</div>
                  {filtered.os.map((r) => (
                    <RelItem key={`os-${r.relation}`} rel={r} selected={r.relation === value} onPick={() => {
                      onChange(r);
                      setOpen(false);
                      setQ("");
                    }} />
                  ))}
                </>
              )}
              {filtered.rest.length > 0 && (
                <>
                  <div className="fpick-section">Relationships - rel.NAME in select</div>
                  {filtered.rest.map((r) => (
                    <RelItem key={`all-${r.relation}`} rel={r} selected={r.relation === value} onPick={() => {
                      onChange(r);
                      setOpen(false);
                      setQ("");
                    }} />
                  ))}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}

function RelItem({
  rel,
  selected,
  onPick,
}: {
  rel: ChildRel;
  selected: boolean;
  onPick: () => void;
}) {
  return (
    <div
      className={`fpick-item${selected ? " sel" : ""}`}
      title={rel.whereClause ?? undefined}
      onMouseDown={(e) => {
        e.preventDefault();
        onPick();
      }}
    >
      <span className="fpick-item-top">
        <span style={{ flex: 1 }}>{rel.relation}</span>
        <span className="muted" style={{ fontSize: "0.68rem" }}>{rel.objectName}</span>
        {rel.inheritedFrom && <span className="badge count">{rel.inheritedFrom}</span>}
        {rel.inOs && <span className="badge count">OS</span>}
      </span>
      {rel.whereClause ? (
        <span className="fpick-item-join">
          <span className="rel-join-label">Join</span>
          <code>{rel.whereClause}</code>
        </span>
      ) : null}
    </div>
  );
}

export function RelJoinLine({ clause }: { clause?: string | null }) {
  const text = clause?.trim();
  if (!text) return null;
  return (
    <p className="rel-join-line">
      <span className="rel-join-label">Join</span>
      <code>{text}</code>
    </p>
  );
}
