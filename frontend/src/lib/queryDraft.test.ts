/** Wizard draft -> builder child/related hops. */
import { describe, expect, it } from "vitest";
import { draftToChildChains, draftToRelatedWhere, emptyDraft } from "./queryDraft";
import { ChildRel, WhereCondition } from "../types";

const ASSET: ChildRel = { relation: "ASSET", objectName: "ASSET", inOs: true };

describe("emptyDraft", () => {
  it("starts with pageSize 50 and no OS", () => {
    const d = emptyDraft();
    expect(d.osHit).toBeNull();
    expect(d.pageSize).toBe(50);
    expect(d.orMode).toBe(false);
    expect(d.childChains).toEqual([]);
  });
});

describe("draftToChildChains", () => {
  it("prefers explicit childChains when present", () => {
    const d = emptyDraft();
    d.childChains = [{ hops: [{ relationship: "SITE", objectName: "SITE", selectAll: false, selected: ["siteid"], aliases: {}, searchFields: [], conditions: [] }] }];
    d.childRels = [ASSET];
    expect(draftToChildChains(d)).toBe(d.childChains);
  });

  it("builds a one-hop chain from childRels + selected columns", () => {
    const d = emptyDraft();
    d.childRels = [ASSET];
    d.childSelected = { ASSET: ["assetnum", "status"] };
    d.childSelectAll = { ASSET: false };
    const chains = draftToChildChains(d);
    expect(chains).toHaveLength(1);
    expect(chains[0].hops[0].relationship).toBe("ASSET");
    expect(chains[0].hops[0].selected).toEqual(["assetnum", "status"]);
    expect(chains[0].hops[0].selectAll).toBe(false);
    expect(chains[0].hops[0].searchFields).toEqual(["assetnum", "status"]);
  });
});

describe("draftToRelatedWhere", () => {
  it("returns [] when nothing is filled", () => {
    expect(draftToRelatedWhere(emptyDraft())).toEqual([]);
  });

  it("keeps relatedWhere hops that have a fielded condition", () => {
    const cond: WhereCondition = { field: "status", op: "=", value: "OPERATING" };
    const d = emptyDraft();
    d.relatedWhere = [{
      hops: [{ relationship: "ASSET", objectName: "ASSET", whereClause: "", conditions: [cond] }],
      conditions: [cond],
    }];
    const out = draftToRelatedWhere(d);
    expect(out).toHaveLength(1);
    expect(out[0].hops[0].relationship).toBe("ASSET");
  });

  it("falls back to the legacy relatedRel hop", () => {
    const d = emptyDraft();
    d.relatedRel = ASSET;
    d.relatedConds = [{ field: "assetnum", op: "=", value: "1000" }];
    const out = draftToRelatedWhere(d);
    expect(out).toHaveLength(1);
    expect(out[0].hops[0].relationship).toBe("ASSET");
    expect(out[0].conditions[0].field).toBe("assetnum");
  });
});
