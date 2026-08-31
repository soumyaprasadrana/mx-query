/** GET /api/version payload. No network. */
import { describe, expect, it } from "vitest";
import { mcpSpecLabel, parseAppVersion } from "./appVersion";

const SAMPLE = {
  name: "mxQuery",
  version: "1.2.0",
  mcpServer: { package: "@soumyaprasadrana/maximo-mcp-server", version: "1.4.6" },
};

describe("parseAppVersion", () => {
  it("accepts the public payload", () => {
    expect(parseAppVersion(SAMPLE)).toEqual(SAMPLE);
  });

  it("drops a payload with no name or version", () => {
    expect(parseAppVersion({ version: "1.2.0" })).toBeNull();
    expect(parseAppVersion({ name: "mxQuery" })).toBeNull();
    expect(parseAppVersion(null)).toBeNull();
  });

  it("keeps mcpServer optional", () => {
    expect(parseAppVersion({ name: "mxQuery", version: "1.2.0" })).toEqual({
      name: "mxQuery",
      version: "1.2.0",
      mcpServer: null,
    });
  });
});

describe("mcpSpecLabel", () => {
  it("joins package and version", () => {
    expect(mcpSpecLabel(SAMPLE.mcpServer)).toBe(
      "@soumyaprasadrana/maximo-mcp-server@1.4.6",
    );
  });
});
