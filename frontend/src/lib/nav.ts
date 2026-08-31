/**
 * Client-side routes for mxQuery.
 *
 * This is a single-page app. Screens used to live only in React state, so the
 * browser Back button left the site. The History API keeps the URL in sync
 * with the current screen. The backend already serves `index.html` for unknown
 * paths (`_mount_frontend` in app.py); Vite does the same in dev.
 *
 * Tenant id stays in localStorage (`mqb.tenantId`) - it is a session, not a
 * shareable resource. Wizard *steps* are not routed; browser Back from
 * `/wizard` returns to the previous screen (usually home). The wizard has its
 * own in-app Back for steps.
 *
 * Paths:
 *   /                 home (or tenant picker when no session)
 *   /setup            new tenant form
 *   /wizard           guided query
 *   /builder          query builder
 *   /builder/report   saved-query report view
 *   /library          saved queries
 */
export type Screen = "home" | "setup" | "wizard" | "builder" | "library";

export type AppRoute = {
  screen: Screen;
  view?: "builder" | "report";
};

const TITLES: Record<Screen, string> = {
  home: "mxQuery",
  setup: "mxQuery · Connect",
  wizard: "mxQuery · Wizard",
  builder: "mxQuery · Builder",
  library: "mxQuery · Library",
};

/** Custom event so `go()` updates React without waiting for a real popstate. */
export const NAV_EVENT = "mqb:nav";

export function parsePath(pathname: string): AppRoute {
  const p = pathname.replace(/\/+$/, "") || "/";
  switch (p) {
    case "/setup":
      return { screen: "setup" };
    case "/wizard":
      return { screen: "wizard" };
    case "/library":
      return { screen: "library" };
    case "/builder/report":
      return { screen: "builder", view: "report" };
    case "/builder":
      return { screen: "builder" };
    default:
      return { screen: "home" };
  }
}

export function hrefFor(route: AppRoute): string {
  switch (route.screen) {
    case "setup":
      return "/setup";
    case "wizard":
      return "/wizard";
    case "library":
      return "/library";
    case "builder":
      return route.view === "report" ? "/builder/report" : "/builder";
    default:
      return "/";
  }
}

export function currentRoute(): AppRoute {
  return parsePath(location.pathname);
}

export function applyTitle(route: AppRoute = currentRoute()) {
  document.title = route.view === "report" ? "mxQuery · Report" : TITLES[route.screen];
}

export function go(route: AppRoute, mode: "push" | "replace" = "push") {
  const href = hrefFor(route);
  const here = hrefFor(parsePath(location.pathname));
  if (href !== here) {
    if (mode === "replace") history.replaceState(route, "", href);
    else history.pushState(route, "", href);
  }
  applyTitle(route);
  window.dispatchEvent(new Event(NAV_EVENT));
}

/** Subscribe to Back/Forward and to `go()`. Returns an unsubscribe function. */
export function subscribe(fn: () => void): () => void {
  window.addEventListener("popstate", fn);
  window.addEventListener(NAV_EVENT, fn);
  return () => {
    window.removeEventListener("popstate", fn);
    window.removeEventListener(NAV_EVENT, fn);
  };
}
