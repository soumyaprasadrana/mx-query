/** Home doors: Wizard, Builder, Saved Queries. Brand mark goes here, not a route of its own. */
import { useState } from "react";
import { motion } from "framer-motion";
import { Tenant } from "../../types";
import Brand from "../Brand";
import { pickInsight } from "../../lib/insights";
import ResyncButton from "../ResyncButton";
import ThemeToggle from "../ThemeToggle";
import AdminButton from "../settings/AdminButton";
import InsightStamp from "./InsightStamp";
import { Icon, faArrowRightArrowLeft, faBookmark, faLightbulb, faListCheck, faSliders } from "../Icon";

export default function WizardHome({
  tenant,
  onWizard,
  onBuilder,
  onLibrary,
  onSwitchTenant,
  onResync,
  onTour,
}: {
  tenant: Tenant;
  onWizard: () => void;
  onBuilder: () => void;
  onLibrary: () => void;
  onSwitchTenant: () => void;
  onResync: () => void;
  onTour?: () => void;
}) {
  const [insight] = useState(() => pickInsight());
  return (
    <div className="wiz-root wiz-home">
      <header className="wiz-top">
        <div className="wiz-brand">
          <Brand />
          <span className="muted"> | {tenant.name}</span>
        </div>
        <div className="wiz-top-actions">
          {onTour && (
            <button type="button" className="ghost" onClick={onTour}>
              <Icon icon={faLightbulb} /> Tour
            </button>
          )}
          <AdminButton />
          <ThemeToggle />
          <ResyncButton tenantId={tenant.id} onStarted={onResync} />
          <button type="button" className="ghost" onClick={onSwitchTenant}>
            <Icon icon={faArrowRightArrowLeft} /> Switch
          </button>
        </div>
      </header>
      <motion.main
        className="wiz-home-main"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5, ease: [0.22, 1, 0.36, 1] }}
      >
        <p className="wiz-kicker">mxQuery</p>
        <h1 className="wiz-display">What do you want to do?</h1>
        <div className="wiz-doors">
          <motion.button
            type="button"
            className="wiz-door"
            data-tour="door-wizard"
            onClick={onWizard}
            whileHover={{ y: -6, scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <span className="wiz-door-kicker"><Icon icon={faListCheck} /> Guided</span>
            <span className="wiz-door-title">Wizard</span>
            <span className="wiz-door-copy">One question at a time. A query, as a story.</span>
          </motion.button>
          <motion.button
            type="button"
            className="wiz-door alt"
            data-tour="door-builder"
            onClick={onBuilder}
            whileHover={{ y: -6, scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <span className="wiz-door-kicker"><Icon icon={faSliders} /> Console</span>
            <span className="wiz-door-title">Builder</span>
            <span className="wiz-door-copy">Every knob. Nested rel. Live execute.</span>
          </motion.button>
          <motion.button
            type="button"
            className="wiz-door lib"
            data-tour="door-library"
            onClick={onLibrary}
            whileHover={{ y: -6, scale: 1.015 }}
            whileTap={{ scale: 0.985 }}
            transition={{ type: "spring", stiffness: 380, damping: 28 }}
          >
            <span className="wiz-door-kicker"><Icon icon={faBookmark} /> Library</span>
            <span className="wiz-door-title">Saved Queries</span>
            <span className="wiz-door-copy">Open as Builder or Results. Display and color rules travel with it.</span>
          </motion.button>
        </div>
      </motion.main>
      <InsightStamp insight={insight} />
    </div>
  );
}
