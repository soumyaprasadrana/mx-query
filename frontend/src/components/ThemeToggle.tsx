/**
 * Theme pack picker + Assist on/off. Assist is a ghost button like Settings, not a pill.
 */
import { useEffect, useRef, useState } from "react";
import { toggleKind } from "../lib/theme";
import { useTheme } from "./settings/ThemeProvider";
import { Icon, faPalette, faWandMagicSparkles } from "./Icon";

export default function ThemeToggle() {
  const { pack, setPack, packs } = useTheme();
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (!rootRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, [open]);

  return (
    <div className="theme-picker" ref={rootRef}>
      <button
        type="button"
        className="ghost"
        aria-expanded={open}
        aria-haspopup="listbox"
        onClick={() => setOpen((v) => !v)}
      >
        <Icon icon={faPalette} />
        {pack.name}
      </button>
      {open && (
        <div className="theme-picker-menu" role="listbox">
          {packs.map((p) => (
            <button
              key={p.id}
              type="button"
              role="option"
              aria-selected={pack.id === p.id}
              className={pack.id === p.id && pack.ootb ? "on" : ""}
              onClick={() => {
                setPack(p);
                setOpen(false);
              }}
            >
              <i style={{ background: p.tokens.accent }} />
              {p.name}
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              setPack(toggleKind(pack));
              setOpen(false);
            }}
          >
            Switch to {pack.kind === "dark" ? "light" : "dark"}
          </button>
        </div>
      )}
    </div>
  );
}

export function AssistToggle({
  on,
  onChange,
  disabled,
  disabledTitle,
}: {
  on: boolean;
  onChange: (v: boolean) => void;
  disabled?: boolean;
  disabledTitle?: string;
}) {
  return (
    <button
      type="button"
      className={`ghost assist-toggle${on ? " on" : ""}${disabled ? " disabled" : ""}`}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onChange(!on);
      }}
      title={
        disabled
          ? (disabledTitle ?? "Ask an admin to configure an AI provider in Settings first.")
          : on
            ? "Turn Assist off"
            : "Suggest picks from your intent via the local model"
      }
    >
      <Icon icon={faWandMagicSparkles} />
      Assist
    </button>
  );
}
