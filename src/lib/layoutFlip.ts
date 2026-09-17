// FLIP planning for elements that move when a layout changes: First (where
// each element is painted before the change), Last (where it rests after),
// Invert (translate it back to First), Play (animate the translate to zero).
//
// Pure so the decisions are testable without a DOM; `hooks/useLayoutFlip.ts`
// measures and runs the animations.

export interface FlipPoint {
  x: number;
  y: number;
}

export interface LayoutFlipMove<Id> {
  id: Id;
  /**
   * Translation to start from, or null when the element only needs its
   * running animation stopped because it is already where it belongs.
   */
  from: FlipPoint | null;
}

/** Displacement, in px, below which a move is not worth animating. */
export const FLIP_MIN_DISTANCE = 1;

/**
 * @param first   painted positions before the change, running animations included
 * @param last    resting positions after the change
 * @param heading resting position each running animation is travelling to
 */
export function planLayoutFlip<Id>(
  first: ReadonlyMap<Id, FlipPoint>,
  last: ReadonlyMap<Id, FlipPoint>,
  heading: ReadonlyMap<Id, FlipPoint>,
): LayoutFlipMove<Id>[] {
  const moves: LayoutFlipMove<Id>[] = [];
  for (const [id, to] of last) {
    const from = first.get(id);
    if (!from) {
      continue;
    }
    const target = heading.get(id);
    if (target && samePoint(target, to)) {
      // Restarting would replay the curve from rest and visibly stall it.
      continue;
    }

    const offset = { x: from.x - to.x, y: from.y - to.y };
    const far = Math.hypot(offset.x, offset.y) >= FLIP_MIN_DISTANCE;
    if (far) {
      moves.push({ id, from: offset });
    } else if (target) {
      // Its animation is relative to a slot the element has left, so letting it
      // run would pull the element off its new slot.
      moves.push({ id, from: null });
    }
  }
  return moves;
}

function samePoint(a: FlipPoint, b: FlipPoint): boolean {
  return Math.abs(a.x - b.x) < FLIP_MIN_DISTANCE && Math.abs(a.y - b.y) < FLIP_MIN_DISTANCE;
}
