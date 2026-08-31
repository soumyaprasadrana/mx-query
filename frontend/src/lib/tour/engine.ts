/** driver.js step runner + tourBridge actions. */
import { driver, type DriveStep } from "driver.js";
import "driver.js/dist/driver.css";
import { assistOn, setAssistOn } from "../assist";
import { busyNext, tourDo, waitFor } from "../tourBridge";
import { TOUR_BODY, TourDef, TourId, TourStepDef } from "./types";

function explain(copy: TourStepDef["copy"]) {
  return `<p><b>This panel.</b> ${copy.what}</p><p><b>How you use it.</b> ${copy.how}</p><p><b>Example.</b> ${copy.example}</p>`;
}

const RING_CLASS = "tour-run-ring";

function removeRing() {
  document.querySelectorAll(`.${RING_CLASS}`).forEach((n) => {
    (n as HTMLElement & { __stop?: () => void }).__stop?.();
    n.remove();
  });
}

function placeRing(el: Element | undefined, onLayout?: () => void) {
  removeRing();
  if (!(el instanceof HTMLElement)) return;
  const ring = document.createElement("div");
  ring.className = RING_CLASS;
  ring.setAttribute("aria-hidden", "true");
  document.body.appendChild(ring);
  const sync = () => {
    const r = el.getBoundingClientRect();
    const pad = 4;
    ring.style.top = `${Math.round(r.top - pad)}px`;
    ring.style.left = `${Math.round(r.left - pad)}px`;
    ring.style.width = `${Math.round(r.width + pad * 2)}px`;
    ring.style.height = `${Math.round(r.height + pad * 2)}px`;
    const radius = getComputedStyle(el).borderRadius || "12px";
    ring.style.borderRadius = radius === "0px" ? "14px" : radius;
  };
  sync();
  let lastKey = [
    Math.round(el.getBoundingClientRect().top),
    Math.round(el.getBoundingClientRect().left),
    Math.round(el.getBoundingClientRect().width),
    Math.round(el.getBoundingClientRect().height),
  ].join(",");
  let layoutTimer = 0;
  const scheduleLayout = () => {
    window.clearTimeout(layoutTimer);
    layoutTimer = window.setTimeout(() => {
      const r = el.getBoundingClientRect();
      const key = [Math.round(r.top), Math.round(r.left), Math.round(r.width), Math.round(r.height)].join(",");
      sync();
      if (key === lastKey) return;
      lastKey = key;
      onLayout?.();
    }, 50);
  };
  const ro = new ResizeObserver(scheduleLayout);
  ro.observe(el);
  const host = el.closest(".wiz-q");
  if (host && host !== el) ro.observe(host);
  const assist = host?.querySelector(".wiz-assist") ?? el.querySelector(".wiz-assist");
  if (assist) ro.observe(assist);
  window.addEventListener("scroll", sync, true);
  window.addEventListener("resize", sync);
  const stop = () => {
    window.clearTimeout(layoutTimer);
    ro.disconnect();
    window.removeEventListener("scroll", sync, true);
    window.removeEventListener("resize", sync);
  };
  (ring as HTMLElement & { __stop?: () => void }).__stop = stop;
}

function teardownRing() {
  removeRing();
}

function afterPaint(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => requestAnimationFrame(() => resolve()));
  });
}

function settle(): Promise<void> {
  return new Promise((resolve) => {
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        window.setTimeout(resolve, 80);
      });
    });
  });
}

export function startTourEngine(opts: {
  def: TourDef;
  onGo: (id: TourId) => void;
  onFinished: (completed: boolean) => void;
}): { destroy: () => void } {
  const completed = { current: false };
  const wrote = { current: false };
  const savedAssist = assistOn();
  setAssistOn(false);
  document.body.classList.add(TOUR_BODY);
  document.body.classList.remove("mqb-tour-placed");
  let highlightGen = 0;

  function hideChrome() {
    document.body.classList.remove("mqb-tour-placed");
  }

  function showChrome() {
    document.body.classList.add("mqb-tour-placed");
  }

  function finish(done: boolean) {
    if (wrote.current) return;
    wrote.current = true;
    setAssistOn(savedAssist);
    document.body.classList.remove(TOUR_BODY, "mqb-tour-placed");
    teardownRing();
    opts.onFinished(done);
  }

  async function doThenNext(
    d: { moveNext: () => void; refresh: () => void },
    step: TourStepDef,
  ) {
    const n = step.onNext;
    if (!n) {
      d.moveNext();
      return;
    }
    try {
      await busyNext(n.busy ?? step.nextLabel ?? "Next", async () => {
        hideChrome();
        if (n.go) opts.onGo(n.go);
        if (n.action) await tourDo({ action: n.action } as Parameters<typeof tourDo>[0]);
        if (n.wait) await waitFor(n.wait, 20000);
        await settle();
      });
      d.refresh();
      d.moveNext();
    } catch {
      /* stay - Builder/Wizard error box has the reason */
    }
  }

  const steps = opts.def.steps.map((step) => ({
    element: step.target,
    disableActiveInteraction: step.lock === true,
    popover: {
      title: step.copy.title,
      description: explain(step.copy),
      side: step.side ?? "left",
      align: step.align ?? "start",
      ...(step.nextLabel ? { nextBtnText: step.nextLabel } : {}),
      ...(step.onNext
        ? {
            onNextClick: async (_el: Element | undefined, _s: unknown, { driver: drv }: { driver: { moveNext: () => void; refresh: () => void } }) => {
              await doThenNext(drv, step);
            },
          }
        : {}),
    },
  }));

  const overlayColor =
    getComputedStyle(document.documentElement).getPropertyValue("--bg").trim() || "#07090C";

  const inst = driver({
    showProgress: true,
    animate: false,
    duration: 0,
    smoothScroll: false,
    allowClose: true,
    overlayColor,
    overlayOpacity: 0.62,
    stagePadding: 10,
    stageRadius: 14,
    skipMissingElement: true,
    waitForElement: 12000,
    nextBtnText: "Next",
    prevBtnText: "Back",
    doneBtnText: "Done",
    progressText: "{{current}} / {{total}}",
    popoverClass: "driverjs-theme",
    overlayClickBehavior: () => {
      /* keep the tour up while we drive the UI */
    },
    steps: steps as DriveStep[],
    onHighlightStarted: () => {
      highlightGen += 1;
      hideChrome();
    },
    onHighlighted: (el) => {
      const mine = highlightGen;
      placeRing(el ?? undefined, () => {
        if (mine !== highlightGen) return;
        try {
          inst.refresh();
        } catch {
          /* destroyed */
        }
      });
      void afterPaint().then(() => {
        if (mine !== highlightGen) return;
        try {
          inst.refresh();
        } catch {
          /* destroyed */
        }
        showChrome();
      });
    },
    onDestroyed: () => {
      finish(completed.current);
    },
    onPopoverRender: (_el, opts) => {
      const all = opts.config.steps ?? [];
      const idx = opts.state.activeIndex ?? 0;
      if (all.length && idx >= all.length - 1) completed.current = true;
    },
  });

  const t = window.setTimeout(() => inst.drive(), 80);
  return {
    destroy: () => {
      window.clearTimeout(t);
      teardownRing();
      try {
        inst.destroy();
      } catch {
        /* already destroyed */
      }
      if (!wrote.current) {
        wrote.current = true;
        setAssistOn(savedAssist);
        document.body.classList.remove(TOUR_BODY, "mqb-tour-placed");
      }
    },
  };
}
