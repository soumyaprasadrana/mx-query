/** Admin session cookie/token for settings routes. */
import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import { getAdminSession, getLLMConfig } from "../../api";
import { AdminSession, LLMConfigStatus } from "../../types";

const EMPTY_LLM: LLMConfigStatus = {
  configured: false,
  provider: null,
  model: null,
  apiBaseSet: false,
  source: null,
};

type AdminCtx = {
  llm: LLMConfigStatus | null;
  session: AdminSession | null;
  llmConfigured: boolean;
  setAuthenticated: (v: boolean) => void;
  refreshLLM: () => Promise<LLMConfigStatus>;
};

const Ctx = createContext<AdminCtx | null>(null);

export function AdminProvider({ children }: { children: ReactNode }) {
  const [llm, setLlm] = useState<LLMConfigStatus | null>(null);
  const [session, setSession] = useState<AdminSession | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [llmRes, sessRes] = await Promise.allSettled([getLLMConfig(), getAdminSession()]);
      if (cancelled) return;
      setLlm(llmRes.status === "fulfilled" ? llmRes.value : EMPTY_LLM);
      setSession(
        sessRes.status === "fulfilled"
          ? sessRes.value
          : { enabled: false, authenticated: false },
      );
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const setAuthenticated = useCallback((v: boolean) => {
    setSession((s) => (s ? { ...s, authenticated: v } : { enabled: true, authenticated: v }));
  }, []);

  const refreshLLM = useCallback(async () => {
    const next = await getLLMConfig();
    setLlm(next);
    return next;
  }, []);

  const value = useMemo<AdminCtx>(
    () => ({
      llm,
      session,
      llmConfigured: !!llm?.configured,
      setAuthenticated,
      refreshLLM,
    }),
    [llm, session, setAuthenticated, refreshLLM],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useAdmin(): AdminCtx {
  const v = useContext(Ctx);
  if (!v) throw new Error("useAdmin must be used within AdminProvider");
  return v;
}
