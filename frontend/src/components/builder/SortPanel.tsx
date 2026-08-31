/** Order-by rules for os_query_builder. */
import { FieldInfo, SortRule } from "../../types";
import { Icon, faPlus, faTrashCan } from "../Icon";
import MenuSelect from "../MenuSelect";

export default function SortPanel({
  fields,
  rules,
  onAdd,
  onUpdate,
  onRemove,
}: {
  fields: FieldInfo[];
  rules: SortRule[];
  onAdd: () => void;
  onUpdate: (i: number, patch: Partial<SortRule>) => void;
  onRemove: (i: number) => void;
}) {
  return (
    <div className="panel-block" data-flight="sort" data-tour="sort">
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>Sort</label>
        <button className="ghost" onClick={onAdd} disabled={rules.length >= fields.length || fields.length === 0}>
          <Icon icon={faPlus} /> sort field
        </button>
      </div>
      <div className="stack" style={{ marginTop: 8 }}>
        {rules.map((s, i) => (
          <div key={i} className="where-row" style={{ gridTemplateColumns: "minmax(0, 1fr) 90px auto" }} data-tour="sort-added">
            <MenuSelect
              value={s.field}
              searchable
              options={fields.map((f) => ({ value: f.name, label: f.name, hint: f.title || undefined }))}
              onChange={(field) => onUpdate(i, { field })}
            />
            <button className="secondary" onClick={() => onUpdate(i, { dir: s.dir === "asc" ? "desc" : "asc" })}>
              {s.dir === "asc" ? "Asc" : "Desc"}
            </button>
            <button type="button" className="icon-btn" onClick={() => onRemove(i)} title="Remove sort">
              <Icon icon={faTrashCan} />
            </button>
          </div>
        ))}
        {rules.length === 0 && <span className="muted">Unsorted (server default)</span>}
      </div>
    </div>
  );
}
