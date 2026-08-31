/** Parent WHERE conditions. */
import { useEffect, useState } from "react";
import RelPicker, { RelJoinLine } from "../RelPicker";
import { ChildRel, FieldInfo, RelatedWhere, WhereCondition } from "../../types";
import { DomainValue, appendRelatedHop, emptyRelatedWhere, hopJoinClause, relatedCondsAt, setRelatedCondsAt, trimRelatedHops } from "../../lib/schema";
import WhereRow from "./WhereRow";
import OrModeToggle from "./OrModeToggle";
import { Icon, faPlus, faTrashCan } from "../Icon";

export default function WherePanel({
  fields,
  where,
  disabled,
  related,
  primaryRels,
  childFieldsCache,
  childFieldStatus,
  relsByObject,
  onAdd,
  onUpdate,
  onRemove,
  onAddRelated,
  onChangeRelated,
  onRemoveRelated,
  onNeedRels,
  onNeedFields,
  onNeedDomain,
  domainByField,
  domainLoading,
  orMode,
  onOrMode,
}: {
  fields: FieldInfo[];
  where: WhereCondition[];
  disabled?: boolean;
  related: RelatedWhere[];
  primaryRels: ChildRel[];
  childFieldsCache: Record<string, FieldInfo[]>;
  childFieldStatus: Record<string, "loading" | "ready">;
  relsByObject: Record<string, ChildRel[]>;
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<WhereCondition>) => void;
  onRemove: (i: number) => void;
  onAddRelated: () => void;
  onChangeRelated: (i: number, next: RelatedWhere) => void;
  onRemoveRelated: (i: number) => void;
  onNeedRels: (objectName: string) => void;
  onNeedFields: (objectName: string) => void;
  onNeedDomain?: (field: string) => void;
  domainByField?: Record<string, DomainValue[]>;
  domainLoading?: Record<string, boolean>;
  orMode: boolean;
  onOrMode: (next: boolean) => void;
}) {
  return (
    <div className="panel-block" data-flight="where" data-tour="where">
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>Where</label>
        <button className="ghost" onClick={onAdd} disabled={disabled}>
          <Icon icon={faPlus} /> condition
        </button>
      </div>
      <OrModeToggle
        checked={orMode}
        disabled={disabled}
        onChange={onOrMode}
        hint="Parent oslc.where - Maximo replaces AND with OR (orMode)."
      />
      {disabled && <p className="warn-chip" style={{ marginTop: 8 }}>WHERE is bypassed while a saved query is active</p>}
      <div className="stack" style={{ marginTop: 8 }}>
        {where.map((c, i) => (
          <WhereRow
            key={i}
            fields={fields}
            cond={c}
            disabled={disabled}
            domainValues={domainByField?.[c.field.toLowerCase()]}
            domainLoading={domainLoading?.[c.field.toLowerCase()]}
            onNeedDomain={onNeedDomain}
            onChange={(patch) => onUpdate(i, patch)}
            onRemove={() => onRemove(i)}
          />
        ))}
      </div>

      <div className="spread" style={{ marginTop: 16 }}>
        <label className="lbl" style={{ marginBottom: 0 }}>Filter parents by related</label>
        <button className="ghost" onClick={onAddRelated} disabled={disabled || primaryRels.length === 0}>
          <Icon icon={faPlus} /> related
        </button>
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>
        EXISTS through the hop chain, e.g. assetsite.organization.orgid = EAGLENA. Does not load those children.
        Tap a hop to set WHERE on that object - same as child options.
        Match any (OR) above applies here too - these land in the parent where.
      </p>
      <div className="stack" style={{ marginTop: 8 }}>
        {related.map((f, i) => (
          <RelatedFilter
            key={i}
            filter={f}
            disabled={disabled}
            primaryRels={primaryRels}
            childFieldsCache={childFieldsCache}
            childFieldStatus={childFieldStatus}
            relsByObject={relsByObject}
            onChange={(next) => onChangeRelated(i, next)}
            onRemove={() => onRemoveRelated(i)}
            onNeedRels={onNeedRels}
            onNeedFields={onNeedFields}
          />
        ))}
      </div>
    </div>
  );
}

