import { describe, expect, it } from "vitest";
import ExcelJS from "exceljs";
import {
  DEFAULT_EXCEL_OPTIONS,
  leafRows,
  outlineModel,
  rowsToXlsxBuffer,
  sheetTables,
} from "./excelExport";
import { flattenNestedRows } from "./schema";

const sample = [
  {
    wonum: "1000",
    status: "APPR",
    woactivity: [
      { wonum: "1000.1", status: "WAPPR" },
      { wonum: "1000.2", status: "APPR" },
    ],
    asset: { assetnum: "A-1", status: "OPERATING" },
  },
];

const nested = [
  {
    wonum: "1000",
    woactivity: [
      {
        wonum: "1000.1",
        wplabor: [{ laborcode: "L1" }, { laborcode: "L2" }],
      },
    ],
  },
];

const sheetsOpts = { ...DEFAULT_EXCEL_OPTIONS, layout: "sheets" as const };

function hyperlinkOf(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  if (v && typeof v === "object" && "hyperlink" in v) {
    return String((v as ExcelJS.CellHyperlinkValue).hyperlink ?? "");
  }
  return String(cell.hyperlink ?? "");
}

function textOf(cell: ExcelJS.Cell | undefined): string {
  if (!cell) return "";
  const v = cell.value;
  if (v && typeof v === "object" && "text" in v) {
    return String((v as ExcelJS.CellHyperlinkValue).text ?? "");
  }
  return v == null ? "" : String(v);
}

describe("flattenNestedRows", () => {
  it("emits a row per nested child, repeating parent fields", () => {
    const rows = flattenNestedRows(sample);
    expect(rows.some((r) => r["woactivity.wonum"] === "1000.1")).toBe(true);
    expect(rows.some((r) => r["woactivity.wonum"] === "1000.2")).toBe(true);
    expect(rows.every((r) => r.wonum === "1000")).toBe(true);
  });

  it("walks a 1:1 related object, not only arrays", () => {
    const rows = flattenNestedRows(sample);
    expect(rows.some((r) => r["asset.assetnum"] === "A-1")).toBe(true);
  });
});

describe("sheetTables", () => {
  it("puts child collections on their own sheets with a parent key", () => {
    const tables = sheetTables(sample, sheetsOpts);
    const names = tables.map((t) => t.name);
    expect(names).toContain("parent");
    expect(names).toContain("woactivity");
    expect(names).toContain("asset");
    const parent = tables.find((t) => t.name === "parent")?.rows ?? [];
    expect(parent[0]?.wonum).toBe("1000");
    expect(parent[0]?.["parent.wonum"]).toBeUndefined();
    const acts = tables.find((t) => t.name === "woactivity")?.rows ?? [];
    expect(acts).toHaveLength(2);
    expect(acts[0]["parent.wonum"]).toBe("1000");
    expect(acts[0].wonum).toBe("1000.1");
  });
});

describe("leafRows", () => {
  it("can stop at the first child level", () => {
    const rows = leafRows(sample, {
      ...DEFAULT_EXCEL_OPTIONS,
      layout: "leaves",
      includeNested: false,
      includeParentsWithoutChildren: false,
    });
    expect(rows.some((r) => r["woactivity.wonum"] === "1000.1")).toBe(true);
    expect(rows.some((r) => r["asset.assetnum"] === "A-1")).toBe(true);
  });
});

describe("outlineModel", () => {
  it("keeps parent scalars on the parent row only; child rows leave them blank", () => {
    const { cols, lines } = outlineModel(sample, DEFAULT_EXCEL_OPTIONS);
    expect(cols.some((c) => c.group === "Parent" && c.field === "wonum")).toBe(true);
    expect(cols.some((c) => c.group === "woactivity" && c.field === "wonum")).toBe(true);
    expect(cols.some((c) => c.group === "asset" && c.field === "assetnum")).toBe(true);

    const parent = lines.find((l) => l.depth === 0);
    expect(parent?.values.wonum).toBe("1000");
    expect(parent?.values["asset.assetnum"]).toBe("A-1");
    expect(parent?.values["woactivity.wonum"]).toBeUndefined();
    expect(parent?.values.__level).toBeUndefined();
    expect(parent?.values.__path).toBeUndefined();
    expect(parent?.values.__parent).toBeUndefined();

    const kids = lines.filter((l) => l.depth === 1);
    expect(kids).toHaveLength(2);
    expect(kids.map((k) => k.values["woactivity.wonum"])).toEqual(["1000.1", "1000.2"]);
    expect(kids.every((k) => k.values.wonum === undefined)).toBe(true);
    expect(kids.every((k) => k.values["asset.assetnum"] === undefined)).toBe(true);
  });

  it("keeps a 1:N collection hanging off a 1:1 hop on its own columns", () => {
    const rows = [
      {
        wonum: "1000",
        asset: { assetnum: "A-1", openwo: [{ wonum: "2001" }] },
      },
    ];
    const { lines } = outlineModel(rows, DEFAULT_EXCEL_OPTIONS);
    const g = lines.find((l) => l.values["asset.openwo.wonum"] === "2001");
    expect(g?.depth).toBeGreaterThan(0);
    expect(g?.values.wonum).toBeUndefined();
  });
});

