/** Play the panel sheen animation once on hover. */
const SELECTOR = ".panel-block, .wiz-door, .glass-card";
const seen = new WeakSet<Element>();

/** Play the hover sheen once per node for this page lifetime. */
export function startSheenOnce(): () => void {
  const onOver = (e: PointerEvent) => {
    const t = (e.target as Element | null)?.closest?.(SELECTOR);
    if (!t || seen.has(t)) return;
    const from = e.relatedTarget as Node | null;
    if (from && t.contains(from)) return;
    seen.add(t);
    t.classList.add("sheen-play");
    const stop = () => {
      t.classList.remove("sheen-play");
      t.removeEventListener("animationend", stop);
    };
    t.addEventListener("animationend", stop);
  };
  document.addEventListener("pointerover", onOver, true);
  return () => document.removeEventListener("pointerover", onOver, true);
}
