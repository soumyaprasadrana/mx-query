/** One WHERE clause: field, op, value. */
import { useEffect } from "react";
import FieldPicker from "../FieldPicker";
import MenuSelect from "../MenuSelect";
import { FieldInfo, OPS, WhereCondition, WhereOp } from "../../types";
import { DomainValue, dynPlaceholder } from "../../lib/schema";
import WhereValue from "./WhereValue";
import { Icon, faTrashCan } from "../Icon";

export default function WhereRow({
  fields,
  cond,
  disabled,
  domainValues,
  domainLoading,
  onChange,
  onRemove,
  onNeedDomain,
}: {
  fields: FieldInfo[] | null;
  cond: WhereCondition;
  disabled?: boolean;
  domainValues?: DomainValue[];
  domainLoading?: boolean;
  onChange: (patch: Partial<WhereCondition>) => void;
  onRemove: () => void;
  onNeedDomain?: (field: string) => void;
}) {
  const placeholder = dynPlaceholder(cond);
  const nullish = cond.op === "isnull" || cond.op === "isnotnull";
  const info = fields?.find((f) => f.name.toLowerCase() === cond.field.toLowerCase());

  useEffect(() => {
    if (!cond.field || !info?.domainId || !onNeedDomain) return;
    onNeedDomain(cond.field);
  }, [cond.field, info?.domainId, onNeedDomain]);

  return (
    <div className="where-row where-row-dyn" data-tour="where-added">
      {fields ? (
        <FieldPicker
          fields={fields}
          value={cond.field}
          disabled={disabled}
          onChange={(field) => onChange({ field })}
        />
      ) : (
        <input
          className="mono"
          placeholder="field"
          value={cond.field}
          disabled={disabled}
          onChange={(e) => onChange({ field: e.target.value })}
        />
      )}
      <MenuSelect
        value={cond.op}
        disabled={disabled}
        searchable={false}
        options={OPS.map((op) => ({ value: op, label: op }))}
        onChange={(op) => onChange({ op: op as WhereOp })}
      />
      {cond.isDynamic && !nullish ? (
        <code className="mono dyn-token">{placeholder}</code>
      ) : (
        <WhereValue
          field={info}
          op={cond.op}
          value={cond.value}
          disabled={disabled}
          domainValues={domainValues}
          domainLoading={domainLoading}
          onChange={(value) => onChange({ value })}
        />
      )}
      <label className="dyn-toggle" title="Replace this value with a template placeholder in the tool call">
        <input
          type="checkbox"
          checked={!!cond.isDynamic}
          disabled={disabled || nullish}
          onChange={() => {
            const on = !cond.isDynamic;
            onChange({
              isDynamic: on,
              dynamicPlaceholder: on ? placeholder : undefined,
            });
          }}
        />
        dyn
      </label>
      <button type="button" className="icon-btn" onClick={onRemove} disabled={disabled} title="Remove condition">
        <Icon icon={faTrashCan} />
      </button>
    </div>
  );
}
