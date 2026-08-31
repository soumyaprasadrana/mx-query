/** Route table: URL <-> screen. No Maximo. */
import { afterEach, describe, expect, it } from "vitest";
import { applyTitle, go, hrefFor, NAV_EVENT, parsePath, subscribe, type AppRoute } from "./nav";

const SCREENS: AppRoute[] = [
  { screen: "home" },
  { screen: "setup" },
  { screen: "wizard" },
  { screen: "library" },
  { screen: "builder" },
  { screen: "builder", view: "report" },
];

describe("parsePath / hrefFor", () => {
  it("round-trips every studio path", () => {
    for (const route of SCREENS) {
      expect(parsePath(hrefFor(route))).toEqual(route);
    }
  });

  it("strips trailing slashes", () => {
    expect(parsePath("/wizard/")).toEqual({ screen: "wizard" });
    expect(parsePath("/builder/report/")).toEqual({ screen: "builder", view: "report" });
  });

  it("unknown paths are home (picker or studio)", () => {
    expect(parsePath("/nope")).toEqual({ screen: "home" });
    expect(parsePath("")).toEqual({ screen: "home" });
  });
});

describe("go / subscribe", () => {
  afterEach(() => {
    history.replaceState(null, "", "/");
    document.title = "";
  });

  it("applyTitle uses the report title when view is report", () => {
    applyTitle({ screen: "builder", view: "report" });
    expect(document.title).toBe("mxQuery · Report");
    applyTitle({ screen: "wizard" });
    expect(document.title).toBe("mxQuery · Wizard");
  });

  it("push then replace updates the path and notifies subscribers", () => {
    const seen: string[] = [];
    const stop = subscribe(() => seen.push(location.pathname));
    go({ screen: "wizard" });
    expect(location.pathname).toBe("/wizard");
    go({ screen: "builder", view: "report" }, "replace");
    expect(location.pathname).toBe("/builder/report");
    expect(seen.length).toBeGreaterThanOrEqual(2);
    stop();
    window.dispatchEvent(new Event(NAV_EVENT));
    expect(seen.length).toBeGreaterThanOrEqual(2);
  });
});
