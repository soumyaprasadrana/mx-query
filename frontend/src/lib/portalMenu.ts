/** Position a dropdown in a portal so it is not clipped. */
export function menuPosition(
  anchor: DOMRect,
  menuHeight: number,
  minWidth: number,
): { top: number; left: number; width: number; maxHeight: number } {
  const width = Math.max(anchor.width, minWidth);
  const left = Math.min(Math.max(8, anchor.left), window.innerWidth - width - 8);
  const gap = 4;
  const spaceBelow = window.innerHeight - anchor.bottom - 8;
  const spaceAbove = anchor.top - 8;
  const preferBelow = spaceBelow >= 120 || spaceBelow >= spaceAbove;
  if (preferBelow) {
    return {
      top: anchor.bottom + gap,
      left,
      width,
      maxHeight: Math.max(100, Math.min(280, spaceBelow)),
    };
  }
  const maxHeight = Math.max(100, Math.min(280, spaceAbove));
  const h = Math.min(menuHeight || maxHeight, maxHeight);
  return {
    top: Math.max(8, anchor.top - h - gap),
    left,
    width,
    maxHeight,
  };
}
