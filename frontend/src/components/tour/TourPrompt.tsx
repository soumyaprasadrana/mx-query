/** First-run offer to walk through the builder. */
import { TOURS, writeTourMark } from "../../lib/tour";

export default function TourPrompt({
  replay,
  onPick,
  onSkip,
}: {
  replay?: boolean;
  onPick: () => void;
  onSkip: () => void;
}) {
  const builder = TOURS.builder;
  return (
    <div className="tour-prompt-overlay" role="dialog" aria-modal="true" aria-labelledby="tour-prompt-title">
      <div className="tour-prompt">
        <p className="insight-kicker">{replay ? "Replay" : "First visit"}</p>
        <h2 id="tour-prompt-title">{replay ? "Walk through the Builder?" : "Want a walkthrough?"}</h2>
        <p>{builder.blurb} Nothing is stored on the server - finishing or skipping is remembered in this browser.</p>
        <div className="tour-prompt-actions tour-prompt-picks">
          <button
            type="button"
            className="ghost"
            onClick={() => {
              writeTourMark("skipped");
              onSkip();
            }}
          >
            Skip
          </button>
          <span style={{ flex: 1 }} />
          <button
            type="button"
            className="go"
            style={{ width: "auto", padding: "0 18px" }}
            onClick={onPick}
            title={builder.blurb}
          >
            {builder.title}
          </button>
        </div>
      </div>
    </div>
  );
}
