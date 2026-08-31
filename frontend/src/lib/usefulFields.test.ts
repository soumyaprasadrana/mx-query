/** Suggested columns: CORE + intent tokens, not Assist. */
import { describe, expect, it } from "vitest";
import { FieldInfo } from "../types";
import { intentTokens, mergeFieldNames, usefulFields, usefulOrFallback } from "./usefulFields";

function field(name: string, title = name): FieldInfo {
  return { name, title, type: "ALN" };
}

describe("intentTokens", () => {
  it("keeps tokens longer than two characters", () => {
    expect(intentTokens("PM work orders at site BEDFORD")).toEqual(
      expect.arrayContaining(["work", "orders", "site", "bedford"]),
    );
    expect(intentTokens("PM work orders at site BEDFORD")).not.toContain("pm");
    expect(intentTokens("PM work orders at site BEDFORD")).not.toContain("at");
  });
});

describe("usefulFields", () => {
  const fields = [
    field("wonum", "Work Order"),
    field("status"),
    field("obscureattr", "Obscure"),
    field("priority"),
  ];

  it("ranks CORE fields even with an empty intent", () => {
    const names = usefulFields(fields, "").map((f) => f.name);
    expect(names).toContain("wonum");
    expect(names).toContain("status");
    expect(names).not.toContain("obscureattr");
  });

  it("boosts attributes that overlap the intent over non-CORE noise", () => {
    const local = [field("zzznoise", "Noise"), field("obscureattr", "Obscure")];
    const names = usefulFields(local, "find obscureattr records").map((f) => f.name);
    expect(names[0]).toBe("obscureattr");
    expect(names).not.toContain("zzznoise");
  });
});

describe("usefulOrFallback / mergeFieldNames", () => {
  it("falls back to the first 18 attributes when nothing scores", () => {
    const fields = [field("zzz1"), field("zzz2")];
    expect(usefulOrFallback(fields, "").map((f) => f.name)).toEqual(["zzz1", "zzz2"]);
  });

  it("merges without duplicating", () => {
    expect(mergeFieldNames(["wonum", "status"], ["status", "siteid"])).toEqual(["wonum", "status", "siteid"]);
  });
});
