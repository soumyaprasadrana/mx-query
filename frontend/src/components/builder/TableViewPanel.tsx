/** Column visibility, freeze, and density for the result table. */
import { TableView, TableColumn, StyleRule, STYLE_OPS, emptyTableView, newStyleRule } from "../../lib/tableView";
import { Icon, faArrowDown, faArrowUp, faBars, faPlus, faTable, faTrashCan } from "../Icon";
import MenuSelect from "../MenuSelect";

export default function TableViewPanel({
  view,
  fields,
  onChange,
}: {
  view: TableView;
  fields: string[];
  onChange: (next: TableView) => void;
}) {
  function moveCol(i: number, dir: -1 | 1) {
    const j = i + dir;
    if (j < 0 || j >= view.columns.length) return;
    const columns = [...view.columns];
    const [item] = columns.splice(i, 1);
    columns.splice(j, 0, item);
    onChange({ ...view, columns });
  }

  function moveColTo(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= view.columns.length || to >= view.columns.length) return;
    const columns = [...view.columns];
    const [item] = columns.splice(from, 1);
    columns.splice(to, 0, item);
    onChange({ ...view, columns });
  }

  function patchCol(i: number, patch: Partial<TableColumn>) {
    onChange({
      ...view,
      columns: view.columns.map((c, idx) => (idx === i ? { ...c, ...patch } : c)),
    });
  }

  function patchRule(id: string, patch: Partial<StyleRule>) {
    onChange({
      ...view,
      rules: view.rules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });
  }

  const unused = fields.filter((f) => !view.columns.some((c) => c.key.toLowerCase() === f.toLowerCase()));
  const fieldOpts = (extra?: string) =>
    [extra, ...fields].filter((k, i, a): k is string => !!k && a.indexOf(k) === i).map((k) => ({ value: k, label: k }));

  return (
    <div className="panel-block display-config" data-tour="table-view" data-flight="table">
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>
          <Icon icon={faTable} /> Table
        </label>
        <button type="button" className="ghost" onClick={() => onChange(emptyTableView())} disabled={view.header === "" && !view.columns.length && !view.rules.length}>
          clear
        </button>
      </div>
      <p className="muted display-config-blurb">
        Title, column order, and color rules for this page of rows. Drag a row or use the arrows. Saved with the query.
      </p>
      <label className="lbl" style={{ marginTop: 10 }}>
        Header
        <input
          type="text"
          value={view.header}
          placeholder="Optional table title"
          onChange={(e) => onChange({ ...view, header: e.target.value })}
        />
      </label>
      <div className="spread" style={{ marginTop: 12 }}>
        <span className="muted" style={{ fontSize: "0.72rem" }}>Columns</span>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="ghost"
            disabled={!fields.length}
            onClick={() => onChange({ ...view, columns: fields.map((key) => ({ key })) })}
          >
            from query
          </button>
          <button
            type="button"
            className="ghost"
            disabled={unused.length === 0}
            onClick={() => unused[0] && onChange({ ...view, columns: [...view.columns, { key: unused[0] }] })}
          >
            <Icon icon={faPlus} /> col
          </button>
        </div>
      </div>
      {view.columns.map((col, i) => (
        <div
          key={`${col.key}-${i}`}
          className="col-drag-row"
          draggable
          onDragStart={(e) => {
            e.dataTransfer.setData("text/plain", String(i));
            e.dataTransfer.effectAllowed = "move";
          }}
          onDragOver={(e) => {
            e.preventDefault();
            e.dataTransfer.dropEffect = "move";
          }}
          onDrop={(e) => {
            e.preventDefault();
            const from = Number(e.dataTransfer.getData("text/plain"));
            if (Number.isFinite(from)) moveColTo(from, i);
          }}
        >
          <span className="col-drag-handle" title="Drag to reorder">
            <Icon icon={faBars} />
          </span>
          <MenuSelect
            value={col.key}
            options={fieldOpts(col.key).filter((o) => o.value === col.key || unused.includes(o.value))}
            onChange={(key) => patchCol(i, { key })}
          />
          <input
            type="text"
            placeholder="label"
            value={col.label ?? ""}
            onChange={(e) => patchCol(i, { label: e.target.value || undefined })}
          />
          <label className="muted" style={{ fontSize: "0.68rem", display: "flex", gap: 4, alignItems: "center" }}>
            <input type="checkbox" checked={!!col.hidden} onChange={(e) => patchCol(i, { hidden: e.target.checked || undefined })} />
            hide
          </label>
          <button type="button" className="icon-btn" disabled={i === 0} onClick={() => moveCol(i, -1)} title="Earlier">
            <Icon icon={faArrowUp} />
          </button>
          <button type="button" className="icon-btn" disabled={i === view.columns.length - 1} onClick={() => moveCol(i, 1)} title="Later">
            <Icon icon={faArrowDown} />
          </button>
          <button type="button" className="icon-btn" title="Remove" onClick={() => onChange({ ...view, columns: view.columns.filter((_, idx) => idx !== i) })}>
            <Icon icon={faTrashCan} />
          </button>
        </div>
      ))}
      <div className="spread" style={{ marginTop: 12 }}>
        <span className="muted" style={{ fontSize: "0.72rem" }}>Color rules</span>
        <button
          type="button"
          className="ghost"
          disabled={!fields.length}
          onClick={() => onChange({ ...view, rules: [...view.rules, newStyleRule(fields[0])] })}
        >
          <Icon icon={faPlus} /> rule
        </button>
      </div>
      {view.rules.map((rule) => (
        <div key={rule.id} className="display-config-card">
          <div className="report-config-grid">
            <label>
              <span>When</span>
              <MenuSelect value={rule.field} options={fieldOpts(rule.field)} onChange={(field) => patchRule(rule.id, { field })} />
            </label>
            <label>
              <span>Op</span>
              <MenuSelect
                value={rule.op}
                searchable={false}
                options={STYLE_OPS.map((o) => ({ value: o.id, label: o.label }))}
                onChange={(op) => patchRule(rule.id, { op: op as StyleRule["op"] })}
              />
            </label>
            {rule.op !== "empty" && rule.op !== "notempty" && (
              <label>
                <span>Value</span>
                <input type="text" value={rule.value ?? ""} onChange={(e) => patchRule(rule.id, { value: e.target.value })} />
              </label>
            )}
            <label>
              <span>Paint</span>
              <MenuSelect
                value={rule.target}
                searchable={false}
                options={[
                  { value: "row", label: "whole row" },
                  { value: "cell", label: "that cell" },
                ]}
                onChange={(target) => patchRule(rule.id, { target: target as StyleRule["target"] })}
              />
            </label>
            <label>
              <span>Fill</span>
              <div className="style-color-row">
                <input type="text" placeholder="# or css" value={rule.background ?? ""} onChange={(e) => patchRule(rule.id, { background: e.target.value || undefined })} />
                <input
                  type="color"
                  className="style-color"
                  value={/^#[0-9a-fA-F]{6}$/.test(rule.background ?? "") ? rule.background! : "#64748b"}
                  onChange={(e) => patchRule(rule.id, { background: e.target.value })}
                  title="Pick a fill color"
                />
              </div>
            </label>
            <label>
              <span>Text</span>
              <div className="style-color-row">
                <input type="text" placeholder="# or css" value={rule.color ?? ""} onChange={(e) => patchRule(rule.id, { color: e.target.value || undefined })} />
                <input
                  type="color"
                  className="style-color"
                  value={/^#[0-9a-fA-F]{6}$/.test(rule.color ?? "") ? rule.color! : "#e2e8f0"}
                  onChange={(e) => patchRule(rule.id, { color: e.target.value })}
                  title="Pick a text color"
                />
              </div>
            </label>
          </div>
          <div className="spread" style={{ marginTop: 8 }}>
            <span className="style-swatch" style={{ background: rule.background, color: rule.color }}>Aa</span>
            <button type="button" className="icon-btn" title="Remove" onClick={() => onChange({ ...view, rules: view.rules.filter((r) => r.id !== rule.id) })}>
              <Icon icon={faTrashCan} />
            </button>
          </div>
        </div>
      ))}
    </div>
  );
}
