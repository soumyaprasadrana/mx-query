/** DOM events the tour engine fires into wizard/builder. */
import { ChildRel, FieldInfo, OsSearchResult } from "../types";

export const TOUR_EVENT = "mqb:tour";
export const TOUR_DONE = "mqb:tour-done";

export type TourAction =
  | { action: "demo-os" }
  | { action: "demo-story" }
  | { action: "demo-fields" }
  | { action: "demo-child" }
  | { action: "demo-child-hop" }
  | { action: "demo-where" }
  | { action: "demo-sort" }
  | { action: "demo-display" }
  | { action: "demo-page" }
  | { action: "wiz-start" }
  | { action: "wiz-os" }
  | { action: "wiz-fields" }
  | { action: "wiz-children" }
  | { action: "wiz-child-fields" }
  | { action: "wiz-child-hop" }
  | { action: "wiz-where" }
  | { action: "wiz-sort" }
  | { action: "wiz-display" }
  | { action: "wiz-page" };

export function tourDo(detail: TourAction, timeoutMs = 25000): Promise<void> {
  return new Promise((resolve, reject) => {
    const timer = window.setTimeout(() => {
      document.removeEventListener(TOUR_DONE, onDone);
      reject(new Error("That step took too long - try Next again."));
    }, timeoutMs);
    function onDone(e: Event) {
      window.clearTimeout(timer);
      const d = (e as CustomEvent<{ ok?: boolean; error?: string }>).detail;
      if (d?.ok) resolve();
      else reject(new Error(d?.error || "Could not complete that tour step."));
    }
    document.addEventListener(TOUR_DONE, onDone, { once: true });
    document.dispatchEvent(new CustomEvent(TOUR_EVENT, { detail }));
  });
}

export function tourDone(ok: boolean, error?: string) {
  document.dispatchEvent(new CustomEvent(TOUR_DONE, { detail: { ok, error } }));
}

function isOnScreen(el: Element): boolean {
  const r = el.getBoundingClientRect();
  if (r.width < 2 || r.height < 2) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== "hidden" && style.display !== "none" && style.opacity !== "0";
}

export function waitFor(selector: string, ms: number): Promise<Element> {
  return new Promise((resolve, reject) => {
    const found = () => {
      const el = document.querySelector(selector);
      return el && isOnScreen(el) ? el : null;
    };
    const hit = found();
    if (hit) {
      resolve(hit);
      return;
    }
    const obs = new MutationObserver(() => {
      const el = found();
      if (el) done(el);
    });
    const raf = () => {
      const el = found();
      if (el) done(el);
      else if (!finished) rafId = requestAnimationFrame(raf);
    };
    let finished = false;
    let rafId = 0;
    function done(el: Element) {
      if (finished) return;
      finished = true;
      obs.disconnect();
      cancelAnimationFrame(rafId);
      window.clearTimeout(timer);
      resolve(el);
    }
    obs.observe(document.documentElement, { childList: true, subtree: true, attributes: true });
    rafId = requestAnimationFrame(raf);
    const timer = window.setTimeout(() => {
      if (finished) return;
      finished = true;
      obs.disconnect();
      cancelAnimationFrame(rafId);
      reject(new Error(`Nothing appeared for ${selector}`));
    }, ms);
  });
}

export function pickBestOs(hits: OsSearchResult[]): OsSearchResult | undefined {
  const upper = (s: string | undefined) => (s ?? "").toUpperCase();
  return (
    hits.find((h) => upper(h.osName) === "MXAPIWO")
    ?? hits.find((h) => upper(h.osName) === "MXAPIWORKORDER")
    ?? hits.find((h) => upper(h.primaryObject) === "WORKORDER")
    ?? hits.find((h) => upper(h.osName).includes("APIWO"))
    ?? hits.find((h) => upper(h.osName).includes("WO"))
    ?? hits[0]
  );
}

export function pickNamed(fields: FieldInfo[], names: string[], fallback = 4): string[] {
  const byLower = new Map(fields.map((f) => [f.name.toLowerCase(), f.name]));
  const out: string[] = [];
  for (const n of names) {
    const real = byLower.get(n.toLowerCase());
    if (real && !out.includes(real)) out.push(real);
  }
  if (out.length) return out;
  return fields.slice(0, fallback).map((f) => f.name);
}

export function pickDemoRel(rels: ChildRel[]): ChildRel | undefined {
  const rank = ["ASSET", "TICKET", "WORKORDER", "RELATEDRECORD", "MULTIASSETLOCCI"];
  for (const name of rank) {
    const hit = rels.find((r) => r.relation.toUpperCase() === name || r.objectName.toUpperCase() === name);
    if (hit) return hit;
  }
  return rels.find((r) => r.inOs) ?? rels[0];
}

export function pickDemoHop2(rels: ChildRel[]): ChildRel | undefined {
  const rank = ["ASSET_PARENT", "PARENT", "OPENWO", "ACTIVEASSETMETER", "ASSETMETER", "LOCATION"];
  for (const name of rank) {
    const hit = rels.find((r) => r.relation.toUpperCase() === name || r.objectName.toUpperCase() === name);
    if (hit) return hit;
  }
  return rels[0];
}

export async function busyNext(label: string, run: () => Promise<void>) {
  const btn = document.querySelector<HTMLButtonElement>(".driver-popover-next-btn");
  const prev = btn?.textContent ?? "Next";
  if (btn) {
    btn.disabled = true;
    btn.textContent = label;
  }
  try {
    await run();
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.textContent = prev;
    }
  }
}
