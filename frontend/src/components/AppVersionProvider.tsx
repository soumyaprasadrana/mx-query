/** Fetches GET /api/version once. Chrome reads this; do not hardcode 1.2.0. */
import { createContext, useContext, useEffect, useState, type ReactNode } from "react";
import { getAppVersion } from "../api";
import { AppVersionInfo, parseAppVersion } from "../lib/appVersion";

const Ctx = createContext<AppVersionInfo | null>(null);

export function AppVersionProvider({ children }: { children: ReactNode }) {
  const [info, setInfo] = useState<AppVersionInfo | null>(null);

  useEffect(() => {
    let cancelled = false;
    getAppVersion()
      .then((raw) => {
        const parsed = parseAppVersion(raw);
        if (cancelled || !parsed) return;
        setInfo(parsed);
        const mcp = parsed.mcpServer
          ? ` ${parsed.mcpServer.package}@${parsed.mcpServer.version}`
          : "";
        console.info(`[${parsed.name}] v${parsed.version}${mcp}`);
      })
      .catch(() => {
        /* chrome stays blank if the proxy is down */
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return <Ctx.Provider value={info}>{children}</Ctx.Provider>;
}

export function useAppVersion(): AppVersionInfo | null {
  return useContext(Ctx);
}
