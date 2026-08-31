import { useEffect } from "react";
import { startSheenOnce } from "../lib/sheenOnce";

/** Static CSS orbs + a throttled cursor wash. No canvas, no rAF loop. */
export default function Atmosphere() {
  useEffect(() => {
    const root = document.documentElement;
    const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");
    let last = 0;
    const onMove = (e: PointerEvent) => {
      if (reduce.matches) return;
      const now = performance.now();
      if (now - last < 80) return;
      last = now;
      root.style.setProperty("--spot-x", `${Math.round(e.clientX)}px`);
      root.style.setProperty("--spot-y", `${Math.round(e.clientY)}px`);
    };
    window.addEventListener("pointermove", onMove, { passive: true });
    const stopSheen = startSheenOnce();
    return () => {
      window.removeEventListener("pointermove", onMove);
      stopSheen();
    };
  }, []);

  return (
    <div className="atmosphere" aria-hidden>
      <span className="atmosphere-orb o1" />
      <span className="atmosphere-orb o2" />
      <span className="atmosphere-orb o3" />
      <span className="atmosphere-spot" />
      <span className="atmosphere-vignette" />
    </div>
  );
}
