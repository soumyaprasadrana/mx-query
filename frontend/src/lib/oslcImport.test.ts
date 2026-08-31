/** parseImport: tool-call JSON and OSLC GET URLs. No live Maximo. */
import { describe, expect, it } from "vitest";
import { parseImport } from "./oslcImport";
import { TOUR_QUERY } from "./tour/example";

describe("parseImport", () => {
  it("rejects empty paste", () => {
    const r = parseImport("  ");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.error).toMatch(/paste/i);
  });

  it("rejects invalid JSON", () => {
    const r = parseImport("{ not json");
    expect(r.ok).toBe(false);
  });

  it("reads os_query_builder args", () => {
    const r = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: { fields: ["wonum", "status"] },
      where: { conditions: [{ field: "istask", op: "=", value: "0" }] },
      pageSize: 10,
      orMode: true,
    }));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("json");
    expect(r.osName).toBe("MXAPIWO");
    expect(r.selected).toEqual(["wonum", "status"]);
    expect(r.where).toEqual([{ field: "istask", op: "=", value: "0" }]);
    expect(r.pageSize).toBe(10);
    expect(r.orMode).toBe(true);
  });

  it("unwraps os_query_builder({ ... }) and nested { query }", () => {
    const inner = { osName: "MXAPISR", opAction: "query", select: { fields: ["ticketid"] } };
    const wrapped = parseImport(`os_query_builder(${JSON.stringify(inner)});`);
    expect(wrapped.ok).toBe(true);
    if (wrapped.ok) expect(wrapped.osName).toBe("MXAPISR");

    const nested = parseImport(JSON.stringify({ query: inner }));
    expect(nested.ok).toBe(true);
    if (nested.ok) expect(nested.osName).toBe("MXAPISR");
  });

  it("hydrates the tour sample the same way as paste-import", () => {
    const r = parseImport(JSON.stringify(TOUR_QUERY));
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.osName).toBe("MXAPIWO");
    expect(r.pageSize).toBe(10);
    expect(r.selected).toContain("wonum");
    expect(r.where.some((c) => c.field === "worktype" && c.value === "PM")).toBe(true);
    expect(r.extraSelect.some((t) => t.startsWith("rel.ASSET"))).toBe(true);
    expect(r.childOptions?.[0]).toMatchObject({
      relationship: "OPENWO",
      path: ["ASSET", "ASSET_PARENT", "OPENWO"],
    });
    expect(r.sortRules).toEqual([{ field: "wonum", dir: "asc" }]);
  });

  it("parses an OSLC GET and drops lean/paging noise", () => {
    const r = parseImport(
      "https://maximo.example/maximo/oslc/os/mxapiwo?oslc.select=wonum,status&oslc.pageSize=25&lean=1&oslc.paging=true",
    );
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.source).toBe("url");
    expect(r.osName?.toLowerCase()).toBe("mxapiwo");
    expect(r.selected).toEqual(["wonum", "status"]);
    expect(r.pageSize).toBe(25);
    expect(r.dropped.map((d) => d.toLowerCase())).toEqual(expect.arrayContaining(["lean", "oslc.paging"]));
  });

  it("errors when a URL has no /os/{name}", () => {
    const r = parseImport("https://maximo.example/maximo/oslc/whoami");
    expect(r.ok).toBe(false);
  });
});
