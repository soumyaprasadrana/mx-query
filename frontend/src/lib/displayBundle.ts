/** Export the query plus display/table/chart config as one JSON doc. */
import { DisplaySpec } from "./schema";
import { packDisplay } from "./displayConfig";
import { ReportSpec, reportForExport } from "./resultReport";
import { TableView, tableForExport } from "./tableView";

/** One place that writes the client-only `display` envelope onto an export/save payload. */
export function packQueryDisplay(
  flatten: DisplaySpec,
  extra: Record<string, unknown>,
  report: ReportSpec,
  table: TableView,
): Record<string, unknown> | undefined {
  const rest: Record<string, unknown> = { ...extra };
  const packedReport = reportForExport(report);
  if (packedReport) rest.report = packedReport;
  else delete rest.report;
  const packedTable = tableForExport(table);
  if (packedTable) rest.table = packedTable;
  else delete rest.table;
  return packDisplay(flatten, rest);
}

export function exportQueryDoc(
  args: Record<string, unknown> | null,
  flatten: DisplaySpec,
  extra: Record<string, unknown>,
  report: ReportSpec,
  table: TableView,
): Record<string, unknown> | null {
  if (!args) return null;
  const display = packQueryDisplay(flatten, extra, report, table);
  return display ? { ...args, display } : args;
}
