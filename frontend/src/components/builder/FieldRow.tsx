/** One selected field with type, search flag, and reorder handle. */
import { FieldInfo } from "../../types";
import { accentForType, typeLabel } from "../../lib/schema";
import { Icon, faStar } from "../Icon";

export default function FieldRow({
  field,
  selected,
  suggested,
  alias,
  searchOn,
  showAlias,
  showSearch,
  onToggle,
  onAlias,
  onSearch,
}: {
  field: FieldInfo;
  selected: boolean;
  suggested?: boolean;
  alias?: string;
  searchOn?: boolean;
  showAlias?: boolean;
  showSearch?: boolean;
  onToggle: () => void;
  onAlias?: (alias: string) => void;
  onSearch?: (on: boolean) => void;
}) {
  const color = accentForType(field.type, field.subType);
  const extras = selected && (showAlias || showSearch);

  return (
    <div className="field-row-wrap">
      <div className="field-row" role="button" tabIndex={0} onClick={onToggle} onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onToggle();
        }
      }}>
        <span className={`chk${selected ? " on" : ""}`} />
        <span className="type-dot" style={{ background: color }} />
        <span className="mono" style={{ flex: 1, minWidth: 0 }}>{field.name}</span>
        {suggested ? (
          <span className="field-star" title="Suggested for this object">
            <Icon icon={faStar} />
          </span>
        ) : null}
        <span className="type-badge" style={{ color, border: `1px solid ${color}33` }}>
          {typeLabel(field.type, field.subType)}
        </span>
      </div>
      {extras && (
        <div className="field-extras" onClick={(e) => e.stopPropagation()}>
          {showSearch && (
            <button
              type="button"
              className={`search-mini${searchOn ? " on" : ""}`}
              title="Include this field in searchAttributes (relationship.field, no rel.). YORN and OS-only extras are omitted."
              onClick={() => onSearch?.(!searchOn)}
            >
              <span className={`chk${searchOn ? " on" : ""}`} />
              search
            </button>
          )}
          {showAlias && (
            <label className="alias-slot">
              <span className="alias-kicker">as</span>
              <input
                type="text"
                className="alias-input"
                placeholder={field.name}
                value={alias ?? ""}
                onChange={(e) => onAlias?.(e.target.value)}
                title={`Result key becomes the alias. Select token: ${field.name}--${(alias ?? "").trim() || "alias"}`}
              />
            </label>
          )}
        </div>
      )}
    </div>
  );
}
