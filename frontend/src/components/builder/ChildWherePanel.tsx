/** Child-row filters; ChildOptionSchema path/noLimit/searchTerms (MQB-004). */
import { useEffect, useMemo, useRef, useState } from "react";
import RelPicker, { RelJoinLine } from "../RelPicker";
import {
  ChildChain,
  ChildHop,
  ChildRel,
  FieldInfo,
} from "../../types";
import { emptyHop, fieldAllowsSearch, hopCanToggleRel, hopHasChildFilter, hopJoinClause, searchNamesFrom } from "../../lib/schema";
import FieldRow from "./FieldRow";
import WhereRow from "./WhereRow";
import OrModeToggle from "./OrModeToggle";
import TimelineCard from "./TimelineCard";
import DomainInternalCard from "./DomainInternalCard";
import ChildLimitField from "./ChildLimitField";
import { Icon, faAsterisk, faMagnifyingGlass, faPlus, faStar, faTrashCan, faXmark } from "../Icon";
import { mergeFieldNames, usefulOrFallback } from "../../lib/usefulFields";

export default function ChildWherePanel({
  primaryRels,
  chains,
  childFieldsCache,
  childFieldStatus,
  osChildObjects,
  relsByObject,
  intent,
  onAddChain,
  onChange,
  onRemove,
  onNeedRels,
  onNeedFields,
}: {
  primaryRels: ChildRel[];
  chains: ChildChain[];
  childFieldsCache: Record<string, FieldInfo[]>;
  childFieldStatus: Record<string, "loading" | "ready">;
  osChildObjects: Set<string>;
  relsByObject: Record<string, ChildRel[]>;
  intent?: string;
  onAddChain: () => void;
  onChange: (i: number, next: ChildChain) => void;
  onRemove: (i: number) => void;
  onNeedRels: (objectName: string) => void;
  onNeedFields: (objectName: string) => void;
}) {
  const listRef = useRef<HTMLDivElement>(null);
  const prevCount = useRef(chains.length);
  useEffect(() => {
    if (chains.length > prevCount.current) {
      const last = listRef.current?.querySelector<HTMLElement>(".child-block:last-of-type");
      last?.scrollIntoView({ behavior: "smooth", block: "end" });
    }
    prevCount.current = chains.length;
  }, [chains.length]);

  return (
    <div className="panel-block child-panel" data-flight="child" data-tour="child">
      <div className="child-panel-head">
        <div className="spread">
          <label className="lbl" style={{ marginBottom: 0 }}>Child options</label>
          <button className="ghost" onClick={onAddChain} disabled={primaryRels.length === 0}>
            <Icon icon={faPlus} /> relationship
          </button>
        </div>
        <p className="muted child-panel-hint">
          OS children omit <span className="mono">rel.</span> unless the object name matches the relationship.
          Each hop sends childOptions.limit (50 unless you change it).
        </p>
      </div>
      <div className="stack child-panel-list" ref={listRef}>
        {chains.map((c, i) => (
          <ChildBlock
            key={i}
            chain={c}
            tourId={i === 0 ? "child-added" : i === 1 ? "child-more" : undefined}
            primaryRels={primaryRels}
            childFieldsCache={childFieldsCache}
            childFieldStatus={childFieldStatus}
            osChildObjects={osChildObjects}
            relsByObject={relsByObject}
            intent={intent}
            onChange={(next) => onChange(i, next)}
            onRemove={() => onRemove(i)}
            onNeedRels={onNeedRels}
            onNeedFields={onNeedFields}
          />
        ))}
      </div>
    </div>
  );
}

