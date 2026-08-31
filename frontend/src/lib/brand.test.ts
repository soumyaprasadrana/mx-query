/** Product name and public asset paths. */
import { describe, expect, it } from "vitest";
import { APP_NAME, LOGO_DARK, LOGO_LIGHT, LOGO_SRC } from "./brand";

describe("brand", () => {
  it("ships as mxQuery with SVG marks", () => {
    expect(APP_NAME).toBe("mxQuery");
    expect(LOGO_SRC).toBe("/logo.svg");
    expect(LOGO_LIGHT).toBe("/logo-light.svg");
    expect(LOGO_DARK).toBe("/logo-dark.svg");
  });
});
