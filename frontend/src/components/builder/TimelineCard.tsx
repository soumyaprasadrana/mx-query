/** Relative date window (e.g. -3M on changedate). */
import FieldPicker from "../FieldPicker";
import MenuSelect from "../MenuSelect";
import { FieldInfo, TimelineQuery, TimelineSign, TimelineUnit } from "../../types";
import {
  TL_UNITS,
  dateTimeFields,
  emptyTimeline,
  formatTlAttribute,
  formatTlRange,
  timelineReady,
} from "../../lib/schema";

export default function TimelineCard({
  fields,
  value,
  onChange,
  disabled,
  tour,
}: {
  fields: FieldInfo[];
  value: TimelineQuery | null | undefined;
  onChange: (next: TimelineQuery | null) => void;
  disabled?: boolean;
  tour?: string;
}) {
  const dates = dateTimeFields(fields);
  const on = !!value;
  const tl = value ?? emptyTimeline(fields);
  const ready = timelineReady(value);
  const pool = dates.length ? dates : fields;

  return (
    <div className="panel-block timeline-card" data-tour={tour}>
      <label className="or-mode-toggle">
        <input
          type="checkbox"
          checked={on}
          disabled={disabled || pool.length === 0}
          onChange={(e) => onChange(e.target.checked ? emptyTimeline(fields) : null)}
        />
        <span>
          <span className="or-mode-label">Timeline range</span>
          <span className="muted">
            DATE / DATETIME only. Sends <span className="mono">tlrange</span> and{" "}
            <span className="mono">tlattribute</span> together - e.g. last 3 months on reportdate.
            Units are case-sensitive (<span className="mono">M</span> months != <span className="mono">m</span> minutes).
          </span>
        </span>
      </label>
      {on && (
        <div className="timeline-body">
          <div className="timeline-row">
            <MenuSelect
              value={tl.sign}
              disabled={disabled}
              searchable={false}
              options={[
                { value: "-", label: "Past (-)" },
                { value: "+", label: "Future (+)" },
                { value: "+-", label: "Around now (+/-)" },
              ]}
              onChange={(sign) => onChange({ ...tl, sign: sign as TimelineSign })}
            />
            <input
              type="number"
              min={1}
              value={tl.amount || ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...tl, amount: Number(e.target.value) || 0 })}
            />
            <MenuSelect
              value={tl.unit}
              disabled={disabled}
              searchable={false}
              options={TL_UNITS.map((u) => ({ value: u.unit, label: u.label }))}
              onChange={(unit) => onChange({ ...tl, unit: unit as TimelineUnit })}
            />
          </div>
          <div className="timeline-row">
            <span className="muted" style={{ alignSelf: "center" }}>on</span>
            <FieldPicker
              fields={pool}
              value={tl.attribute}
              disabled={disabled}
              onChange={(attribute) => onChange({ ...tl, attribute })}
            />
          </div>
          <label className="timeline-index">
            <span className="muted">Index date (optional - default is now)</span>
            <input
              type="date"
              value={tl.indexDate ?? ""}
              disabled={disabled}
              onChange={(e) => onChange({ ...tl, indexDate: e.target.value || undefined })}
            />
          </label>
          {dates.length === 0 && (
            <p className="muted">No DATE/DATETIME attributes loaded - pick any field, or wait for the catalog.</p>
          )}
          {ready ? (
            <p className="mono timeline-preview">
              tlrange={formatTlRange(tl)} | tlattribute={formatTlAttribute(tl)}
            </p>
          ) : (
            <p className="warn-chip">Need a positive range and a date field - Maximo requires both together.</p>
          )}
        </div>
      )}
    </div>
  );
}
