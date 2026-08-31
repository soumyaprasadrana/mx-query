/** Tour localStorage mark and re-exports. */
import { TourMark, TOUR_BODY } from "./types";

export { BUILDER_TOUR, WIZARD_TOUR, TOURS, EXAMPLE } from "./catalog";
export { startTourEngine } from "./engine";
export type { TourId, TourMark, TourDef, TourStepDef, TourCopy } from "./types";
export { TOUR_BODY } from "./types";

export const TOUR_KEY = "mqb.walkthrough";

export function isTouring(): boolean {
  return typeof document !== "undefined" && document.body.classList.contains(TOUR_BODY);
}

export function readTourMark(): TourMark | null {
  try {
    const v = localStorage.getItem(TOUR_KEY);
    return v === "done" || v === "skipped" ? v : null;
  } catch {
    return null;
  }
}

export function writeTourMark(v: TourMark) {
  try {
    localStorage.setItem(TOUR_KEY, v);
  } catch {
    /* quota / private mode */
  }
}