function RelatedFilter({
  filter,
  disabled,
  primaryRels,
  childFieldsCache,
  childFieldStatus,
  relsByObject,
  onChange,
  onRemove,
  onNeedRels,
  onNeedFields,
}: {
  filter: RelatedWhere;
  disabled?: boolean;
  primaryRels: ChildRel[];
  childFieldsCache: Record<string, FieldInfo[]>;
  childFieldStatus: Record<string, "loading" | "ready">;
  relsByObject: Record<string, ChildRel[]>;
  onChange: (next: RelatedWhere) => void;
  onRemove: () => void;
  onNeedRels: (objectName: string) => void;
  onNeedFields: (objectName: string) => void;
}) {
  const hops = filter.hops;
  const [active, setActive] = useState(Math.max(0, hops.length - 1));
  const hopIndex = Math.min(active, Math.max(0, hops.length - 1));
  const hop = hops[hopIndex];
  const leaf = hops[hops.length - 1];
  const hopRels = leaf ? relsByObject[leaf.objectName] ?? [] : [];
  const hopLoading = leaf?.objectName
    ? relsByObject[leaf.objectName] !== undefined && relsByObject[leaf.objectName].length === 0
    : false;
  const key = (hop?.objectName ?? "").toUpperCase();
  const fields = childFieldsCache[key];
  const status = childFieldStatus[key];
  const loading = status === "loading";
  const pickerFields = fields && fields.length > 0 ? fields : null;
  const preview = hops.map((h) => h.relationship.toLowerCase()).filter(Boolean).join(".");
  const conds = hop ? relatedCondsAt(filter, hopIndex) : [];

  useEffect(() => {
    if (active >= hops.length) setActive(Math.max(0, hops.length - 1));
  }, [active, hops.length]);

  useEffect(() => {
    if (!hop?.objectName) return;
    onNeedFields(hop.objectName);
    onNeedRels(hop.objectName);
    if (leaf?.objectName) onNeedRels(leaf.objectName);
  }, [hop?.objectName, leaf?.objectName, onNeedFields, onNeedRels]);

  function patchConds(next: WhereCondition[]) {
    onChange(setRelatedCondsAt(filter, hopIndex, next));
  }

  return (
    <div className="child-block">
      <div className="child-block-header">
        <RelPicker
          rels={primaryRels}
          value={hops[0]?.relationship ?? ""}
          onChange={(rel) => {
            onChange(emptyRelatedWhere(rel));
            setActive(0);
            onNeedFields(rel.objectName);
            onNeedRels(rel.objectName);
          }}
        />
        {preview && <span className="muted mono" style={{ fontSize: "0.68rem" }}>{preview}.*</span>}
        <button type="button" className="icon-btn" onClick={onRemove} disabled={disabled} title="Remove related filter">
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
                  onChange(appendRelatedHop(filter, rel));
                  setActive(hops.length);
                  onNeedFields(rel.objectName);
                  onNeedRels(rel.objectName);
                }}
              />
            </div>
          </div>
          <div className="path-row" style={{ marginTop: 8 }}>
            {hops.map((h, hi) => (
              <span key={hi} style={{ display: "inline-flex", alignItems: "center" }}>
                {hi > 0 && <span className="path-line" />}
                <button
                  type="button"
                  className={`path-chip${hi === hopIndex ? " last" : ""}`}
                  title={[
                    hopJoinClause(hops, hi, primaryRels, relsByObject),
                    `Click to set WHERE on ${h.objectName}`,
                  ].filter(Boolean).join(" - ")}
                  onClick={() => setActive(hi)}
                >
                  {h.relationship}
                  {relatedCondsAt(filter, hi).some((c) => c.field) && <span className="path-mark">w</span>}
                  {hi > 0 && (
                    <span
                      role="button"
                      tabIndex={0}
                      onClick={(e) => {
                        e.stopPropagation();
                        onChange(trimRelatedHops(filter, hi));
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
        <div>
          <div className="spread">
            <label className="lbl" style={{ marginBottom: 0 }}>
              On {hop?.objectName || "..."}
            </label>
            <button
              className="ghost"
              disabled={disabled || loading || !hop}
              onClick={() =>
                patchConds([...conds, { field: fields?.[0]?.name ?? "", op: "=", value: "" }])
              }
            >
              + condition
            </button>
          </div>
          {loading && (
            <div className="row" style={{ marginTop: 8 }}>
              <span className="spinner" /> <span className="muted">Loading fields...</span>
            </div>
          )}
          <div className="stack" style={{ marginTop: 8 }}>
            {conds.map((cond, ci) => (
              <WhereRow
                key={ci}
                fields={pickerFields}
                cond={cond}
                disabled={disabled}
                onChange={(patch) =>
                  patchConds(conds.map((c, j) => (j === ci ? { ...c, ...patch } : c)))
                }
                onRemove={() => patchConds(conds.filter((_, j) => j !== ci))}
              />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
