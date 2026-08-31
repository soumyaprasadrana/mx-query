/** Phase bar: Start through Finish. */
import { motion } from "framer-motion";
import { Icon, faCheck } from "../Icon";

export type WizardPhaseId = "start" | "os" | "columns" | "children" | "where" | "filters" | "finish";

export function wizardPhaseId(step: string): WizardPhaseId {
  if (step === "intent" || step === "saved") return "start";
  if (step === "os" || step === "savedPick") return "os";
  if (step === "fields") return "columns";
  if (step === "children" || step === "childFields" || step === "childHopNext" || step === "childHopPick") {
    return "children";
  }
  if (
    step === "parentWhere"
    || step === "relatedWant"
    || step === "relatedPick"
    || step === "relatedNext"
    || step === "relatedConds"
  ) {
    return "where";
  }
  if (step.startsWith("childFilter")) return "filters";
  if (step.startsWith("display")) return "finish";
  return "finish";
}

export function wizardPhases(hasChildren: boolean): { id: WizardPhaseId; label: string }[] {
  return [
    { id: "start", label: "Start" },
    { id: "os", label: "Structure" },
    { id: "columns", label: "Columns" },
    { id: "children", label: "Children" },
    { id: "where", label: "Where" },
    ...(hasChildren ? [{ id: "filters" as const, label: "Filters" }] : []),
    { id: "finish", label: "Finish" },
  ];
}

export default function WizProgress({
  phase,
  phases,
  detail,
}: {
  phase: WizardPhaseId;
  phases: { id: WizardPhaseId; label: string }[];
  detail?: string;
}) {
  const idx = Math.max(0, phases.findIndex((p) => p.id === phase));
  const pct = phases.length ? ((idx + 1) / phases.length) * 100 : 0;
  return (
    <div className="wiz-progress">
      <div className="wiz-progress-bar" aria-hidden>
        <motion.span
          initial={false}
          animate={{ width: `${pct}%` }}
          transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
        />
      </div>
      <ol className="wiz-progress-steps">
        {phases.map((p, i) => (
          <motion.li
            key={p.id}
            className={`wiz-progress-step${i < idx ? " done" : ""}${i === idx ? " on" : ""}`}
            animate={{ scale: i === idx ? 1.04 : 1, opacity: i === idx || i < idx ? 1 : 0.55 }}
            transition={{ duration: 0.28 }}
          >
            {i < idx ? <><Icon icon={faCheck} /> {p.label}</> : p.label}
          </motion.li>
        ))}
      </ol>
      {detail && (
        <motion.p
          key={detail}
          className="wiz-progress-detail"
          initial={{ opacity: 0, y: 4 }}
          animate={{ opacity: 1, y: 0 }}
        >
          {detail}
        </motion.p>
      )}
    </div>
  );
}
