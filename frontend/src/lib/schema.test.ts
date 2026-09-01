import { describe, expect, it } from "vitest";
import {
  DEFAULT_CHILD_LIMIT,
  childLimitOf,
  childOptionsFromChains,
  emptyHop,
  withChildOptionLimit,
} from "./schema";
import { ChildChain } from "../types";

const asset = emptyHop({ relation: "ASSET", objectName: "ASSET", inOs: true });
const openwo = emptyHop({ relation: "OPENWO", objectName: "WORKORDER", inOs: false });

describe("childOptionsFromChains", () => {
  it("emits limit 50 on every hop, including hops with no WHERE", () => {
    const chains: ChildChain[] = [{ hops: [asset, openwo] }];
    expect(childOptionsFromChains(chains)).toEqual([
      { relationship: "ASSET", limit: 50 },
      { relationship: "OPENWO", path: ["ASSET", "OPENWO"], limit: 50 },
    ]);
  });

  it("keeps a custom limit and sends noLimit instead when the cap is off", () => {
    const hop = { ...openwo, limit: 200, conditions: [{ field: "istask", op: "=" as const, value: "0" }] };
    expect(childOptionsFromChains([{ hops: [hop] }])).toEqual([
      {
        relationship: "OPENWO",
        where: { conditions: [{ field: "istask", op: "=", value: "0" }] },
        limit: 200,
      },
    ]);
    expect(childOptionsFromChains([{ hops: [{ ...hop, noLimit: true }] }])).toEqual([
      {
        relationship: "OPENWO",
        where: { conditions: [{ field: "istask", op: "=", value: "0" }] },
        noLimit: true,
      },
    ]);
  });
});

describe("childLimitOf", () => {
  it("falls back to 50 when a hop has no limit yet", () => {
    expect(childLimitOf({})).toBe(DEFAULT_CHILD_LIMIT);
    expect(withChildOptionLimit({ relationship: "ASSET" })).toEqual({
      relationship: "ASSET",
      limit: 50,
    });
  });
});
