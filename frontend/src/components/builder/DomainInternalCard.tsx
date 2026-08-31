/** Parent-level domaininternalwhere (synonym / internal value). */
import FieldPicker from "../FieldPicker";
import { DomainInternalClause, FieldInfo } from "../../types";
import { domainFields, serializeDomainInternal } from "../../lib/schema";
import { Icon, faPlus, faTrashCan } from "../Icon";

export default function DomainInternalCard({
  fields,
  clauses,
  onChange,
  disabled,
  tour,
}: {
  fields: FieldInfo[];
  clauses: DomainInternalClause[] | undefined;
  onChange: (next: DomainInternalClause[]) => void;
  disabled?: boolean;
  tour?: string;
}) {
  const domains = domainFields(fields);
  const list = clauses ?? [];
  const preview = serializeDomainInternal(list);

  return (
    <div className="panel-block" data-tour={tour}>
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>Domain internal where</label>
        <button
          type="button"
          className="ghost"
          disabled={disabled || domains.length === 0}
          onClick={() => onChange([...list, { field: domains[0]?.name ?? "", value: "" }])}
        >
          <Icon icon={faPlus} /> clause
        </button>
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>
        Sends <span className="mono">domaininternalwhere</span> - filters on internal/domain-coded values
        (often synonym domains like status), not the display label. Every attribute with a domain is listed
        because this catalog does not say synonym vs ALN vs numeric.
      </p>
      {domains.length === 0 && (
        <p className="muted" style={{ marginTop: 8 }}>No attributes with a domain on this object.</p>
      )}
      <div className="stack" style={{ marginTop: 8 }}>
        {list.map((c, i) => (
          <div key={i} className="where-row" style={{ gridTemplateColumns: "1fr 1fr auto" }}>
            <FieldPicker
              fields={domains.length ? domains : fields}
              value={c.field}
              disabled={disabled}
              onChange={(field) => onChange(list.map((x, j) => (j === i ? { ...x, field } : x)))}
            />
            <input
              className="mono"
              placeholder="internal value"
              value={c.value}
              disabled={disabled}
              onChange={(e) => onChange(list.map((x, j) => (j === i ? { ...x, value: e.target.value } : x)))}
            />
            <button type="button" className="icon-btn" onClick={() => onChange(list.filter((_, j) => j !== i))} title="Remove">
              <Icon icon={faTrashCan} />
            </button>
          </div>
        ))}
      </div>
      {preview && <p className="mono timeline-preview">{preview}</p>}
    </div>
  );
}
