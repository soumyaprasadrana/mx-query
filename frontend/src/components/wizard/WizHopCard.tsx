/** One hop in a child or related trail. */
import { ChildHop, RelatedWhere, WhereCondition } from "../../types";
import { normalizeRelatedHops } from "../../lib/schema";

export type HopSummaryBit = {
  relationship: string;
  objectName: string;
  whereClause?: string | null;
  selectAll?: boolean;
  selected?: string[];
  conditions?: WhereCondition[];
};

export function hopsFromChain(hops: ChildHop[]): HopSummaryBit[] {
  return hops.map((h) => ({
    relationship: h.relationship,
    objectName: h.objectName,
    whereClause: h.whereClause,
    selectAll: h.selectAll,
    selected: h.selected,
    conditions: h.conditions,
  }));
}

export function hopsFromRelated(filter: RelatedWhere): HopSummaryBit[] {
  return normalizeRelatedHops(filter).map((h) => ({
    relationship: h.relationship,
    objectName: h.objectName,
    whereClause: h.whereClause,
    conditions: h.conditions,
  }));
}

export default function WizHopCard({
  purpose,
  hops,
}: {
  purpose: string;
  hops: HopSummaryBit[];
}) {
  if (!hops.length) return null;
  return (
    <div className="wiz-hop-card">
      <p className="wiz-hop-card-kicker">Configured so far</p>
      <p className="wiz-hop-card-purpose">{purpose}</p>
      <p className="wiz-hop-card-path mono">{hops.map((h) => h.relationship).join(" -> ")}</p>
      <ol className="wiz-hop-card-list">
        {hops.map((h, i) => {
          const cols = h.selectAll ? "*" : (h.selected ?? []).join(", ");
          const conds = (h.conditions ?? []).filter((c) => c.field);
          return (
            <li key={`${h.relationship}-${h.objectName}-${i}`}>
              <div className="wiz-hop-card-head">
                <span className="mono">{h.relationship}</span>
                <span className="muted">{h.objectName}</span>
              </div>
              {h.whereClause ? (
                <p className="wiz-hop-card-join">
                  <span className="wiz-hop-card-label">Join</span>
                  <code>{h.whereClause}</code>
                </p>
              ) : null}
              {cols ? (
                <p className="wiz-hop-card-meta">
                  <span className="wiz-hop-card-label">Columns</span>
                  {cols}
                </p>
              ) : null}
              {conds.length > 0 && (
                <p className="wiz-hop-card-meta">
                  <span className="wiz-hop-card-label">Where</span>
                  {conds.map((c) => `${c.field} ${c.op} ${c.value}`).join(", ")}
                </p>
              )}
            </li>
          );
        })}
      </ol>
    </div>
  );
}
