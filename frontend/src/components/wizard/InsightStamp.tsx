/** Rotating Maximo/MCP fact on wizard steps. */
import { motion } from "framer-motion";
import { Insight } from "../../lib/insights";
import {
  Icon,
  faBook,
  faCircleNodes,
  faFilter,
  faFolderTree,
  faLayerGroup,
  faLightbulb,
  faLock,
  faTable,
} from "../Icon";
import type { IconDefinition } from "@fortawesome/fontawesome-svg-core";

const DOODLE: Record<Insight["doodle"], IconDefinition> = {
  stamp: faLayerGroup,
  crane: faFolderTree,
  funnel: faFilter,
  book: faBook,
  sign: faLightbulb,
  warm: faCircleNodes,
  lock: faLock,
  grid: faTable,
};

export default function InsightStamp({ insight }: { insight: Insight }) {
  return (
    <motion.aside
      className="wiz-stamp"
      key={insight.id}
      initial={{ opacity: 0, x: 12 }}
      animate={{ opacity: 1, x: 0 }}
      transition={{ duration: 0.45, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
    >
      <div className="wiz-doodle" aria-hidden>
        <Icon icon={DOODLE[insight.doodle]} />
      </div>
      <p className="wiz-stamp-kicker">Did you know</p>
      <h3>{insight.title}</h3>
      <p>{insight.body}</p>
    </motion.aside>
  );
}
