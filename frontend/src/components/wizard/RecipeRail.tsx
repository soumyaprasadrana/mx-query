/** Running log of wizard picks. */
import { draftToRelatedWhere, QueryDraft } from "../../lib/queryDraft";
import { hopHasChildFilter, normalizeRelatedHops, serializeDomainInternal, timelineReady, formatTlRange } from "../../lib/schema";
import { Icon, faFilter, faFolderTree, faLayerGroup, faListCheck } from "../Icon";

export default function RecipeRail({ draft }: { draft: QueryDraft }) {
  const os = draft.osHit?.osName;
  const where = draft.where.filter((c) => c.field);
  const related = draftToRelatedWhere(draft);
  const childFilters = draft.childChains.filter((c) =>
    c.hops.some((h) => hopHasChildFilter(h)),
  );
  const empty =
    !draft.intent &&
    draft.wantSaved == null &&
    !os &&
    !draft.savedQuery &&
    !draft.selectAll &&
    draft.selected.length === 0 &&
    draft.childRels.length === 0 &&
    draft.childChains.length === 0 &&
    where.length === 0 &&
    related.length === 0 &&
    !draft.relatedFilter &&
    !timelineReady(draft.timeline) &&
    !serializeDomainInternal(draft.domainInternal) &&
    draft.sortRules.length === 0 &&
    !draft.pageTouched;

  return (
    <aside className="wiz-rail">
      <p className="wiz-rail-kicker"><Icon icon={faListCheck} /> Recipe</p>
      {empty && (
        <p className="wiz-rail-empty">
          This is the running log of the query - intent, object structure, columns, related data, filters, sort, and page size - as you pick them.
        </p>
      )}
      {draft.intent && (
        <>
          <p className="wiz-rail-section">Intent</p>
          <div className="wiz-rail-intent">{draft.intent}</div>
        </>
      )}
      {draft.wantSaved === false && <span className="wiz-pill muted">from scratch</span>}
      {draft.wantSaved === true && !draft.savedQuery && <span className="wiz-pill muted">use a saved query</span>}
      {os && (
        <>
          <p className="wiz-rail-section"><Icon icon={faLayerGroup} /> Object structure</p>
          <div className="wiz-rail-os">{os}</div>
          {draft.osHit?.primaryObject && (
            <span className="wiz-pill muted">{draft.osHit.primaryObject}</span>
          )}
        </>
      )}
      {draft.savedQuery && <span className="wiz-pill">saved {draft.savedQuery}</span>}
      {(draft.selectAll || draft.selected.length > 0) && <p className="wiz-rail-section"><Icon icon={faListCheck} /> Columns</p>}
      {draft.selectAll && <span className="wiz-pill">select *</span>}
      {!draft.selectAll && draft.selected.slice(0, 8).map((n) => (
        <span key={n} className="wiz-pill">{n}</span>
      ))}
      {!draft.selectAll && draft.selected.length > 8 && (
        <span className="wiz-pill muted">+{draft.selected.length - 8} more</span>
      )}
      {draft.childChains.length > 0 && <p className="wiz-rail-section"><Icon icon={faFolderTree} /> Related rows</p>}
      {draft.childChains.map((c, i) => {
        const leaf = c.hops[c.hops.length - 1];
        const extra = leaf?.selectAll ? " *" : leaf?.selected.length ? ` ${leaf.selected.length} cols` : "";
        return (
          <span key={`${c.hops[0]?.relationship ?? i}`} className="wiz-pill kid">
            {c.hops.map((h) => h.relationship).join(" -> ")}{extra}
          </span>
        );
      })}
      {where.length > 0 && <p className="wiz-rail-section"><Icon icon={faFilter} /> Where</p>}
      {draft.orMode && (where.length > 0 || related.length > 0) && (
        <span className="wiz-pill">OR</span>
      )}
      {where.map((c, i) => (
        <span key={`w-${i}`} className="wiz-pill where">{c.field} {c.op} {c.value}</span>
      ))}
      {timelineReady(draft.timeline) && draft.timeline && (
        <span className="wiz-pill where">tl {formatTlRange(draft.timeline)} {draft.timeline.attribute}</span>
      )}
      {serializeDomainInternal(draft.domainInternal) && (
        <span className="wiz-pill where">domaininternalwhere</span>
      )}
      {related.length > 0 && <p className="wiz-rail-section">Related filter</p>}
      {related.map((f, i) => {
        const hops = normalizeRelatedHops(f);
        const bits = hops.flatMap((h) =>
          (h.conditions ?? []).filter((c) => c.field).map((c) => `${h.relationship}.${c.field} ${c.op} ${c.value}`),
        );
        return (
          <span key={`rel-${i}`} className="wiz-pill where">
            {hops.map((h) => h.relationship).join(" -> ")}
            {bits.length ? ` | ${bits.join(", ")}` : ""}
          </span>
        );
      })}
      {childFilters.length > 0 && <p className="wiz-rail-section">Child filters</p>}
      {childFilters.map((c) => (
        <span key={`cf-${c.hops[0]?.relationship}`} className="wiz-pill kid">
          {c.hops.map((h) => h.relationship).join(" -> ")}
          {c.hops.some((h) => h.opmodeor) ? " | OR" : ""}
        </span>
      ))}
      {draft.sortRules.length > 0 && <p className="wiz-rail-section">Sort</p>}
      {draft.sortRules.map((s) => (
        <span key={s.field} className="wiz-pill">{s.dir === "desc" ? "-" : "+"}{s.field}</span>
      ))}
      {Object.entries(draft.displaySpec ?? {}).some(([, f]) => f.length) && (
        <>
          <p className="wiz-rail-section">Display</p>
          {Object.entries(draft.displaySpec ?? {}).filter(([, f]) => f.length).map(([k, f]) => (
            <span key={k} className="wiz-pill">{k.replace(/\./g, " -> ")} | {f.length}</span>
          ))}
        </>
      )}
      {draft.pageTouched && (
        <>
          <p className="wiz-rail-section">Page</p>
          <span className="wiz-pill muted">{draft.pageSize} rows</span>
        </>
      )}
    </aside>
  );
}