function ChildBlock({
  chain,
  tourId,
  primaryRels,
  childFieldsCache,
  childFieldStatus,
  osChildObjects,
  relsByObject,
  intent,
  onChange,
  onRemove,
  onNeedRels,
  onNeedFields,
}: {
  chain: ChildChain;
  tourId?: string;
  primaryRels: ChildRel[];
  childFieldsCache: Record<string, FieldInfo[]>;
  childFieldStatus: Record<string, "loading" | "ready">;
  osChildObjects: Set<string>;
  relsByObject: Record<string, ChildRel[]>;
  intent?: string;
  onChange: (next: ChildChain) => void;
  onRemove: () => void;
  onNeedRels: (objectName: string) => void;
  onNeedFields: (objectName: string) => void;
}) {
  const [active, setActive] = useState(0);
  const hops = chain.hops;
  const hopIndex = Math.min(active, Math.max(0, hops.length - 1));
  const hop = hops[hopIndex];
  const leaf = hops[hops.length - 1];
  const hopRels = relsByObject[leaf?.objectName ?? ""] ?? [];
  const hopLoading = leaf?.objectName
    ? relsByObject[leaf.objectName] !== undefined && relsByObject[leaf.objectName].length === 0
    : false;

  useEffect(() => {
    if (active >= hops.length) setActive(Math.max(0, hops.length - 1));
  }, [active, hops.length]);

  useEffect(() => {
    if (!hop) return;
    onNeedFields(hop.objectName);
    onNeedRels(hop.objectName);
    onNeedRels(leaf?.objectName ?? hop.objectName);
  }, [hop, leaf, onNeedFields, onNeedRels]);

  if (!hop) return null;

  const key = hop.objectName.toUpperCase();
  const fields = childFieldsCache[key];
  const status = childFieldStatus[key];
  const inOs = osChildObjects.has(key);
  const loading = status === "loading";
  const pickerFields = fields && fields.length > 0 ? fields : null;
  const whereWithoutSelect = hopHasChildFilter(hop) && !hop.selectAll && hop.selected.length === 0;
  const marks = hops.filter((h) => h.conditions.some((c) => c.field) || !h.selectAll).length;

  function patchHop(i: number, patch: Partial<ChildHop>) {
    onChange({ hops: hops.map((h, idx) => (idx === i ? { ...h, ...patch } : h)) });
  }

  const canToggleRel = hops[0] ? hopCanToggleRel(hops[0], osChildObjects) : false;
  const useRel = hops[0]?.useRel === true;

  return (
    <div className="child-block" data-tour={tourId}>
      <div className="child-block-header">
        <RelPicker
          rels={primaryRels}
          value={hops[0]?.relationship ?? ""}
          onChange={(rel) => {
            onChange({ hops: [emptyHop(rel)] });
            setActive(0);
            onNeedFields(rel.objectName);
            onNeedRels(rel.objectName);
          }}
        />
        {canToggleRel && (
          <label
            className="child-rel-toggle"
            title="Object name matches the relationship, so select can use rel.NAME. Off by default."
          >
            <input
              type="checkbox"
              checked={useRel}
              onChange={(e) =>
                onChange({
                  hops: hops.map((h, idx) => (idx === 0 ? { ...h, useRel: e.target.checked } : h)),
                })
              }
            />
            rel.
          </label>
        )}
        {marks > 0 && <span className="badge count">{marks}</span>}
        <button type="button" className="icon-btn" onClick={onRemove} title="Remove child chain">
          <Icon icon={faTrashCan} />
        </button>
      </div>
      <div className="child-block-body">
        <div>
          <div className="spread">
            <label className="lbl" style={{ marginBottom: 0 }}>Path</label>
            <div style={{ minWidth: 200 }}>
              <RelPicker
                rels={hopRels}
                value=""
                loading={hopLoading}
                placeholder="+ hop from leaf"
                onChange={(rel) => {
                  onChange({ hops: [...hops, emptyHop(rel)] });
                  setActive(hops.length);
                  onNeedFields(rel.objectName);
                  onNeedRels(rel.objectName);
                }}
              />
            </div>
          </div>
          <div className="path-row" style={{ marginTop: 8 }} data-tour="child-path">
            {hops.map((h, hi) => (
              <span key={hi} style={{ display: "inline-flex", alignItems: "center" }}>
                {hi > 0 && <span className="path-line" />}
                <button
                  type="button"
                  className={`path-chip${hi === hopIndex ? " last" : ""}`}
                  data-tour={hi === hops.length - 1 && hi > 0 ? "child-hop-leaf" : undefined}
                  title={hopJoinClause(hops, hi, primaryRels, relsByObject) ?? undefined}
                  onClick={() => setActive(hi)}
                >
                  {h.relationship}
                  {(h.inOs || osChildObjects.has(h.objectName.toUpperCase())) && (
                    <span className="path-mark">os</span>
                  )}
                  {h.conditions.some((c) => c.field) && <span className="path-mark">w</span>}
                  {!h.selectAll && <span className="path-mark">s</span>}
                  {hi > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange({ hops: hops.slice(0, hi) });
                        setActive(hi - 1);
                      }}
                    >
                      x
                    </span>
                  )}
                </button>
              </span>
            ))}
          </div>
          {hops.map((h, hi) => (
            <RelJoinLine
              key={`join-${h.relationship}-${hi}`}
              clause={hopJoinClause(hops, hi, primaryRels, relsByObject)}
            />
          ))}
        </div>

        <ChildLimitField hop={hop} onChange={(patch) => patchHop(hopIndex, patch)} />

        <div>
          <div className="spread">
            <label className="lbl" style={{ marginBottom: 0 }}>
              Where on {hop.objectName}{inOs ? " (OS)" : " (object)"}
            </label>
            <button
              className="ghost"
              disabled={loading}
              onClick={() =>
                patchHop(hopIndex, {
                  conditions: [...hop.conditions, { field: fields?.[0]?.name ?? "", op: "=", value: "" }],
                })
              }
            >
              + condition
            </button>
          </div>
          <OrModeToggle
            checked={!!hop.opmodeor}
            onChange={(next) => patchHop(hopIndex, { opmodeor: next })}
            hint="This hop's childOptions - Maximo replaces AND with OR (opmodeor)."
          />
          {whereWithoutSelect && (
            <p className="warn-chip" style={{ marginTop: 8 }}>
              A child filter is set but this hop has no select - * will be sent so the filter applies.
            </p>
          )}
          {loading && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="spinner" /> <span className="muted">Loading {hop.objectName} fields...</span>
            </div>
          )}
          {status === "ready" && !pickerFields && (
            <p className="muted" style={{ margin: "6px 0 0" }}>No field list for {hop.objectName}. Type an attribute name.</p>
          )}
          <div className="stack" style={{ marginTop: 8 }}>
            {hop.conditions.map((cond, ci) => (
              <WhereRow
                key={ci}
                fields={pickerFields}
                cond={cond}
                onChange={(patch) =>
                  patchHop(hopIndex, {
                    conditions: hop.conditions.map((c, j) => (j === ci ? { ...c, ...patch } : c)),
                  })
                }
                onRemove={() =>
                  patchHop(hopIndex, { conditions: hop.conditions.filter((_, j) => j !== ci) })
                }
              />
            ))}
          </div>
        </div>

        <TimelineCard
          fields={fields ?? []}
          value={hop.timeline ?? null}
          onChange={(next) => patchHop(hopIndex, { timeline: next })}
        />
        <DomainInternalCard
          fields={fields ?? []}
          clauses={hop.domainInternal ?? []}
          onChange={(domainInternal) => patchHop(hopIndex, { domainInternal })}
        />

        <HopSelect
          hop={hop}
          fields={fields ?? []}
          loading={loading}
          inOs={inOs}
          warnStar={whereWithoutSelect}
          intent={intent}
          onPatch={(patch) => patchHop(hopIndex, patch)}
        />
      </div>
    </div>
  );
}

