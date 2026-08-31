/** Parent select list, useful-field chips, star/clear. */
import { useMemo, useState } from "react";
import { FieldInfo } from "../../types";
import FieldRow from "./FieldRow";
import { Icon, faAsterisk, faMagnifyingGlass, faStar, faXmark } from "../Icon";
import { usefulOrFallback } from "../../lib/usefulFields";
import { fieldAllowsSearch } from "../../lib/schema";

export default function FieldPanel({
  fields,
  selected,
  selectAll,
  loading,
  intent,
  aliases,
  searchOff,
  includeSearchTerms,
  includeSearchAttributes,
  onToggle,
  onSelectAll,
  onSelectNone,
  onSelectUseful,
  onAlias,
  onSearch,
  onIncludeSearchTerms,
  onIncludeSearchAttributes,
  extraSelect,
  onRemoveExtra,
}: {
  fields: FieldInfo[];
  selected: Set<string>;
  selectAll: boolean;
  loading: boolean;
  intent?: string;
  aliases: Record<string, string>;
  searchOff: Set<string>;
  includeSearchTerms: boolean;
  includeSearchAttributes: boolean;
  extraSelect: string[];
  onRemoveExtra: (token: string) => void;
  onToggle: (name: string) => void;
  onSelectAll: () => void;
  onSelectNone: () => void;
  onSelectUseful: () => void;
  onAlias: (name: string, alias: string) => void;
  onSearch: (name: string, on: boolean) => void;
  onIncludeSearchTerms: (on: boolean) => void;
  onIncludeSearchAttributes: (on: boolean) => void;
}) {
  const [filter, setFilter] = useState("");
  const [browse, setBrowse] = useState<"useful" | "all">("useful");
  const useful = useMemo(() => usefulOrFallback(fields, intent ?? ""), [fields, intent]);
  const usefulNames = useMemo(() => new Set(useful.map((f) => f.name)), [useful]);
  const picked = useMemo(
    () => fields.filter((f) => selected.has(f.name)),
    [fields, selected],
  );
  const visible = useMemo(() => {
    let list = browse === "useful" ? useful : fields;
    const q = filter.trim().toLowerCase();
    if (q) {
      list = list.filter((f) => f.name.toLowerCase().includes(q) || f.title.toLowerCase().includes(q));
    }
    if (browse === "all") {
      list = [...list].sort((a, b) => {
        const ua = usefulNames.has(a.name) ? 0 : 1;
        const ub = usefulNames.has(b.name) ? 0 : 1;
        return ua - ub || a.name.localeCompare(b.name);
      });
    }
    return list;
  }, [browse, useful, fields, filter, usefulNames]);

  return (
    <div className="panel-block" data-flight="fields" data-tour="fields">
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>Fields</label>
        <div className="row field-modes" style={{ gap: 6 }}>
          <button
            type="button"
            className={`ghost${selectAll ? " on" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.68rem" }}
            onClick={onSelectAll}
            title="Every attribute"
          >
            <Icon icon={faAsterisk} /> all
          </button>
          <button
            type="button"
            className={`ghost${!selectAll && browse === "useful" ? " on" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.68rem" }}
            title="Identity/status names plus words from the wizard intent. No Assist."
            onClick={() => {
              setBrowse("useful");
              onSelectUseful();
            }}
          >
            <Icon icon={faStar} /> suggested
          </button>
          <button
            type="button"
            className={`ghost${!selectAll && browse === "all" ? " on" : ""}`}
            style={{ padding: "2px 8px", fontSize: "0.68rem" }}
            onClick={() => setBrowse("all")}
          >
            <Icon icon={faMagnifyingGlass} /> browse
          </button>
          <button className="ghost" style={{ padding: "2px 8px", fontSize: "0.68rem" }} onClick={onSelectNone}>
            none
          </button>
          <span className="badge count">{selectAll ? `* / ${fields.length}` : `${selected.size} / ${fields.length}`}</span>
        </div>
      </div>
      {!selectAll && picked.length > 0 && (
        <div className="field-picked">
          {picked.map((f) => (
            <button
              type="button"
              key={`sel-${f.name}`}
              className="field-picked-chip"
              title={`Remove ${f.name}`}
              onClick={() => onToggle(f.name)}
            >
              <span className="mono">{f.name}</span>
              <Icon icon={faXmark} />
            </button>
          ))}
        </div>
      )}
      {fields.length > 6 && (
        <input
          type="text"
          placeholder={browse === "useful" ? "Filter suggested..." : "Search fields..."}
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{ margin: "8px 0" }}
        />
      )}
      <div className="field-list">
        {loading && (
          <div className="row" style={{ padding: 8 }}>
            <span className="spinner" /> <span className="muted">Loading schema...</span>
          </div>
        )}
        {!loading && fields.length === 0 && <span className="muted">No selectable fields resolved.</span>}
        {visible.map((f) => {
          const on = selectAll || selected.has(f.name);
          return (
            <FieldRow
              key={f.name}
              field={f}
              selected={on}
              suggested={usefulNames.has(f.name)}
              alias={aliases[f.name]}
              searchOn={on && !searchOff.has(f.name) && fieldAllowsSearch(f, fields)}
              showAlias={on && !selectAll}
              showSearch={on && fieldAllowsSearch(f, fields)}
              onToggle={() => onToggle(f.name)}
              onAlias={(alias) => onAlias(f.name, alias)}
              onSearch={(search) => onSearch(f.name, search)}
            />
          );
        })}
        {!loading && !selectAll && visible.length === 0 && fields.length > 0 && (
          <span className="muted">No attributes match.</span>
        )}
      </div>
      {extraSelect.length > 0 && (
        <div className="extra-select">
          <span className="muted">Leftover select (virtual attrs / nested rel. trees)</span>
          {extraSelect.map((token) => (
            <div key={token} className="extra-select-row" title={token}>
              <code>{token}</code>
              <button type="button" aria-label={`Remove ${token}`} onClick={() => onRemoveExtra(token)}>
                x
              </button>
            </div>
          ))}
        </div>
      )}
      <div className="search-call-toggles" data-tour="search-call">
        <label>
          <input type="checkbox" checked={includeSearchAttributes} onChange={(e) => onIncludeSearchAttributes(e.target.checked)} />
          put searchAttributes in the tool call
        </label>
        <label>
          <input type="checkbox" checked={includeSearchTerms} onChange={(e) => onIncludeSearchTerms(e.target.checked)} />
          put searchTerms in the tool call
        </label>
        <p className="muted" style={{ margin: "4px 0 0" }}>
          Search is object attributes only (not OS extras like <span className="mono">class_description</span>).
          YORN is omitted - a text search term would fail. Uncheck <span className="mono">search</span> on a row to drop it.
          Type the term in the results table filter. Uncheck a toggle to omit that key from the tool call.
        </p>
      </div>
    </div>
  );
}
