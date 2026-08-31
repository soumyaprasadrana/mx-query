/** Column picker: star, suggested, browse, selected strip. */
import { useMemo, useState } from "react";
import { FieldInfo } from "../../types";
import { accentForType, typeLabel } from "../../lib/schema";
import { Icon, faAsterisk, faCheck, faEraser, faMagnifyingGlass, faStar, faXmark } from "../Icon";

export default function WizFieldPick({
  fields,
  useful,
  selected,
  selectAll,
  onToggle,
  onSelectAll,
  onApplyUseful,
  onClear,
}: {
  fields: FieldInfo[];
  useful: FieldInfo[];
  selected: Set<string>;
  selectAll: boolean;
  onToggle: (name: string) => void;
  onSelectAll: () => void;
  onApplyUseful: () => void;
  onClear: () => void;
}) {
  const [browse, setBrowse] = useState<"useful" | "all">("useful");
  const [q, setQ] = useState("");
  const usefulNames = useMemo(() => new Set(useful.map((f) => f.name)), [useful]);
  const catalog = useMemo(() => {
    let list = browse === "useful" ? (useful.length ? useful : fields.slice(0, 18)) : fields;
    const s = q.trim().toLowerCase();
    if (s) {
      list = list.filter((f) => f.name.toLowerCase().includes(s) || f.title.toLowerCase().includes(s));
    }
    if (browse === "all") {
      list = [...list].sort((a, b) => {
        const ua = usefulNames.has(a.name) ? 0 : 1;
        const ub = usefulNames.has(b.name) ? 0 : 1;
        return ua - ub || a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [browse, useful, fields, q, usefulNames]);
  const picked = useMemo(
    () => fields.filter((f) => selected.has(f.name)),
    [fields, selected],
  );

  return (
    <div className="wiz-field-box">
      <div className="wiz-modes">
        <button type="button" className={selectAll ? "on" : ""} onClick={onSelectAll} title="Every attribute">
          <Icon icon={faAsterisk} /> All
        </button>
        <button
          type="button"
          className={!selectAll && browse === "useful" ? "on" : ""}
          onClick={() => {
            setBrowse("useful");
            onApplyUseful();
          }}
        >
          <Icon icon={faStar} /> Suggested
        </button>
        <button
          type="button"
          className={!selectAll && browse === "all" ? "on" : ""}
          onClick={() => setBrowse("all")}
        >
          <Icon icon={faMagnifyingGlass} /> Browse
        </button>
        <span className="wiz-modes-spacer" />
        <button
          type="button"
          className="ghost"
          disabled={selectAll ? false : selected.size === 0}
          onClick={onClear}
        >
          <Icon icon={faEraser} /> Clear
        </button>
        <span className="badge count">{selectAll ? "*" : `${selected.size}`}</span>
      </div>
      {selectAll && <p className="wiz-hint">Every attribute on this object is selected.</p>}
      {!selectAll && (
        <>
          {picked.length > 0 && (
            <div className="wiz-picked" data-tour="wiz-picked">
              {picked.map((f) => (
                <button
                  type="button"
                  key={`sel-${f.name}`}
                  className="wiz-picked-chip"
                  title={`Remove ${f.name}`}
                  onClick={() => onToggle(f.name)}
                >
                  <span className="mono">{f.name}</span>
                  <Icon icon={faXmark} />
                </button>
              ))}
            </div>
          )}
          <input
            className="wiz-field-search"
            type="text"
            placeholder={browse === "useful" ? "Filter suggested..." : "Search attributes..."}
            value={q}
            onChange={(e) => setQ(e.target.value)}
          />
          <div className="wiz-attr-list">
            {catalog.map((f) => {
              const on = selected.has(f.name);
              const suggested = usefulNames.has(f.name);
              const color = accentForType(f.type, f.subType);
              const title = f.title && f.title.toLowerCase() !== f.name.toLowerCase() ? f.title : null;
              return (
                <button
                  type="button"
                  key={f.name}
                  className={`wiz-attr${on ? " on" : ""}`}
                  onClick={() => onToggle(f.name)}
                >
                  <span className={`wiz-attr-check${on ? " on" : ""}`} aria-hidden>
                    {on ? <Icon icon={faCheck} /> : null}
                  </span>
                  <span className="wiz-attr-copy">
                    <span className="wiz-attr-name">{f.name}</span>
                    {title && <span className="wiz-attr-title">{title}</span>}
                  </span>
                  <span className="wiz-attr-type" style={{ color }}>{typeLabel(f.type, f.subType)}</span>
                  {suggested ? (
                    <span className="wiz-attr-star" title="Suggested for this object">
                      <Icon icon={faStar} />
                    </span>
                  ) : (
                    <span className="wiz-attr-star empty" />
                  )}
                </button>
              );
            })}
            {catalog.length === 0 && <p className="wiz-hint" style={{ padding: 12 }}>No attributes match.</p>}
          </div>
        </>
      )}
    </div>
  );
}
