/** Active theme pack in React; mirrors CSS variables on :root. */
import { createContext, ReactNode, useCallback, useContext, useEffect, useState } from "react";
import { getTheme } from "../../api";
import { IRIS, OOTB_PACKS, ThemePack, THEME_EVENT, applyPack, parsePack, readStoredPack } from "../../lib/theme";

type ThemeCtx = {
  pack: ThemePack;
  setPack: (pack: ThemePack) => void;
  packs: ThemePack[];
  source: "browser" | "server";
  setSource: (s: "browser" | "server") => void;
};

const Ctx = createContext<ThemeCtx | null>(null);

export function ThemeProvider({ children }: { children: ReactNode }) {
  const [pack, setPackState] = useState<ThemePack>(() => readStoredPack() ?? IRIS);
  const [source, setSource] = useState<"browser" | "server">("browser");

  const setPack = useCallback((next: ThemePack) => {
    applyPack(next);
    setPackState(next);
  }, []);

  useEffect(() => {
    const onChange = (e: Event) => {
      const detail = (e as CustomEvent<ThemePack>).detail;
      if (detail) setPackState(detail);
    };
    window.addEventListener(THEME_EVENT, onChange);
    return () => window.removeEventListener(THEME_EVENT, onChange);
  }, []);

  useEffect(() => {
    let cancelled = false;
    getTheme()
      .then((res) => {
        if (cancelled || !res?.pack) return;
        const parsed = parsePack(res.pack);
        if (!parsed) return;
        applyPack(parsed);
        setPackState(parsed);
        setSource("server");
      })
      .catch(() => {
        /* 404 / offline - localStorage already applied */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <Ctx.Provider value={{ pack, setPack, packs: OOTB_PACKS, source, setSource }}>
      {children}
    </Ctx.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useTheme needs ThemeProvider");
  return ctx;
}
