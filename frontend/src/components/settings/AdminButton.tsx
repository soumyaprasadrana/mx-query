/** Opens Settings; shows admin login when the session is cold. */
import { useState } from "react";
import { useAdmin } from "./AdminProvider";
import AdminLogin from "./AdminLogin";
import LLMSettings from "./LLMSettings";
import { Icon, faGear, faLock } from "../Icon";

export default function AdminButton() {
  const { session, setAuthenticated, refreshLLM } = useAdmin();
  const [open, setOpen] = useState<"login" | "settings" | null>(null);

  if (!session?.enabled) return null;

  return (
    <>
      {session.authenticated ? (
        <button type="button" className="ghost" onClick={() => setOpen("settings")}>
          <Icon icon={faGear} /> Settings
        </button>
      ) : (
        <button type="button" className="ghost" onClick={() => setOpen("login")}>
          <Icon icon={faLock} /> Admin
        </button>
      )}
      {open === "login" && (
        <AdminLogin
          onClose={() => setOpen(null)}
          onSuccess={() => {
            setAuthenticated(true);
            setOpen(null);
          }}
        />
      )}
      {open === "settings" && (
        <LLMSettings
          onClose={() => setOpen(null)}
          onLogout={() => {
            setAuthenticated(false);
            setOpen(null);
          }}
          onSaved={() => {
            void refreshLLM();
          }}
        />
      )}
    </>
  );
}
