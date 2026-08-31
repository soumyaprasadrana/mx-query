/** Admin password gate for LLM config and theme manager. */
import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { adminLogin } from "../../api";
import { ApiError } from "../../types";

export default function AdminLogin({
  onSuccess,
  onClose,
}: {
  onSuccess: () => void;
  onClose: () => void;
}) {
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      await adminLogin(password);
      onSuccess();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return createPortal(
    <div className="settings-overlay" onClick={onClose} role="presentation">
      <div
        className="glass-card settings-card"
        role="dialog"
        aria-labelledby="admin-login-title"
        onClick={(e) => e.stopPropagation()}
      >
        <h2 id="admin-login-title">Admin</h2>
        <p className="muted" style={{ marginTop: 0 }}>
          One shared password for this deployment. Used only to change the Assist provider.
        </p>
        <form className="stack" onSubmit={submit} style={{ marginTop: 16 }}>
          <div>
            <label className="lbl" htmlFor="admin-password">Password</label>
            <input
              id="admin-password"
              className="input-line"
              type="password"
              autoFocus
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>
          {error && <div className="error-box">{error}</div>}
          <div className="row" style={{ justifyContent: "flex-end", marginTop: 4 }}>
            <button type="button" className="ghost" onClick={onClose} disabled={busy}>
              Cancel
            </button>
            <button type="submit" disabled={busy || !password}>
              {busy ? "Signing in..." : "Sign in"}
            </button>
          </div>
        </form>
      </div>
    </div>,
    document.body,
  );
}
