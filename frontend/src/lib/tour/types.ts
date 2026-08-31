/** Tour step and copy types. */
import { TourAction } from "../tourBridge";

export type TourId = "builder" | "wizard";

/** Body class while a walkthrough is running - layout/CSS can freeze motion. */
export const TOUR_BODY = "mqb-touring";

export type TourMark = "done" | "skipped";

/** Three-beat copy: what the panel is, how to use it, what this tour does. */
export type TourCopy = {
  title: string;
  what: string;
  how: string;
  example: string;
};

export type TourStepDef = {
  id: string;
  /** CSS selector, usually `[data-tour="..."]`. */
  target: string;
  copy: TourCopy;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** Block clicks on the highlighted control. */
  lock?: boolean;
  nextLabel?: string;
  /** Next: optional navigation and/or a demo action handled by Builder/Wizard. */
  onNext?: {
    go?: TourId;
    action?: TourAction["action"];
    busy?: string;
    wait?: string;
  };
};

export type TourDef = {
  id: TourId;
  title: string;
  blurb: string;
  steps: TourStepDef[];
};
