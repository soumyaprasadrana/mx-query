/** driver.js shell; catalog steps live in lib/tour. */
import { useEffect, useRef } from "react";
import { startTourEngine, TOURS, TourId, writeTourMark } from "../../lib/tour";

export { readTourMark, writeTourMark, TOUR_KEY } from "../../lib/tour";
export type { TourMark } from "../../lib/tour";

export default function Walkthrough({
  tourId,
  onGo,
  onFinished,
}: {
  tourId: TourId;
  onGo: (id: TourId) => void;
  onFinished: () => void;
}) {
  const go = useRef(onGo);
  go.current = onGo;
  const finished = useRef(onFinished);
  finished.current = onFinished;

  useEffect(() => {
    const def = TOURS[tourId];
    const run = startTourEngine({
      def,
      onGo: (id) => go.current(id),
      onFinished: (completed) => {
        writeTourMark(completed ? "done" : "skipped");
        finished.current();
      },
    });
    return () => run.destroy();
  }, [tourId]);

  return null;
}