describe("rowsToXlsxBuffer", () => {
  it("writes one sheet per relationship with click-through, no Level/ParentKey on the parent", async () => {
    const buf = await rowsToXlsxBuffer(sample, DEFAULT_EXCEL_OPTIONS, {
      osName: "MXAPIWO",
      title: "All P1 Asset's PM Wos",
    });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.title).toBe("mxQuery Result Set");
    expect(wb.creator).toBe("mxQuery");
    expect(wb.worksheets.map((s) => s.name)).toEqual(["mxQuery", "MXAPIWO", "woactivity", "asset"]);

    const cover = wb.getWorksheet("mxQuery");
    expect(cover?.getCell("A1").value).toBe("mxQuery Result Set");

    const parent = wb.getWorksheet("MXAPIWO");
    expect(parent?.getCell("A1").value).toMatch(/mxQuery Result Set/);
    expect(textOf(parent?.getCell("A2"))).toBe("wonum");
    expect(textOf(parent?.getCell("B2"))).toBe("status");
    expect(textOf(parent?.getCell("C2"))).toBe("woactivity");
    expect(textOf(parent?.getCell("D2"))).toBe("asset");
    expect(textOf(parent?.getCell("A3"))).toBe("1000");
    expect(textOf(parent?.getCell("C3"))).toBe("2 rows");
    expect(hyperlinkOf(parent?.getCell("C3"))).toBe("#'woactivity'!A3");
    expect(textOf(parent?.getCell("D3"))).toBe("Open");
    expect(hyperlinkOf(parent?.getCell("D3"))).toBe("#'asset'!A3");
    expect(parent?.getCell("A2").value).not.toBe("Level");
    expect(parent?.pageSetup.orientation).toBe("landscape");
    expect(parent?.pageSetup.fitToPage).not.toBe(true);
    expect(String(parent?.headerFooter.oddFooter ?? "")).toMatch(/Generated by mxQuery/);

    const acts = wb.getWorksheet("woactivity");
    expect(textOf(acts?.getCell("A2"))).toBe("Parent");
    expect(textOf(acts?.getCell("A3"))).toBe("1000");
    expect(hyperlinkOf(acts?.getCell("A3"))).toBe("#'MXAPIWO'!A3");
    expect(textOf(acts?.getCell("B3"))).toBe("1000.1");
    expect(textOf(acts?.getCell("B4"))).toBe("1000.2");
  });

  it("links a child row through to a grandchild sheet", async () => {
    const buf = await rowsToXlsxBuffer(nested, DEFAULT_EXCEL_OPTIONS, { osName: "MXAPIWO" });
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((s) => s.name)).toEqual([
      "mxQuery",
      "MXAPIWO",
      "woactivity",
      "woactivity.wplabor",
    ]);
    const acts = wb.getWorksheet("woactivity");
    expect(textOf(acts?.getCell("C2"))).toBe("wplabor");
    expect(textOf(acts?.getCell("C3"))).toBe("2 rows");
    expect(hyperlinkOf(acts?.getCell("C3"))).toBe("#'woactivity.wplabor'!A3");
    const labor = wb.getWorksheet("woactivity.wplabor");
    expect(textOf(labor?.getCell("A3"))).toBe("1000.1");
    expect(hyperlinkOf(labor?.getCell("A3"))).toBe("#'woactivity'!A3");
  });

  it("outline layout still writes a same-sheet tree without Level columns", async () => {
    const buf = await rowsToXlsxBuffer(
      sample,
      { ...DEFAULT_EXCEL_OPTIONS, layout: "outline" },
      { osName: "MXAPIWO" },
    );
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(buf);
    expect(wb.worksheets.map((s) => s.name)).toEqual(["mxQuery", "Result Set"]);
    const data = wb.getWorksheet("Result Set");
    expect(textOf(data?.getCell("A2"))).toBe("Parent");
    expect(textOf(data?.getCell("A3"))).toBe("wonum");
    expect(textOf(data?.getCell("A3"))).not.toBe("Level");
  });
});
