/** Breadcrumb of hops (Children / ASSET / SITE). */
import { ChildRel } from "../../types";
import WizRelList from "./WizRelList";
import WizTrail, { TrailHop } from "./WizTrail";

type Hop = { relationship: string; objectName: string };

export default function WizHopPath({
  home,
  hops,
  activeIndex,
  leafRels,
  relsLoading,
  onHome,
  onJump,
  onAddHop,
  onTrimHop,
}: {
  home: string;
  hops: Hop[];
  activeIndex?: number;
  leafRels: ChildRel[];
  relsLoading?: boolean;
  onHome: () => void;
  onJump: (index: number) => void;
  onAddHop: (rel: ChildRel) => void;
  onTrimHop: (index: number) => void;
}) {
  const leaf = hops[hops.length - 1];
  const current = activeIndex ?? Math.max(0, hops.length - 1);
  const trailHops: TrailHop[] = hops.map((h, hi) => ({
    label: h.relationship,
    title: h.objectName,
    current: hi === current,
    onClick: () => onJump(hi),
    onRemove: hi > 0 ? () => onTrimHop(hi) : undefined,
  }));

  return (
    <div className="wiz-hop-path">
      <WizTrail
        home={{ label: home, current: hops.length === 0, onClick: onHome }}
        hops={trailHops}
      />
      {leaf && (
        <>
          <p className="wiz-hint">
            {relsLoading
              ? `Loading relationships from ${leaf.objectName}...`
              : `Hop deeper from ${leaf.objectName} (optional).`}
          </p>
          {!relsLoading && leafRels.length > 0 && (
            <WizRelList rels={leafRels} selected={null} onToggle={onAddHop} maxHeight={240} />
          )}
          {!relsLoading && leafRels.length === 0 && (
            <p className="wiz-hint muted">No further relationships on this object.</p>
          )}
        </>
      )}
    </div>
  );
}
