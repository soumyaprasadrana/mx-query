/** Object-structure search, live execute, home, tenant switch. */
import { useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { OsSearchResult, Tenant } from "../../types";
import { menuPosition } from "../../lib/portalMenu";
import ThemeToggle from "../ThemeToggle";
import AdminButton from "../settings/AdminButton";
import ResyncButton from "../ResyncButton";
import { Icon, faArrowRightArrowLeft, faHouse } from "../Icon";
import VersionStamp from "../VersionStamp";

export default function TopBar({
  tenant,
  mcpConnected,
  query,
  searching,
  results,
  osName,
  focused,
  onQuery,
  onSearch,
  onPick,
  onFocus,
  onBlur,
  live,
  onLive,
  onSwitchTenant,
  onResync,
  onHome,
  chrome = "full",
  title,
}: {
  tenant: Tenant;
  mcpConnected: boolean | null;
  query: string;
  searching: boolean;
  results: OsSearchResult[];
  osName: string | null;
  focused: boolean;
  onQuery: (q: string) => void;
  onSearch: () => void;
  onPick: (r: OsSearchResult) => void;
  onFocus: () => void;
  onBlur: () => void;
  live: boolean;
  onLive: () => void;
  onSwitchTenant: () => void;
  onResync?: () => void;
  onHome?: () => void;
  chrome?: "full" | "report";
  title?: string;
}) {
  const searchRef = useRef<HTMLDivElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [pos, setPos] = useState({ top: 0, left: 0, width: 360, maxHeight: 280 });
  const menuOpen = focused && (results.length > 0 || searching);

  function place() {
    const el = searchRef.current;
    if (!el) return;
    setPos(menuPosition(el.getBoundingClientRect(), menuRef.current?.offsetHeight ?? 320, el.getBoundingClientRect().width));
  }

  useLayoutEffect(() => {
    if (!menuOpen) return;
    place();
    const onWin = () => place();
    window.addEventListener("resize", onWin);
    window.addEventListener("scroll", onWin, true);
    return () => {
      window.removeEventListener("resize", onWin);
      window.removeEventListener("scroll", onWin, true);
    };
  }, [menuOpen, results.length, searching]);

  function pick(r: OsSearchResult) {
    onPick(r);
    document.dispatchEvent(new CustomEvent("mqb:os-picked", { detail: r }));
  }

  return (
    <header className="topbar">
      <div className="row">
        <span className="badge tenant">{tenant.name}</span>
        <VersionStamp />
        {tenant.readonly && <span className="badge ro">read-only</span>}
        {mcpConnected === false && (
          <span className="badge reconnect" title="The MCP server process for this tenant isn't warm right now - the next query will spawn/reconnect it first, which can take a few seconds.">
            <span className="live-dot" />
            reconnecting...
          </span>
        )}
        {chrome === "full" && (
          <button type="button" className={`live-toggle${live ? " on" : ""}`} onClick={onLive} title={live ? "Live execute is on - the query re-runs as you edit" : "Re-run the query on every change"}>
            <span className="live-dot" />
            Live
          </button>
        )}
        {chrome === "report" && title && <span className="badge">{title}</span>}
      </div>
      {chrome === "full" ? (
        <div ref={searchRef} className="os-search" data-flight="os" data-tour="os">
          <input
            type="text"
            value={query}
            onChange={(e) => onQuery(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && onSearch()}
            onFocus={onFocus}
            onBlur={() => window.setTimeout(onBlur, 180)}
            placeholder="Search object structures..."
          />
        </div>
      ) : (
        <div className="os-search report-title">{title || osName || "Report"}</div>
      )}
      {chrome === "full" && menuOpen && createPortal(
        <div
          ref={menuRef}
          className="os-menu"
          data-tour="os-menu"
          style={{ top: pos.top, left: pos.left, width: pos.width, maxHeight: pos.maxHeight }}
        >
          {searching && results.length === 0 && (
            <div className="row" style={{ padding: 12 }}>
              <span className="spinner" /> <span className="muted">Searching...</span>
            </div>
          )}
          {results.map((r) => (
            <button
              type="button"
              key={r.osName}
              className={`os-option${osName === r.osName ? " active" : ""}`}
              onMouseDown={(e) => {
                e.preventDefault();
                pick(r);
              }}
            >
              <div className="mono" style={{ color: osName === r.osName ? "var(--accent)" : undefined }}>
                {r.osName}
              </div>
              {r.description && <div className="muted">{r.description}</div>}
            </button>
          ))}
        </div>,
        document.body,
      )}
      <div className="row">
        {onHome && (
          <button type="button" className="ghost" onClick={onHome}>
            <Icon icon={faHouse} /> Home
          </button>
        )}
        <AdminButton />
        <ThemeToggle />
        {onResync && <ResyncButton tenantId={tenant.id} onStarted={onResync} />}
        <button className="ghost" onClick={onSwitchTenant}>
          <Icon icon={faArrowRightArrowLeft} /> Switch
        </button>
      </div>
    </header>
  );
}
