/** Value input that swaps control by attribute type / domain. */
import { ReactNode } from "react";
import { FieldInfo, WhereOp } from "../../types";
import { DomainValue, maxTypeOf } from "../../lib/schema";
import MenuSelect from "../MenuSelect";

function Box({ children }: { children: ReactNode }) {
  return <div className="where-value">{children}</div>;
}

function toDateInput(value: string): string {
  const m = value.match(/^(\d{4}-\d{2}-\d{2})/);
  return m ? m[1] : value;
}

function toDateTimeLocal(value: string): string {
  if (!value) return "";
  const m = value.match(/^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})/);
  if (m) return `${m[1]}T${m[2]}`;
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${value}T00:00`;
  return value;
}

function toTimeInput(value: string): string {
  const m = value.match(/(\d{2}:\d{2})/);
  return m ? m[1] : value;
}

export default function WhereValue({
  field,
  op,
  value,
  disabled,
  domainValues,
  domainLoading,
  onChange,
}: {
  field?: FieldInfo;
  op: WhereOp;
  value: string;
  disabled?: boolean;
  domainValues?: DomainValue[];
  domainLoading?: boolean;
  onChange: (value: string) => void;
}) {
  const mt = maxTypeOf(field);
  const listId = field ? `dom-${field.name}` : undefined;

  if (op === "isnull" || op === "isnotnull") {
    return <Box><span className="muted" style={{ fontSize: "0.72rem" }}>-</span></Box>;
  }

  if (op === "in" || op === "like") {
    return (
      <Box>
        <input
          type="text"
          className={mt === "UPPER" ? "where-upper" : mt === "LOWER" ? "where-lower" : undefined}
          value={value}
          disabled={disabled}
          placeholder={op === "in" ? "a, b, c" : "pattern"}
          onChange={(e) => onChange(coerce(mt, e.target.value))}
        />
      </Box>
    );
  }

  if (domainValues && domainValues.length > 0) {
    return (
      <Box>
        <input
          type="text"
          list={listId}
          value={value}
          disabled={disabled}
          placeholder={domainLoading ? "loading domain..." : "value or pick..."}
          onChange={(e) => onChange(e.target.value)}
        />
        <datalist id={listId}>
          {domainValues.map((v) => (
            <option key={v.value} value={v.value}>
              {v.description && v.description !== String(v.value) ? v.description : v.value}
            </option>
          ))}
        </datalist>
      </Box>
    );
  }

  if (mt === "YORN") {
    return (
      <Box>
        <MenuSelect
          value={value}
          disabled={disabled}
          searchable={false}
          placeholder="-"
          options={[
            { value: "", label: "-" },
            { value: "1", label: "Yes (1)" },
            { value: "0", label: "No (0)" },
          ]}
          onChange={onChange}
        />
      </Box>
    );
  }

  if (mt === "DATE") {
    return (
      <Box>
        <input type="date" value={toDateInput(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Box>
    );
  }

  if (mt === "DATETIME") {
    return (
      <Box>
        <input
          type="datetime-local"
          value={toDateTimeLocal(value)}
          disabled={disabled}
          onChange={(e) => onChange(e.target.value.length === 16 ? `${e.target.value}:00` : e.target.value)}
        />
      </Box>
    );
  }

  if (mt === "TIME") {
    return (
      <Box>
        <input type="time" value={toTimeInput(value)} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Box>
    );
  }

  if (mt === "INTEGER" || mt === "SMALLINT" || mt === "BIGINT") {
    return (
      <Box>
        <input type="number" step={1} value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Box>
    );
  }

  if (mt === "DECIMAL" || mt === "FLOAT" || mt === "AMOUNT" || mt === "DURATION") {
    return (
      <Box>
        <input type="number" step="any" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value)} />
      </Box>
    );
  }

  return (
    <Box>
      <input
        type="text"
        className={mt === "UPPER" ? "where-upper" : mt === "LOWER" ? "where-lower" : undefined}
        value={value}
        disabled={disabled || domainLoading}
        placeholder={domainLoading ? "loading domain..." : mt === "LONGALN" ? "text..." : undefined}
        onChange={(e) => onChange(coerce(mt, e.target.value))}
      />
    </Box>
  );
}

function coerce(mt: string, raw: string): string {
  if (mt === "UPPER") return raw.toUpperCase();
  if (mt === "LOWER") return raw.toLowerCase();
  return raw;
}
