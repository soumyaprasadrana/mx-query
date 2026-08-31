/** Chart type and series for the results view. */
import {
  ChartKind,
  DateBucket,
  MAX_REPORT_CHARTS,
  MAX_REPORT_KPIS,
  ReportChart,
  ReportField,
  ReportKpi,
  ReportMetric,
  ReportSpec,
  emptyReport,
  mergeSuggest,
  nid,
  suggestReport,
} from "../../lib/resultReport";
import { Icon, faChartSimple, faPlus, faTrashCan } from "../Icon";
import MenuSelect from "../MenuSelect";

const METRICS: { id: ReportMetric; label: string }[] = [
  { id: "count", label: "Count" },
  { id: "sum", label: "Sum" },
  { id: "avg", label: "Average" },
  { id: "distinct", label: "Distinct" },
];

const CHART_METRICS: { id: ReportChart["metric"]; label: string }[] = [
  { id: "count", label: "Count" },
  { id: "sum", label: "Sum" },
  { id: "avg", label: "Average" },
];

const KINDS: { id: ChartKind; label: string }[] = [
  { id: "bar", label: "Bar" },
  { id: "donut", label: "Donut" },
  { id: "line", label: "Line" },
];

const BUCKETS: { id: DateBucket; label: string }[] = [
  { id: "day", label: "Day" },
  { id: "week", label: "Week" },
  { id: "month", label: "Month" },
];

function defaultGroup(fields: ReportField[]): string {
  return fields.find((f) => f.kind === "cat")?.name ?? fields[0]?.name ?? "";
}

function defaultNum(fields: ReportField[]): string | undefined {
  return fields.find((f) => f.kind === "num")?.name;
}

function fieldKind(fields: ReportField[], name: string | undefined): ReportField["kind"] | undefined {
  if (!name) return undefined;
  return fields.find((f) => f.name.toLowerCase() === name.toLowerCase())?.kind;
}