function HopSelect({
  hop,
  fields,
  loading,
  inOs,
  warnStar,
  intent,
  onPatch,
}: {
  hop: ChildHop;
  fields: FieldInfo[];
  loading: boolean;
  inOs: boolean;
  warnStar: boolean;
  intent?: string;
  onPatch: (patch: Partial<ChildHop>) => void;
}) {
  const [filter, setFilter] = useState("");
  const [browse, setBrowse] = useState<"useful" | "all">("useful");
  const useful = useMemo(() => usefulOrFallback(fields, intent ?? ""), [fields, intent]);
  const usefulNames = useMemo(() => new Set(useful.map((f) => f.name)), [useful]);
  const selected = new Set(hop.selected);
  const picked = useMemo(
    () => fields.filter((f) => selected.has(f.name)),
    [fields, hop.selected],
  );
  const visible = useMemo(() => {
    let list = browse === "useful" ? useful : fields;
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.title.toLowerCase().includes(q));
    }
    if (browse === "all") {
      list = [...list].sort((a, b) => {
        const ua = usefulNames.has(a.name) ? 0 : 1;
        const ub = usefulNames.has(b.name) ? 0 : 1;
        return ua - ub || a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [browse, useful, fields, filter, usefulNames]);

  function applyUseful() {
    const names = useful.map((f) => f.name);
    const next = hop.selectAll ? names : mergeFieldNames(hop.selected, names);
    onPatch({
      selectAll: false,
      selected: next,
      searchFields: searchNamesFrom(fields, hop.selectAll ? names : mergeFieldNames(hop.searchFields ?? hop.selected, names)),
    });
  }

  return (
    <div>
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>
          Select on {hop.objectName}{inOs ? " (OS)" : " (object)"}
        </label>
        <div className="row field-modes" style={{ gap: 6 }}>
          <button
            type="button"
            className={`ghost${hop.selectAll || warnStar ? " hop-on" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.68rem" }}
            onClick={() => onPatch({ selectAll: true, selected: [], searchFields: [], aliases: {} })}
            title="Every attribute"
          >
            <Icon icon={faAsterisk} /> *
          </button>
          <button
            type="button"
            className={`ghost${!hop.selectAll && browse === "useful" ? " on" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.68rem" }}
            title="Identity/status names plus words from the wizard intent. No Assist."
            onClick={() => {
              setBrowse("useful");
              applyUseful();
            }}
          >
            <Icon icon={faStar} /> suggested
          </button>
          <button
            type="button"
            className={`ghost${!hop.selectAll && browse === "all" ? " on" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.68rem" }}
            onClick={() => {
              setBrowse("all");
              if (hop.selectAll) onPatch({ selectAll: false, selected: [], searchFields: [], aliases: {} });
            }}
          >
            <Icon icon={faMagnifyingGlass} /> browse
          </button>
          <span className="badge count">{hop.selectAll || warnStar ? "*" : `${selected.size}`}</span>
        </div>
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>
        Search is on every hop as <span className="mono">{hop.relationship.toLowerCase()}.field</span> (never <span className="mono">rel.</span>).
        Object attributes only; YORN is omitted.
      </p>
      {!hop.selectAll && (
        <>
          {picked.length > 0 && (
            <div className="field-picked">
              {picked.map((f) => (
                <button
                  type="button"
                  key={`sel-${f.name}`}
                  className="field-picked-chip"
                  title={`Remove ${f.name}`}
                  onClick={() => {
                    const next = hop.selected.filter((n) => n !== f.name);
                    const nextSearch = searchNamesFrom(
                      fields,
                      (hop.searchFields ?? hop.selected).filter((n) => n !== f.name),
                    );
                    onPatch({ selectAll: false, selected: next, searchFields: nextSearch });
                  }}
                >
                  <span className="mono">{f.name}</span>
                  <Icon icon={faXmark} />
                </button>
              ))}
            </div>
          )}
          <input
            type="text"
            placeholder={browse === "useful" ? "Filter suggested..." : "Search fields..."}
            value={filter}
            onChange={(e) => setFilter(e.target.value)}
            style={{ margin: "8px 0 0" }}
          />
          <div className="field-list hop-fields">
            {loading && (
              <div className="row" style={{ padding: 8 }}>
                <span className="spinner" /> <span className="muted">Loading fields...</span>
              </div>
            )}
            {visible.map((f) => {
              const on = selected.has(f.name);
              return (
                <FieldRow
                  key={f.name}
                  field={f}
                  selected={on}
                  suggested={usefulNames.has(f.name)}
                  alias={hop.aliases?.[f.name]}
                  searchOn={on && fieldAllowsSearch(f, fields) && (hop.searchFields ?? hop.selected).includes(f.name)}
                  showAlias={on}
                  showSearch={on && fieldAllowsSearch(f, fields)}
                  onToggle={() => {
                    const next = new Set(selected);
                    const nextSearch = new Set(searchNamesFrom(fields, hop.searchFields ?? hop.selected));
                    if (next.has(f.name)) {
                      next.delete(f.name);
                      nextSearch.delete(f.name);
                    } else {
                      next.add(f.name);
                      if (fieldAllowsSearch(f, fields)) nextSearch.add(f.name);
                    }
                    onPatch({
                      selectAll: false,
                      selected: Array.from(next),
                      searchFields: Array.from(nextSearch),
                    });
                  }}
                  onAlias={(alias) => onPatch({ aliases: { ...(hop.aliases ?? {}), [f.name]: alias } })}
                  onSearch={(search) => {
                    if (search && !fieldAllowsSearch(f, fields)) return;
                    const nextSearch = new Set(searchNamesFrom(fields, hop.searchFields ?? hop.selected));
                    search ? nextSearch.add(f.name) : nextSearch.delete(f.name);
                    onPatch({ searchFields: Array.from(nextSearch) });
                  }}
                />
              );
            })}
            {!loading && visible.length === 0 && fields.length > 0 && (
              <span className="muted">No attributes match.</span>
            )}
          </div>
        </>
      )}
    </div>
  );
}
