/** Searchable attribute picker used by builder fields and child hops. */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { FieldInfo } from "../types";
import { accentForType, typeLabel } from "../lib/schema";
import { menuPosition } from "../lib/portalMenu";

export default function FieldPicker({
  fields,
  value,
  onChange,
  disabled,
}: {
  fields: FieldInfo[];
  value: string;
  onChange: (name: string) => void;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240, maxHeight: 260 });

  function place() {
    const el = wrap.current;
    if (!el) return;
    setPos(menuPosition(el.getBoundingClientRect(), menu.current?.offsetHeight ?? 260, 260));
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return fields;
    return fields.filter((f) => f.name.toLowerCase().includes(s) || f.title.toLowerCase().includes(s));
  }, [fields, q]);

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
  }, [open, q, filtered.length]);

  const current = fields.find((f) => f.name === value);

  return (
    <div className="fpick" ref={wrap}>
      <button type="button" className="fpick-btn" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        {current && <span className="type-dot" style={{ background: accentForType(current.type, current.subType) }} />}
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{value || "field"}</span>
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="fpick-menu"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            <input ref={input} type="text" value={q} placeholder="Search fields..." onChange={(e) => setQ(e.target.value)} />
            <div className="fpick-list">
              {filtered.length === 0 && <div className="muted" style={{ padding: 10 }}>No match</div>}
              {filtered.map((f) => {
                const color = accentForType(f.type, f.subType);
                return (
                  <div
                    key={f.name}
                    className={`fpick-item${f.name === value ? " sel" : ""}`}
                    onMouseDown={(e) => {
                      e.preventDefault();
                      onChange(f.name);
                      setOpen(false);
                      setQ("");
                    }}
                  >
                    <span className="type-dot" style={{ background: color }} />
                    <span style={{ flex: 1 }}>{f.name}</span>
                    <span className="type-badge" style={{ color, border: `1px solid ${color}44` }}>
                      {typeLabel(f.type, f.subType)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
