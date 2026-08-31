/** AND/OR grouping for WHERE conditions. */
export default function OrModeToggle({
  checked,
  onChange,
  disabled,
  label = "Match any (OR)",
  hint = "Maximo replaces AND with OR across these conditions.",
}: {
  checked: boolean;
  onChange: (next: boolean) => void;
  disabled?: boolean;
  label?: string;
  hint?: string;
}) {
  return (
    <label className={`or-mode-toggle${checked ? " on" : ""}`}>
      <input
        type="checkbox"
        checked={checked}
        disabled={disabled}
        onChange={(e) => onChange(e.target.checked)}
      />
      <span>
        <span className="or-mode-label">{label}</span>
        <span className="muted">{hint}</span>
      </span>
    </label>
  );
}
