/** Saved-query template slots filled at execute time. */
import { DynSlot } from "../../lib/schema";

export default function DynamicValuesPanel({
  slots,
  values,
  onChange,
}: {
  slots: DynSlot[];
  values: Record<string, string>;
  onChange: (vals: Record<string, string>) => void;
}) {
  if (slots.length === 0) return null;
  const filled = slots.filter((s) => values[s.key]).length;

  return (
    <div className="panel-block" style={{ borderColor: filled === slots.length ? "rgba(16,185,129,0.35)" : "rgba(139,92,246,0.35)" }}>
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>Template values</label>
        <span className="muted">{filled}/{slots.length} filled</span>
      </div>
      <p className="muted" style={{ margin: "6px 0 0" }}>
        Used when executing. The Dynamic tab on the tool call keeps the placeholders.
      </p>
      <div className="stack" style={{ marginTop: 8 }}>
        {slots.map((s) => (
          <div key={s.key} className="where-row" style={{ gridTemplateColumns: "auto 1fr auto" }}>
            <code className="mono dyn-token">{s.placeholder}</code>
            <input
              type="text"
              value={values[s.key] ?? ""}
              placeholder={`Test value (${s.source})`}
              onChange={(e) => onChange({ ...values, [s.key]: e.target.value })}
            />
            <span className="muted" style={{ fontSize: "0.65rem" }}>{s.source}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
