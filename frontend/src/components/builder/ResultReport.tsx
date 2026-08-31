/** Read-only report page for a saved query (no save chrome). */
import { useEffect, useMemo, useState } from "react";
import {
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Line,
  LineChart,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { THEME_EVENT } from "../../lib/theme/apply";
import {
  ChartResult,
  ReportField,
  ReportSpec,
  evalChart,
  evalKpi,
  formatChartValue,
  formatKpiValue,
  isReportEmpty,
} from "../../lib/resultReport";

function readTheme() {
  const s = getComputedStyle(document.documentElement);
  const tok = (name: string, fallback: string) => s.getPropertyValue(name).trim() || fallback;
  return {
    accent: tok("--accent", "#3EE0B4"),
    accent2: tok("--accent-2", "#7C8CFF"),
    muted: tok("--muted", "#8a8a8a"),
    text: tok("--text", "#e8e8e8"),
    border: tok("--border", "#333"),
    surface: tok("--surface-solid", "#1a1a1a"),
    typeStr: tok("--type-str", "#7C8CFF"),
    typeNum: tok("--type-num", "#3EE0B4"),
    typeDate: tok("--type-date", "#E8B86D"),
    typeBool: tok("--type-bool", "#E07A5F"),
    font: tok("--font", "Inter, system-ui, sans-serif"),
    mono: tok("--mono", "JetBrains Mono, ui-monospace, monospace"),
  };
}

function useChartTheme() {
  const [theme, setTheme] = useState(readTheme);
  useEffect(() => {
    const sync = () => setTheme(readTheme());
    window.addEventListener(THEME_EVENT, sync);
    return () => window.removeEventListener(THEME_EVENT, sync);
  }, []);
  return theme;
}

function sliceColors(theme: ReturnType<typeof readTheme>): string[] {
  return [theme.accent, theme.accent2, theme.typeStr, theme.typeNum, theme.typeDate, theme.typeBool];
}

function ChartTooltip({
  active,
  payload,
  label,
  theme,
}: {
  active?: boolean;
  payload?: ReadonlyArray<{ value?: unknown }>;
  label?: unknown;
  theme: ReturnType<typeof readTheme>;
}) {
  if (!active || !payload?.length) return null;
  return (
    <div className="report-tip" style={{ background: theme.surface, borderColor: theme.border, color: theme.text }}>
      <div className="mono">{label == null ? "" : String(label)}</div>
      <div>{formatChartValue(Number(payload[0]?.value ?? 0))}</div>
    </div>
  );
}

function OneChart({
  chart,
  theme,
}: {
  chart: ChartResult;
  theme: ReturnType<typeof readTheme>;
}) {
  const colors = sliceColors(theme);
  if (!chart.points.length) {
    return <p className="muted" style={{ margin: "12px 0 0", fontSize: "0.78rem" }}>No values on this page.</p>;
  }
  if (chart.kind === "donut") {
    return (
      <div className="report-donut">
        <ResponsiveContainer width="100%" height={148}>
          <PieChart>
            <Pie
              data={chart.points}
              dataKey="value"
              nameKey="name"
              innerRadius={48}
              outerRadius={72}
              paddingAngle={2}
              stroke="none"
            >
              {chart.points.map((_, i) => (
                <Cell key={i} fill={colors[i % colors.length]} />
              ))}
            </Pie>
          <Tooltip content={(props) => <ChartTooltip {...props} theme={theme} />} />
          </PieChart>
        </ResponsiveContainer>
        <ul className="report-legend">
          {chart.points.slice(0, 6).map((p, i) => (
            <li key={p.name}>
              <span className="report-swatch" style={{ background: colors[i % colors.length] }} />
              <span className="mono">{p.name}</span>
              <span>{formatChartValue(p.value)}</span>
            </li>
          ))}
        </ul>
      </div>
    );
  }
  if (chart.kind === "line") {
    return (
        <ResponsiveContainer width="100%" height={148}>
        <LineChart data={chart.points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
          <CartesianGrid stroke={theme.border} vertical={false} />
          <XAxis dataKey="name" tick={{ fill: theme.muted, fontSize: 10, fontFamily: theme.mono }} interval="preserveStartEnd" />
          <YAxis tick={{ fill: theme.muted, fontSize: 10 }} width={40} tickFormatter={(v) => formatChartValue(Number(v))} />
          <Tooltip content={(props) => <ChartTooltip {...props} theme={theme} />} />
          <Line type="monotone" dataKey="value" stroke={theme.accent} strokeWidth={2} dot={false} />
        </LineChart>
      </ResponsiveContainer>
    );
  }
  return (
    <ResponsiveContainer width="100%" height={148}>
      <BarChart data={chart.points} margin={{ top: 8, right: 8, left: -18, bottom: 0 }}>
        <CartesianGrid stroke={theme.border} vertical={false} />
        <XAxis dataKey="name" tick={{ fill: theme.muted, fontSize: 10, fontFamily: theme.mono }} interval={0} hide={chart.points.length > 8} />
          <YAxis tick={{ fill: theme.muted, fontSize: 10 }} width={40} tickFormatter={(v) => formatChartValue(Number(v))} />
          <Tooltip content={(props) => <ChartTooltip {...props} theme={theme} />} />
          <Bar dataKey="value" radius={[4, 4, 0, 0]}>
          {chart.points.map((_, i) => (
            <Cell key={i} fill={colors[i % colors.length]} />
          ))}
        </Bar>
      </BarChart>
    </ResponsiveContainer>
  );
}

export default function ResultReport({
  spec,
  rows,
  fields,
  pageHint,
}: {
  spec: ReportSpec;
  rows: Record<string, unknown>[];
  fields: ReportField[];
  pageHint: string;
}) {
  const theme = useChartTheme();
  const kpis = useMemo(() => spec.kpis.map((k) => evalKpi(k, rows)), [spec.kpis, rows]);
  const charts = useMemo(
    () =>
      spec.charts.map((c) => {
        const kind = fields.find((f) => f.name.toLowerCase() === c.groupBy.toLowerCase())?.kind;
        return evalChart(c, rows, kind);
      }),
    [spec.charts, rows, fields],
  );

  if (isReportEmpty(spec)) return null;

  return (
    <div className="report-strip">
      <p className="report-caption muted">{pageHint} Filters belong in the query.</p>
      {kpis.length > 0 && (
        <div className="report-kpis">
          {kpis.map((k) => (
            <div key={k.id} className="report-kpi">
              <div className="report-kpi-label">{k.label}</div>
              <div className="report-kpi-value mono">{formatKpiValue(k.value)}</div>
              <div className="report-kpi-hint muted">{k.hint}</div>
            </div>
          ))}
        </div>
      )}
      {charts.length > 0 && (
        <div className={`report-charts${charts.length === 1 ? " one" : ""}`}>
          {charts.map((c) => (
            <div key={c.id} className="report-chart">
              <div className="report-chart-title">{c.title}</div>
              <OneChart chart={c} theme={theme} />
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
