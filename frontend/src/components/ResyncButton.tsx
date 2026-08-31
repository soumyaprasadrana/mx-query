/** Force MCP metadata resync for the current tenant. */
import { useState } from "react";
import { createPortal } from "react-dom";
import { ApiError } from "../types";
import { resyncTenant } from "../api";
import { Icon, faArrowsRotate } from "./Icon";

export default function ResyncButton({
  tenantId,
  onStarted,
}: {
  tenantId: string;
  onStarted: () => void;
}) {
  const [ask, setAsk] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function go() {
    setBusy(true);
    setError(null);
    try {
      await resyncTenant(tenantId);
      onStarted();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
      setBusy(false);
    }
  }

  return (
    <>
      <button type="button" className="ghost" onClick={() => { setAsk(true); setError(null); }} title="Fully re-sync Maximo metadata">
        <Icon icon={faArrowsRotate} /> Resync
      </button>
      {ask &&
        createPortal(
          <div className="import-overlay" onMouseDown={(e) => { if (e.target === e.currentTarget && !busy) setAsk(false); }}>
            <div className={`import-dialog${error ? " shake" : ""}`}>
              <label className="lbl"><Icon icon={faArrowsRotate} /> Resync metadata</label>
              <p className="muted display-config-blurb">
                This will fully re-sync metadata and briefly disconnect this tenant's connection.
                Anyone mid-query on this tenant will need to retry. Takes a few minutes on large environments.
              </p>
              {error && <p className="error-box" style={{ marginTop: 10 }}>{error}</p>}
              <div className="row" style={{ justifyContent: "flex-end", gap: 8, marginTop: 14 }}>
                <button type="button" className="ghost" disabled={busy} onClick={() => setAsk(false)}>Cancel</button>
                <button type="button" className="go" disabled={busy} onClick={() => void go()}>
                  {busy ? "Starting..." : "Resync"}
                </button>
              </div>
            </div>
          </div>,
          document.body,
        )}
    </>
  );
}
