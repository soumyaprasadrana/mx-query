/** WHERE condition list reused on parent, related, and child filters. */
import { FieldInfo, WhereCondition } from "../../types";
import { DomainValue } from "../../lib/schema";
import WhereRow from "../builder/WhereRow";
import OrModeToggle from "../builder/OrModeToggle";
import { Icon, faPlus } from "../Icon";

export default function WizCondList({
  label,
  fields,
  conds,
  onChange,
  onNeedDomain,
  domainByField,
  domainLoading,
  orMode,
  onOrMode,
  orModeHint,
}: {
  label?: string;
  fields: FieldInfo[];
  conds: WhereCondition[];
  onChange: (c: WhereCondition[]) => void;
  onNeedDomain?: (field: string) => void;
  domainByField?: Record<string, DomainValue[]>;
  domainLoading?: Record<string, boolean>;
  orMode?: boolean;
  onOrMode?: (next: boolean) => void;
  orModeHint?: string;
}) {
  const list = conds.length ? conds : [];
  return (
    <div className="wiz-conds">
      {label && <p className="wiz-hint">{label}</p>}
      {onOrMode && (
        <OrModeToggle
          checked={!!orMode}
          onChange={onOrMode}
          hint={orModeHint}
        />
      )}
      <div className="stack">
        {list.map((c, i) => (
          <WhereRow
            key={i}
            fields={fields}
            cond={c}
            domainValues={onNeedDomain ? domainByField?.[c.field.toLowerCase()] : undefined}
            domainLoading={onNeedDomain ? domainLoading?.[c.field.toLowerCase()] : undefined}
            onNeedDomain={onNeedDomain}
            onChange={(patch) => onChange(list.map((x, j) => (j === i ? { ...x, ...patch } : x)))}
            onRemove={() => onChange(list.filter((_, j) => j !== i))}
          />
        ))}
      </div>
      <button
        type="button"
        className="ghost"
        style={{ marginTop: 8 }}
        onClick={() => onChange([...list, { field: fields[0]?.name ?? "", op: "=", value: "" }])}
      >
        <Icon icon={faPlus} /> condition
      </button>
    </div>
  );
}