export default function ChartConfigPanel({
  spec,
  fields,
  onChange,
}: {
  spec: ReportSpec;
  fields: ReportField[];
  onChange: (next: ReportSpec) => void;
}) {
  const cats = fields.filter((f) => f.kind === "cat" || f.kind === "date");
  const nums = fields.filter((f) => f.kind === "num");
  const groupFields = cats.length ? cats : fields;

  function patchKpi(id: string, patch: Partial<ReportKpi>) {
    onChange({
      ...spec,
      kpis: spec.kpis.map((k) => (k.id === id ? { ...k, ...patch } : k)),
    });
  }

  function patchChart(id: string, patch: Partial<ReportChart>) {
    onChange({
      ...spec,
      charts: spec.charts.map((c) => (c.id === id ? { ...c, ...patch } : c)),
    });
  }

  function addKpi() {
    if (spec.kpis.length >= MAX_REPORT_KPIS) return;
    onChange({
      ...spec,
      kpis: [...spec.kpis, { id: nid("k"), metric: "count" }],
    });
  }

  function addChart() {
    if (spec.charts.length >= MAX_REPORT_CHARTS) return;
    const groupBy = defaultGroup(groupFields);
    if (!groupBy) return;
    const date = fieldKind(fields, groupBy) === "date";
    onChange({
      ...spec,
      charts: [
        ...spec.charts,
        {
          id: nid("c"),
          kind: date ? "line" : "bar",
          groupBy,
          metric: "count",
          top: 8,
          ...(date ? { bucket: "month" as const } : {}),
        },
      ],
    });
  }

  return (
    <div className="panel-block display-config" data-tour="report" data-flight="report">
      <div className="spread">
        <label className="lbl" style={{ marginBottom: 0 }}>
          <Icon icon={faChartSimple} /> Charts
        </label>
        <div className="row" style={{ gap: 6 }}>
          <button
            type="button"
            className="ghost"
            disabled={fields.length === 0}
            title="Add count / status / date charts from the selected columns"
            onClick={() => onChange(mergeSuggest(spec, suggestReport(fields)))}
          >
            suggest
          </button>
          <button
            type="button"
            className="ghost"
            disabled={spec.kpis.length === 0 && spec.charts.length === 0}
            onClick={() => onChange(emptyReport())}
          >
            clear
          </button>
        </div>
      </div>
      <p className="muted display-config-blurb">
        Tiles and charts on this page of results. Filters stay in the query - this does not add a second WHERE.
      </p>

      <div className="spread" style={{ marginTop: 10 }}>
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          Tiles {spec.kpis.length}/{MAX_REPORT_KPIS}
        </span>
        <button type="button" className="ghost" disabled={spec.kpis.length >= MAX_REPORT_KPIS} onClick={addKpi}>
          <Icon icon={faPlus} /> tile
        </button>
      </div>
      {spec.kpis.map((kpi) => (
        <div key={kpi.id} className="report-config-row">
          <MenuSelect
            searchable={false}
            value={kpi.metric}
            options={METRICS.map((m) => ({ value: m.id, label: m.label }))}
            onChange={(v) => {
              const metric = v as ReportMetric;
              const field = metric === "count" ? undefined : (kpi.field || defaultNum(fields) || fields[0]?.name);
              patchKpi(kpi.id, { metric, field });
            }}
          />
          {kpi.metric !== "count" ? (
            <MenuSelect
              value={kpi.field ?? ""}
              options={(kpi.metric === "distinct" ? fields : nums.length ? nums : fields).map((f) => ({ value: f.name, label: f.name }))}
              onChange={(field) => patchKpi(kpi.id, { field })}
            />
          ) : (
            <span className="muted" style={{ fontSize: "0.75rem" }}>rows on this page</span>
          )}
          <button type="button" className="icon-btn" title="Remove" onClick={() => onChange({ ...spec, kpis: spec.kpis.filter((k) => k.id !== kpi.id) })}>
            <Icon icon={faTrashCan} />
          </button>
        </div>
      ))}

      <div className="spread" style={{ marginTop: 12 }}>
        <span className="muted" style={{ fontSize: "0.72rem" }}>
          Charts {spec.charts.length}/{MAX_REPORT_CHARTS}
        </span>
        <button
          type="button"
          className="ghost"
          disabled={spec.charts.length >= MAX_REPORT_CHARTS || groupFields.length === 0}
          onClick={addChart}
        >
          <Icon icon={faPlus} /> chart
        </button>
      </div>
      {spec.charts.map((chart) => {
        const gk = fieldKind(fields, chart.groupBy);
        const date = gk === "date" || !!chart.bucket;
        return (
          <div key={chart.id} className="display-config-card">
            <div className="spread">
              <MenuSelect
                searchable={false}
                value={chart.kind}
                options={KINDS.map((k) => ({ value: k.id, label: k.label }))}
                onChange={(kind) => patchChart(chart.id, { kind: kind as ChartKind })}
              />
              <button type="button" className="icon-btn" title="Remove" onClick={() => onChange({ ...spec, charts: spec.charts.filter((c) => c.id !== chart.id) })}>
                <Icon icon={faTrashCan} />
              </button>
            </div>
            <div className="report-config-grid">
              <label>
                <span>Group</span>
                <MenuSelect
                  value={chart.groupBy}
                  options={[
                    ...groupFields.map((f) => ({ value: f.name, label: f.name })),
                    ...(chart.groupBy && !groupFields.some((f) => f.name === chart.groupBy)
                      ? [{ value: chart.groupBy, label: chart.groupBy }]
                      : []),
                  ]}
                  onChange={(groupBy) => {
                    const nextDate = fieldKind(fields, groupBy) === "date";
                    patchChart(chart.id, {
                      groupBy,
                      bucket: nextDate ? (chart.bucket ?? "month") : undefined,
                      kind: nextDate && chart.kind === "donut" ? "line" : chart.kind,
                    });
                  }}
                />
              </label>
              <label>
                <span>Value</span>
                <MenuSelect
                  searchable={false}
                  value={chart.metric}
                  options={CHART_METRICS.map((m) => ({ value: m.id, label: m.label }))}
                  onChange={(v) => {
                    const metric = v as ReportChart["metric"];
                    patchChart(chart.id, {
                      metric,
                      valueField: metric === "count" ? undefined : (chart.valueField || defaultNum(fields)),
                    });
                  }}
                />
              </label>
              {chart.metric !== "count" && (
                <label>
                  <span>Field</span>
                  <MenuSelect
                    value={chart.valueField ?? ""}
                    options={(nums.length ? nums : fields).map((f) => ({ value: f.name, label: f.name }))}
                    onChange={(valueField) => patchChart(chart.id, { valueField })}
                  />
                </label>
              )}
              {date && (
                <label>
                  <span>Bucket</span>
                  <MenuSelect
                    searchable={false}
                    value={chart.bucket ?? "month"}
                    options={BUCKETS.map((b) => ({ value: b.id, label: b.label }))}
                    onChange={(bucket) => patchChart(chart.id, { bucket: bucket as DateBucket })}
                  />
                </label>
              )}
              {!date && (
                <label>
                  <span>Top</span>
                  <MenuSelect
                    searchable={false}
                    value={String(chart.top ?? 8)}
                    options={[5, 8, 10, 12].map((n) => ({ value: String(n), label: String(n) }))}
                    onChange={(top) => patchChart(chart.id, { top: Number(top) })}
                  />
                </label>
              )}
            </div>
          </div>
        );
      })}
    </div>
  );
}
