/** Nested fetch cap on a child hop (childOptions.limit / noLimit). */
import { ChildHop } from "../../types";
import { childLimitOf, DEFAULT_CHILD_LIMIT } from "../../lib/schema";

export default function ChildLimitField({
  hop,
  onChange,
}: {
  hop: Pick<ChildHop, "limit" | "noLimit">;
  onChange: (patch: Pick<ChildHop, "limit" | "noLimit">) => void;
}) {
  const cap = hop.noLimit;
  return (
    <div className="child-limit-row">
      <div className="child-limit-field">
        <span className="child-limit-prefix">Limit</span>
        <input
          type="number"
          min={1}
          disabled={!!cap}
          aria-label="Nested row limit"
          value={cap ? "" : childLimitOf(hop)}
          placeholder={String(DEFAULT_CHILD_LIMIT)}
          onChange={(e) => {
            const n = Number(e.target.value);
            onChange({
              noLimit: false,
              limit: Number.isFinite(n) && n > 0 ? Math.floor(n) : DEFAULT_CHILD_LIMIT,
            });
          }}
        />
      </div>
      <label className={`child-limit-nocap${cap ? " on" : ""}`}>
        <input
          type="checkbox"
          checked={!!cap}
          onChange={(e) => onChange({ noLimit: e.target.checked, limit: childLimitOf(hop) })}
        />
        No cap
      </label>
      <p className="muted child-limit-hint">
        Nested rows for this hop. Default 50 unless you change it.
      </p>
    </div>
  );
}
