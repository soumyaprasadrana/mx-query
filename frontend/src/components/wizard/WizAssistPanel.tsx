/** Assist rewrite / suggest panel on a wizard step. */
import { ReactNode, useEffect, useState } from "react";
import { Icon, faWandMagicSparkles } from "../Icon";

export default function WizAssistPanel({
  placeholder,
  need,
  onNeed,
  busy,
  note,
  onSuggest,
  goLabel = "Suggest",
  busyLabel = "Working...",
  disabled,
  onTapAll,
  tapAllCount,
  children,
}: {
  placeholder: string;
  need: string;
  onNeed: (v: string) => void;
  busy: boolean;
  note: string | null;
  onSuggest: () => void;
  goLabel?: string;
  busyLabel?: string;
  disabled?: boolean;
  onTapAll?: () => void;
  tapAllCount?: number;
  children?: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (busy) setOpen(true);
  }, [busy]);

  const showTapAll = Boolean(onTapAll) && (tapAllCount ?? 0) > 0;
  const blocked = busy || !!disabled;

  return (
    <div className={`wiz-assist${busy ? " busy" : ""}`}>
      <div className="wiz-assist-head">
        <span className="wiz-assist-kicker">
          <Icon icon={faWandMagicSparkles} /> Assist
        </span>
        <button type="button" className="wiz-assist-go" disabled={blocked} onClick={onSuggest}>
          {busy ? busyLabel : goLabel}
        </button>
      </div>
      <input
        className="wiz-assist-need"
        value={need}
        placeholder={placeholder}
        onChange={(e) => onNeed(e.target.value)}
        onKeyDown={(e) => e.key === "Enter" && !blocked && onSuggest()}
      />
      {note && <p className={`wiz-assist-note${busy ? " live" : ""}`}>{note}</p>}
      {children ? (
        <div className="wiz-assist-suggests">
          <div className="wiz-assist-suggests-bar">
            <button
              type="button"
              className="wiz-assist-collapse"
              onClick={() => setOpen((v) => !v)}
            >
              {open ? "Hide suggestions" : "Show suggestions"}
            </button>
            {showTapAll && (
              <button type="button" className="wiz-assist-all" onClick={onTapAll}>
                Tap all{tapAllCount != null ? ` | ${tapAllCount}` : ""}
              </button>
            )}
          </div>
          {open ? <div className="wiz-assist-suggests-body">{children}</div> : null}
        </div>
      ) : null}
    </div>
  );
}
