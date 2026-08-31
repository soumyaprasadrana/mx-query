/** First screen when no tenant is in localStorage. Back from here leaves the site. */
import { useEffect, useState } from "react";
import { motion } from "framer-motion";
import { listTenants } from "../api";
import { ApiError, Tenant } from "../types";
import Brand from "./Brand";
import { APP_NAME, APP_TAGLINE } from "../lib/brand";

export default function TenantPicker({
  onSelect,
  onAddNew,
}: {
  onSelect: (t: Tenant) => void;
  onAddNew: () => void;
}) {
  const [tenants, setTenants] = useState<Tenant[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    listTenants()
      .then(setTenants)
      .catch((err) => setError(err instanceof ApiError ? err.message : String(err)));
  }, []);

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
        <h1>{APP_NAME}</h1>
        <p className="muted" style={{ marginTop: 0 }}>
          {APP_TAGLINE}. Pick a tenant or add a new Maximo connection.
        </p>
        {error && <div className="error-box">{error}</div>}
        {tenants === null && !error && <p className="muted">Loading configured tenants...</p>}
        {tenants !== null && tenants.length === 0 && (
          <p className="muted">No tenants configured yet on this backend.</p>
        )}
        {tenants !== null && tenants.length > 0 && (
          <div className="stack">
            {tenants.map((t) => (
              <button key={t.id} className="tenant-list-btn" onClick={() => onSelect(t)}>
                <strong>{t.name}</strong>
                <div className="muted" style={{ fontSize: "0.75rem", marginTop: 2 }}>
                  {t.url}
                  {t.readonly ? " | read-only" : ""}
                </div>
              </button>
            ))}
          </div>
        )}
        <button onClick={onAddNew} style={{ marginTop: 18, width: "100%" }}>
          + Add new tenant
        </button>
      </motion.div>
    </div>
  );
}
