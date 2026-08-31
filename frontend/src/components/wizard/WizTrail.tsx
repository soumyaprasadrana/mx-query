/** Compact trail of chosen objects in the wizard. */
export type TrailHop = {
  label: string;
  title?: string;
  current?: boolean;
  onClick?: () => void;
  onRemove?: () => void;
};

export default function WizTrail({
  home,
  hops,
}: {
  home: TrailHop;
  hops: TrailHop[];
}) {
  return (
    <nav className="wiz-trail" aria-label="Path">
      <button
        type="button"
        className={`wiz-trail-chip home${home.current ? " on" : ""}`}
        title={home.title ?? home.label}
        onClick={home.onClick}
        disabled={!home.onClick}
      >
        {home.label}
      </button>
      {hops.map((h, i) => (
        <span key={`${h.label}-${i}`} className="wiz-trail-seg">
          <span className="wiz-trail-sep" aria-hidden>/</span>
          <button
            type="button"
            className={`wiz-trail-chip${h.current ? " on" : ""}`}
            data-tour={i === hops.length - 1 && hops.length > 1 ? "wiz-hop-leaf" : undefined}
            title={h.title ?? h.label}
            onClick={h.onClick}
            disabled={!h.onClick}
          >
            {h.label}
            {h.onRemove && (
              <span
                role="button"
                tabIndex={0}
                aria-label={`Remove ${h.label} and deeper hops`}
                onClick={(e) => {
                  e.stopPropagation();
                  h.onRemove?.();
                }}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    e.stopPropagation();
                    h.onRemove?.();
                  }
                }}
              >
                x
              </span>
            )}
          </button>
        </span>
      ))}
    </nav>
  );
}
