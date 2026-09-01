/** parseImport: tool-call JSON and OSLC GET URLs. No live Maximo. */
import { describe, expect, it } from "vitest";
import { hydrateImport, parseImport } from "./oslcImport";
import { ChildRel, FieldInfo } from "../types";
import { TOUR_QUERY } from "./tour/example";

function field(name: string): FieldInfo {
  return { name, title: name, type: "ALN" };
}

const PARENT_FIELDS = ["istask", "historyflag", "assetnum", "worktype", "wonum"].map(field);
const ASSET: ChildRel = { relation: "ASSET", objectName: "ASSET", inOs: true };
const ASSET_PARENT: ChildRel = { relation: "ASSET_PARENT", objectName: "ASSET", inOs: false };

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

describe("hydrateImport related WHERE", () => {
  it("unfolds asset.priority into FILTER PARENTS BY RELATED", () => {
    const parsed = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: { fields: ["wonum"] },
      where: {
        conditions: [
          { field: "istask", op: "=", value: "0" },
          { field: "asset.priority", op: "=", value: "2" },
        ],
      },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const h = hydrateImport(parsed, PARENT_FIELDS, [ASSET], [ASSET]);
    expect(h.where.map((c) => c.field)).toEqual(["istask"]);
    expect(h.relatedWhere).toHaveLength(1);
    const filter = h.relatedWhere![0];
    expect(filter.hops.map((hop) => hop.relationship)).toEqual(["ASSET"]);
    expect(filter.hops[0].conditions).toEqual([
      { field: "priority", op: "=", value: "2" },
    ]);
  });

  it("merges two dotted conditions on the same hop", () => {
    const parsed = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: { fields: ["wonum"] },
      where: {
        conditions: [
          { field: "asset.priority", op: "=", value: "2" },
          { field: "asset.status", op: "=", value: "OPERATING" },
        ],
      },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const h = hydrateImport(parsed, PARENT_FIELDS, [ASSET], [ASSET]);
    expect(h.where).toEqual([]);
    expect(h.relatedWhere).toHaveLength(1);
    expect(h.relatedWhere![0].hops[0].conditions?.map((c) => c.field)).toEqual(["priority", "status"]);
  });

  it("unfolds a nested hop using select chains when compact has only the first rel", () => {
    const parsed = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: { fields: ["wonum", "rel.ASSET{priority,rel.ASSET_PARENT{priority}}"] },
      where: { conditions: [{ field: "asset.asset_parent.priority", op: "=", value: "2" }] },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const h = hydrateImport(parsed, PARENT_FIELDS, [ASSET], [ASSET]);
    expect(h.where).toEqual([]);
    expect(h.relatedWhere).toHaveLength(1);
    expect(h.relatedWhere![0].hops.map((hop) => hop.relationship.toUpperCase())).toEqual([
      "ASSET",
      "ASSET_PARENT",
    ]);
    expect(h.relatedWhere![0].hops[1].conditions).toEqual([
      { field: "priority", op: "=", value: "2" },
    ]);
  });

  it("keeps an unresolved dotted path on parent WHERE", () => {
    const parsed = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: { fields: ["wonum"] },
      where: { conditions: [{ field: "notarel.priority", op: "=", value: "2" }] },
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const h = hydrateImport(parsed, PARENT_FIELDS, [ASSET], [ASSET]);
    expect(h.relatedWhere).toEqual([]);
    expect(h.where).toEqual([{ field: "notarel.priority", op: "=", value: "2" }]);
  });

  it("still applies childOptions WHERE onto the nested OPENWO hop", () => {
    const parsed = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: {
        fields: ["wonum", "rel.ASSET{assetnum,rel.ASSET_PARENT{assetnum,rel.OPENWO{wonum,istask}}}"],
      },
      where: { conditions: [{ field: "asset.priority", op: "=", value: "2" }] },
      childOptions: [
        {
          relationship: "OPENWO",
          path: ["ASSET", "ASSET_PARENT", "OPENWO"],
          where: { conditions: [{ field: "istask", op: "=", value: "0" }] },
        },
      ],
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const h = hydrateImport(parsed, PARENT_FIELDS, [ASSET, ASSET_PARENT], [ASSET]);
    expect(h.relatedWhere?.[0].hops[0].conditions?.[0].field).toBe("priority");
    const openwo = h.chains
      .flatMap((c) => c.hops)
      .find((hop) => hop.relationship.toUpperCase() === "OPENWO");
    expect(openwo?.conditions).toEqual([{ field: "istask", op: "=", value: "0" }]);
  });

  it("applies imported childOptions.limit onto the matching hop", () => {
    const parsed = parseImport(JSON.stringify({
      osName: "MXAPIWO",
      opAction: "query",
      select: { fields: ["wonum", "rel.ASSET{assetnum,rel.OPENWO{wonum}}"] },
      childOptions: [
        { relationship: "OPENWO", path: ["ASSET", "OPENWO"], limit: 200 },
      ],
    }));
    expect(parsed.ok).toBe(true);
    if (!parsed.ok) return;
    const h = hydrateImport(parsed, PARENT_FIELDS, [ASSET], [ASSET]);
    const openwo = h.chains.flatMap((c) => c.hops).find((hop) => hop.relationship.toUpperCase() === "OPENWO");
    expect(openwo?.limit).toBe(200);
  });
});
