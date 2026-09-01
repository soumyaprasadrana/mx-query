/** Animated import progress chips while hydrateImport runs. */
import { ImportOk } from "../../lib/oslcImport";
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";

export interface FlightChip {
  id: string;
  label: string;
  target: string;
}

export function chipsFromImport(h: ImportOk): FlightChip[] {
  const chips: FlightChip[] = [];
  if (h.osName) chips.push({ id: "os", label: h.osName, target: "os" });
  const shown = h.selected.slice(0, 6);
  for (const f of shown) {
    const alias = h.aliases[f];
    chips.push({ id: `f-${f}`, label: alias ? `${f} -> ${alias}` : f, target: "fields" });
  }
  if (h.selected.length > 6) {
    chips.push({ id: "f-more", label: `+${h.selected.length - 6} fields`, target: "fields" });
  }
  if (h.selectAll) chips.push({ id: "star", label: "select *", target: "fields" });
  if (h.extraSelect.length) {
    chips.push({
      id: "extra",
      label: h.extraSelect.length === 1 ? h.extraSelect[0].slice(0, 40) : `+${h.extraSelect.length} nested`,
      target: "fields",
    });
  }
  if (h.where.length) chips.push({ id: "where", label: `${h.where.length} where`, target: "where" });
  if (h.relatedWhere?.length) {
    for (const filter of h.relatedWhere.slice(0, 3)) {
      const name = filter.hops.map((hop) => hop.relationship).filter(Boolean).join(" -> ");
      if (name) chips.push({ id: `rw-${name}`, label: name, target: "where" });
    }
  }
  for (const chain of h.chains.slice(0, 4)) {
    const name = chain.hops.map((hop) => hop.relationship).join(" -> ");
    if (name) chips.push({ id: `c-${name}`, label: name, target: "child" });
  }
  if (h.searchTerms) chips.push({ id: "st", label: `search "${h.searchTerms}"`, target: "search" });
  if (h.pageSize) chips.push({ id: "ps", label: `page ${h.pageSize}`, target: "pagesize" });
  if (h.sortRules.length) chips.push({ id: "sort", label: "orderBy", target: "sort" });
  if (Object.values(h.displayFlatten ?? {}).some((f) => f.length)) {
    chips.push({ id: "display", label: "display", target: "display" });
  }
  if ((h.displayReport?.kpis.length ?? 0) + (h.displayReport?.charts.length ?? 0) > 0) {
    chips.push({ id: "report", label: "charts", target: "report" });
  }
  if (h.displayTable && (h.displayTable.header || h.displayTable.columns.length || h.displayTable.rules.length)) {
    chips.push({ id: "table", label: "table view", target: "table" });
  }
  return chips.slice(0, 14);
}

export default function ImportFlight({
  origin,
  chips,
  onDone,
}: {
  origin: DOMRect;
  chips: FlightChip[];
  onDone: () => void;
}) {
  const [ready, setReady] = useState(false);
  const doneRef = useRef(onDone);
  doneRef.current = onDone;
  const [items, setItems] = useState<
    { chip: FlightChip; x: number; y: number; dx: number; dy: number; delay: number }[]
  >([]);

  useLayoutEffect(() => {
    const startX = origin.left + origin.width / 2;
    const startY = origin.top + origin.height / 3;
    const next = chips.map((chip, i) => {
      const el = document.querySelector(`[data-flight="${chip.target}"]`);
      const r = el?.getBoundingClientRect();
      const tx = r ? r.left + Math.min(120, r.width / 2) : Math.max(40, startX - 420);
      const ty = r ? r.top + 18 : startY;
      return {
        chip,
        x: startX + (i % 5) * 10 - 20,
        y: startY + Math.floor(i / 5) * 8,
        dx: tx - startX,
        dy: ty - startY,
        delay: 80 + i * 70,
      };
    });
    setItems(next);
    const ids = new Set(chips.map((c) => c.target));
    for (const id of ids) {
      document.querySelector(`[data-flight="${id}"]`)?.classList.add("flight-catch");
    }
    requestAnimationFrame(() => setReady(true));
    const doneAt = 80 + chips.length * 70 + 900;
    const t = window.setTimeout(() => {
      for (const id of ids) {
        document.querySelector(`[data-flight="${id}"]`)?.classList.remove("flight-catch");
      }
      doneRef.current();
    }, doneAt);
    return () => {
      window.clearTimeout(t);
      for (const id of ids) {
        document.querySelector(`[data-flight="${id}"]`)?.classList.remove("flight-catch");
      }
    };
  }, [chips, origin]);

  return createPortal(
    <div className="flight-layer" aria-hidden>
      {items.map((it) => (
        <span
          key={it.chip.id}
          className={`flight-chip${ready ? " go" : ""}`}
          style={{
            left: it.x,
            top: it.y,
            ["--dx" as string]: `${it.dx}px`,
            ["--dy" as string]: `${it.dy}px`,
            animationDelay: `${it.delay}ms`,
          }}
        >
          {it.chip.label}
        </span>
      ))}
    </div>,
    document.body,
  );
}
