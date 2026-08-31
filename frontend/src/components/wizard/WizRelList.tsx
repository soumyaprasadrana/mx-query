/** Relationship list with Assist chips. */
import { useMemo, useState } from "react";
import { ChildRel } from "../../types";

export default function WizRelList({
  rels,
  selected,
  onToggle,
  maxHeight = 280,
}: {
  rels: ChildRel[];
  selected: Set<string> | string | null;
  onToggle: (rel: ChildRel) => void;
  maxHeight?: number;
}) {
  const [q, setQ] = useState("");
  const selectedSet = useMemo(() => {
    if (selected instanceof Set) return selected;
    if (typeof selected === "string" && selected) return new Set([selected]);
    return new Set<string>();
  }, [selected]);

  const selectedRels = useMemo(
    () => rels.filter((r) => selectedSet.has(r.relation)),
    [rels, selectedSet],
  );

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
    const unselected = list.filter((r) => !selectedSet.has(r.relation));
    const os = unselected.filter((r) => r.inOs);
    const rest = unselected.filter((r) => !r.inOs);
    os.sort((a, b) => a.relation.localeCompare(b.relation));
    rest.sort((a, b) => a.relation.localeCompare(b.relation));
    return { os, rest };
  }, [rels, q, selectedSet]);

  function isOn(rel: ChildRel) {
    return selectedSet.has(rel.relation);
  }

  return (
    <div className="wiz-rel-box">
      <input
        className="wiz-field-search"
        type="text"
        placeholder="Search relationships..."
        value={q}
        onChange={(e) => setQ(e.target.value)}
      />
      <div className="wiz-rel-list" style={{ maxHeight }}>
        {selectedRels.length > 0 && (
          <div className="wiz-rel-pinned">
            <p className="wiz-rel-section">Selected</p>
            {selectedRels.map((r) => (
              <RelRow key={`sel-${r.relation}`} rel={r} on={isOn(r)} onToggle={onToggle} os={r.inOs} />
            ))}
          </div>
        )}
        {filtered.os.length > 0 && (
          <>
            <p className="wiz-rel-section">OS children</p>
            {filtered.os.map((r) => (
              <RelRow key={`os-${r.relation}`} rel={r} on={isOn(r)} onToggle={onToggle} os />
            ))}
          </>
        )}
        {filtered.rest.length > 0 && (
          <>
            <p className="wiz-rel-section">Relationships</p>
            {filtered.rest.map((r) => (
              <RelRow key={r.relation} rel={r} on={isOn(r)} onToggle={onToggle} />
            ))}
          </>
        )}
        {selectedRels.length === 0 && filtered.os.length === 0 && filtered.rest.length === 0 && (
          <p className="wiz-hint">No relationships match.</p>
        )}
      </div>
    </div>
  );
}

function RelRow({
  rel,
  on,
  onToggle,
  os,
}: {
  rel: ChildRel;
  on: boolean;
  onToggle: (rel: ChildRel) => void;
  os?: boolean;
}) {
  return (
    <button
      type="button"
      className={`wiz-rel-row${on ? " on" : ""}`}
      onClick={() => onToggle(rel)}
    >
      <span className="wiz-rel-row-top">
        <span className="mono">{rel.relation}</span>
        <span className="muted">{rel.objectName}</span>
        {rel.inheritedFrom && <span className="badge count">{rel.inheritedFrom}</span>}
        {os && <span className="badge count">OS</span>}
      </span>
      {on && rel.whereClause && (
        <span className="wiz-rel-join">
          <span className="wiz-rel-join-label">Join</span>
          <code>{rel.whereClause}</code>
        </span>
      )}
    </button>
  );
}
