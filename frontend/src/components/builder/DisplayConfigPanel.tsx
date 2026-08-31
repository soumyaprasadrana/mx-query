/** Flatten nested related objects into result columns. */
import { useMemo, useState } from "react";
import { FieldInfo } from "../../types";
import { DisplaySpec } from "../../lib/schema";
import { fieldsForRelatedSelect, RelatedSelect } from "../../lib/displayConfig";
import { Icon, faPlus, faTrashCan, faTable } from "../Icon";

export default function DisplayConfigPanel({
  items,
  spec,
  childFieldsCache,
  onAdd,
  onRemove,
  onToggleField,
  onSetFields,
}: {
  items: RelatedSelect[];
  spec: DisplaySpec;
  childFieldsCache: Record<string, FieldInfo[]>;
  onAdd: (item: RelatedSelect) => void;
  onRemove: (key: string) => void;
  onToggleField: (key: string, field: string, on: boolean) => void;
  onSetFields: (key: string, fields: string[]) => void;
}) {
  const [picking, setPicking] = useState(false);
  const unused = items.filter((i) => !(i.key in spec));
  const added = useMemo(
    () => Object.keys(spec).map((key) => items.find((i) => i.key === key)).filter(Boolean) as RelatedSelect[],
    [spec, items],
  );

  return (
    <div className="panel-block display-config" data-tour="display" data-flight="display">
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>
          <Icon icon={faTable} /> Display config
        </label>
        <button
          type="button"
          className="ghost"
          disabled={unused.length === 0}
          onClick={() => setPicking((v) => !v)}
          title={unused.length ? "Add a related select as parent columns" : "Add a child relationship first"}
        >
          <Icon icon={faPlus} /> add
        </button>
      </div>
      <p className="muted display-config-blurb">
        Optional. Flatten a 1:1 hop onto parent columns (ASSET, then ASSET{" -> "}ACTIVEASSETMETER). Nested children of a flattened hop still show as child tables. Display only - the query is unchanged.
      </p>
      {picking && unused.length > 0 && (
        <ul className="display-config-pick">
          {unused.map((item) => (
            <li key={item.key}>
              <button
                type="button"
                className="display-config-pick-btn"
                onClick={() => {
                  onAdd(item);
                  setPicking(false);
                }}
              >
                <span className="mono">{item.path}</span>
                <span className="muted">
                  {item.selectAll ? `* on ${item.objectName}` : item.fieldList.join(", ") || "..."}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
      {added.length === 0 && !picking && (
        <p className="muted" style={{ margin: "8px 0 0" }}>
          Nothing flattened. Add a related select you expect to return one record.
        </p>
      )}
      {added.map((item) => {
        const options = fieldsForRelatedSelect(item, childFieldsCache);
        const checked = new Set((spec[item.key] ?? []).map((f) => f.toLowerCase()));
        const starOnly = item.selectAll && options.length === 0;
        return (
          <div key={item.key} className="display-config-card" data-tour="display-card">
            <div className="spread">
              <span className="mono">{item.path}</span>
              <button type="button" className="icon-btn" title="Remove" onClick={() => onRemove(item.key)}>
                <Icon icon={faTrashCan} />
              </button>
            </div>
            {starOnly ? (
              <p className="muted" style={{ margin: "8px 0 0" }}>
                This hop is <span className="mono">*</span>. Fields load from the related object - wait a moment, or open the child relationship first.
              </p>
            ) : (
              <>
                <div className="row" style={{ gap: 6, marginTop: 8 }}>
                  <button type="button" className="ghost" onClick={() => onSetFields(item.key, [...options])}>
                    all
                  </button>
                  <button type="button" className="ghost" onClick={() => onSetFields(item.key, [])}>
                    none
                  </button>
                  <span className="muted" style={{ fontSize: "0.72rem" }}>
                    {checked.size} / {options.length}
                  </span>
                </div>
                <ul className="display-config-fields">
                  {options.map((name) => {
                    const on = checked.has(name.toLowerCase());
                    return (
                      <li key={name}>
                        <label>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => onToggleField(item.key, name, e.target.checked)}
                          />
                          <span className="mono">{name}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        );
      })}
    </div>
  );
}
