/** MCP spawn + metadata sync. Not a URL - replacing here would pollute history. */
import { useEffect, useRef, useState } from "react";
import { motion } from "framer-motion";
import { deleteTenant, getTenantStatus } from "../api";
import { Tenant, TenantStatus } from "../types";
import Brand from "./Brand";

export default function Warmup({
  tenant,
  onReady,
  onCancel,
  variant = "create",
}: {
  tenant: Tenant;
  onReady: () => void;
  onCancel: () => void;
  variant?: "create" | "resync";
}) {
  const [status, setStatus] = useState<TenantStatus | null>(null);
  const [cancelling, setCancelling] = useState(false);
  const [msg, setMsg] = useState(variant === "resync" ? "Starting forced metadata resync..." : "Starting...");
  const [msgIn, setMsgIn] = useState(true);
  const timer = useRef<number | undefined>(undefined);
  const started = useRef(Date.now());
  const sawWork = useRef(false);

  useEffect(() => {
    let cancelled = false;
    async function poll() {
      try {
        const s = await getTenantStatus(tenant.id);
        if (cancelled) return;
        setStatus(s);
        const next = s.message ?? (variant === "resync" ? "Re-syncing..." : "Starting...");
        setMsg((prev) => {
          if (prev === next) return prev;
          setMsgIn(false);
          window.setTimeout(() => {
            setMsg(next);
            setMsgIn(true);
          }, 180);
          return prev;
        });
        if (s.state === "loading" || s.state === "not_started") sawWork.current = true;
        if (s.state === "ready") {
          const staleFirst = variant === "resync" && !sawWork.current && Date.now() - started.current < 4000;
          if (!staleFirst) {
            onReady();
            return;
          }
        }
      } catch {
        /* keep polling */
      }
      timer.current = window.setTimeout(poll, 2000);
    }
    poll();
    return () => {
      cancelled = true;
      window.clearTimeout(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tenant.id, variant]);

  async function cancel() {
    if (variant === "resync") {
      onCancel();
      return;
    }
    setCancelling(true);
    try {
      await deleteTenant(tenant.id);
    } finally {
      onCancel();
    }
  }

  const pct = status?.percentage;

  return (
    <div className="center-screen">
      <motion.div
        className="glass-card"
        initial={{ opacity: 0, y: 12 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      >
        <div className="wiz-brand picker-brand">
          <Brand />
        </div>
        <h2>{variant === "resync" ? `Re-syncing "${tenant.name}"` : `Syncing "${tenant.name}"`}</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          {variant === "resync"
            ? "Full metadata re-sync against Maximo. This tenant's live connection is briefly disconnected."
            : "First-time metadata sync - a few minutes on small environments, 20-30+ on large ones (this fetches a schema per object structure)."}
        </p>
        <div className="progress-track">
          <div
            className={`progress-fill${pct == null ? " indeterminate" : ""}`}
            style={pct != null ? { width: `${Math.min(100, Math.max(0, pct))}%` } : undefined}
          />
        </div>
        <p className={`warmup-msg${msgIn ? "" : " out"}`}>
          {msg}
          {status?.stage ? ` (${status.stage})` : ""}
        </p>
        {status?.object_structures != null && (
          <p className="muted">{status.object_structures} object structures indexed so far</p>
        )}
        {status?.state === "error" && <div className="error-box">{status?.message ?? "Metadata sync failed."}</div>}
        <button className="secondary" onClick={() => void cancel()} disabled={cancelling} style={{ marginTop: 16 }}>
          {variant === "resync"
            ? "Back - sync continues"
            : cancelling
              ? "Cancelling..."
              : "Cancel / remove tenant"}
        </button>
      </motion.div>
    </div>
  );
}
