/** Custom select (not native <select>) for themed dropdowns. */
import { useLayoutEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { menuPosition } from "../lib/portalMenu";
import { Icon, faChevronDown } from "./Icon";

export type MenuOption = {
  value: string;
  label: string;
  hint?: string;
  depth?: number;
};

export default function MenuSelect({
  value,
  options,
  onChange,
  placeholder = "Select",
  searchable,
  disabled,
}: {
  value: string;
  options: MenuOption[];
  onChange: (value: string) => void;
  placeholder?: string;
  searchable?: boolean;
  disabled?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState("");
  const wrap = useRef<HTMLDivElement>(null);
  const menu = useRef<HTMLDivElement>(null);
  const input = useRef<HTMLInputElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 240, maxHeight: 260 });
  const showSearch = searchable ?? options.length > 6;

  function place() {
    const el = wrap.current;
    if (!el) return;
    setPos(menuPosition(el.getBoundingClientRect(), menu.current?.offsetHeight ?? 260, Math.max(180, el.getBoundingClientRect().width)));
  }

  const filtered = useMemo(() => {
    const s = q.trim().toLowerCase();
    if (!s) return options;
    return options.filter((o) => o.label.toLowerCase().includes(s) || o.hint?.toLowerCase().includes(s) || o.value.toLowerCase().includes(s));
  }, [options, q]);

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

  const current = options.find((o) => o.value === value);

  return (
    <div className="fpick" ref={wrap}>
      <button type="button" className="fpick-btn" disabled={disabled} onClick={() => setOpen((v) => !v)}>
        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis" }}>{current?.label || placeholder}</span>
        <Icon icon={faChevronDown} />
      </button>
      {open &&
        createPortal(
          <div
            ref={menu}
            className="fpick-menu"
            style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
          >
            {showSearch && (
              <input ref={input} type="text" value={q} placeholder="Search..." onChange={(e) => setQ(e.target.value)} />
            )}
            <div className="fpick-list">
              {filtered.length === 0 && <div className="muted" style={{ padding: 10 }}>No match</div>}
              {filtered.map((o) => (
                <div
                  key={o.value}
                  className={`fpick-item${o.value === value ? " sel" : ""}`}
                  style={{ paddingLeft: 10 + (o.depth ?? 0) * 12 }}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    onChange(o.value);
                    setOpen(false);
                    setQ("");
                  }}
                >
                  <span>{o.label}</span>
                  {o.hint && <span className="muted" style={{ fontSize: "0.68rem" }}>{o.hint}</span>}
                </div>
              ))}
            </div>
          </div>,
          document.body,
        )}
    </div>
  );
}
