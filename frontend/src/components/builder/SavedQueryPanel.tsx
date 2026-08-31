/** Pick a saved Maximo query and fill its parameters. */
import { QueryParam, SavedQuery } from "../../types";

export default function SavedQueryPanel({
  queries,
  selected,
  params,
  onSelect,
  onParams,
}: {
  queries: SavedQuery[];
  selected: string | null;
  params: Record<string, QueryParam>;
  onSelect: (name: string | null) => void;
  onParams: (params: Record<string, QueryParam>) => void;
}) {
  if (queries.length === 0) {
    return (
      <div className="panel-block">
        <label className="lbl">Saved query</label>
        <p className="muted" style={{ margin: 0 }}>No saved queries on this object structure.</p>
      </div>
    );
  }

  const active = queries.find((q) => q.name === selected) ?? null;

  function pick(name: string) {
    if (selected === name) {
      onSelect(null);
      onParams({});
      return;
    }
    const q = queries.find((x) => x.name === name);
    onSelect(name);
    const init: Record<string, QueryParam> = {};
    for (const p of q?.params ?? []) init[p] = params[p] ?? { value: "", isDynamic: false };
    onParams(init);
  }

  return (
    <div className="panel-block">
      <label className="lbl">Saved query</label>
      {selected && <p className="warn-chip">Overrides WHERE + select when executed</p>}
      <div className="sq-list">
        {queries.map((q) => (
          <button key={q.name} className={`sq-item${selected === q.name ? " active" : ""}`} onClick={() => pick(q.name)}>
            <div className="mono" style={{ fontSize: "0.78rem" }}>{q.name}</div>
            {q.title && q.title !== q.name && <div className="muted" style={{ fontSize: "0.7rem" }}>{q.title}</div>}
            {q.params.length > 0 && <div className="muted" style={{ fontSize: "0.65rem" }}>{q.params.length} param{q.params.length === 1 ? "" : "s"}</div>}
          </button>
        ))}
      </div>
      {active && active.params.length > 0 && (
        <div className="stack" style={{ marginTop: 10 }}>
          {active.params.map((p) => {
            const po = params[p] ?? { value: "", isDynamic: false };
            return (
              <div key={p} className="where-row" style={{ gridTemplateColumns: "1fr auto" }}>
                <div>
                  <label className="lbl">{p}</label>
                  {po.isDynamic ? (
                    <code className="mono" style={{ color: "var(--accent-2)", fontSize: "0.78rem" }}>
                      {po.dynamicPlaceholder ?? `{{${p.toUpperCase()}}}`}
                    </code>
                  ) : (
                    <input
                      type="text"
                      value={po.value}
                      placeholder={`Value for ${p}`}
                      onChange={(e) => onParams({ ...params, [p]: { ...po, value: e.target.value } })}
                    />
                  )}
                </div>
                <label className="muted" style={{ display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
                  <input
                    type="checkbox"
                    checked={!!po.isDynamic}
                    onChange={() =>
                      onParams({
                        ...params,
                        [p]: {
                          ...po,
                          isDynamic: !po.isDynamic,
                          dynamicPlaceholder: !po.isDynamic ? `{{${p.toUpperCase()}}}` : undefined,
                          value: !po.isDynamic ? "" : po.value,
                        },
                      })
                    }
                    style={{ width: "auto" }}
                  />
                  dynamic
                </label>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
