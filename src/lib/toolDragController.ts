// Pure drag decision layer: pointer coordinates in, preview order out.
//
// The project has no jsdom, so component interaction cannot be tested directly.
// Every reordering decision therefore lives here, driven by measured rectangles
// the caller passes in, and `hooks/useToolDrag.ts` stays a thin DOM adapter.
// This mirrors the `followScrollController` / `useFollowScroll` split.

import { moveTool, type ToolModuleId } from "@/lib/toolLayout";

/** Pointer travel, in px, before a header press becomes a drag instead of a click. */
export const DRAG_ACTIVATION_DISTANCE = 4;

/** Distance from a scroll edge, in px, where dragging starts scrolling the page. */
export const EDGE_SCROLL_ZONE = 48;

/** Fastest edge auto-scroll step, in px per animation frame. */
export const EDGE_SCROLL_MAX_SPEED = 18;

export interface ToolDragPoint {
  x: number;
  y: number;
}

export interface ToolDragRect extends ToolDragPoint {
  id: ToolModuleId;
  width: number;
  height: number;
}

export interface ToolDragState {
  moved: ToolModuleId;
  /** Pointer position at press, measured against for the activation distance. */
  origin: ToolDragPoint;
  /** Where inside the module the pointer grabbed it. */
  grab: ToolDragPoint;
  /** Translation to paint on the module, zero until the drag activates. */
  offset: ToolDragPoint;
  originOrder: readonly ToolModuleId[];
  previewOrder: readonly ToolModuleId[];
  active: boolean;
  lockedTarget: ToolModuleId | null;
}

export function beginToolDrag(
  moved: ToolModuleId,
  pointer: ToolDragPoint,
  order: readonly ToolModuleId[],
  rects: readonly ToolDragRect[],
): ToolDragState {
  const slot = rects.find((rect) => rect.id === moved);
  return {
    moved,
    origin: { x: pointer.x, y: pointer.y },
    grab: slot
      ? { x: pointer.x - slot.x, y: pointer.y - slot.y }
      : { x: 0, y: 0 },
    offset: { x: 0, y: 0 },
    originOrder: [...order],
    previewOrder: [...order],
    active: false,
    lockedTarget: null,
  };
}

export function updateToolDrag(
  state: ToolDragState,
  pointer: ToolDragPoint,
  rects: readonly ToolDragRect[],
): ToolDragState {
  const active = state.active
    || Math.hypot(pointer.x - state.origin.x, pointer.y - state.origin.y)
      > DRAG_ACTIVATION_DISTANCE;
  if (!active) {
    return { ...state, active: false };
  }

  const slotOf = (id: ToolModuleId) => rects.find((rect) => rect.id === id) ?? null;
  const target = nearestModule(pointer, rects);

  if (target === null || target === state.moved) {
    // The pointer is over the dragged module's own slot, so there is nothing to
    // displace. Releasing the lock here lets the previous target win again once
    // the pointer travels back onto it.
    return {
      ...state,
      active,
      offset: liftOffset(state, pointer, slotOf(state.moved)),
      lockedTarget: null,
    };
  }
  if (target === state.lockedTarget) {
    // Already displaced this module. Without the lock, a caller that reuses a
    // stale measurement keeps resolving the same target and the two modules
    // swap back and forth on every pointer move.
    return { ...state, active, offset: liftOffset(state, pointer, slotOf(state.moved)) };
  }

  return {
    ...state,
    active,
    previewOrder: moveTool(state.previewOrder, state.moved, target),
    lockedTarget: target,
    // The module is about to occupy the target's slot. Anchoring the lift there
    // now keeps it under the pointer instead of snapping back to where the drag
    // started for a frame.
    offset: liftOffset(state, pointer, slotOf(target)),
  };
}

/** Translation that keeps the grabbed point of the module under the pointer. */
function liftOffset(
  state: ToolDragState,
  pointer: ToolDragPoint,
  slot: ToolDragRect | null,
): ToolDragPoint {
  if (!slot) {
    return state.offset;
  }
  return {
    x: pointer.x - slot.x - state.grab.x,
    y: pointer.y - slot.y - state.grab.y,
  };
}

export function commitToolDrag(state: ToolDragState): readonly ToolModuleId[] {
  return state.previewOrder;
}

export function cancelToolDrag(state: ToolDragState): readonly ToolModuleId[] {
  return state.originOrder;
}

/**
 * Nearest rectangle centre wins, rather than "the rectangle containing the
 * pointer": the grid has a 14 px gap, and a pointer resting in a gap still
 * needs a definite drop target.
 */
function nearestModule(
  pointer: ToolDragPoint,
  rects: readonly ToolDragRect[],
): ToolModuleId | null {
  let nearest: ToolModuleId | null = null;
  let nearestDistance = Number.POSITIVE_INFINITY;

  for (const rect of rects) {
    const dx = pointer.x - (rect.x + rect.width / 2);
    const dy = pointer.y - (rect.y + rect.height / 2);
    const distance = dx * dx + dy * dy;
    if (distance < nearestDistance) {
      nearestDistance = distance;
      nearest = rect.id;
    }
  }

  return nearest;
}

/**
 * Scroll step for the current pointer position, negative upward.
 *
 * Returns 0 away from both edges so the caller can stop its animation frame
 * loop instead of scheduling no-op frames.
 */
export function edgeScrollVelocity(
  pointerY: number,
  top: number,
  bottom: number,
): number {
  const fromTop = pointerY - top;
  if (fromTop < EDGE_SCROLL_ZONE) {
    return -edgeScrollStep(EDGE_SCROLL_ZONE - fromTop);
  }

  const fromBottom = bottom - pointerY;
  if (fromBottom < EDGE_SCROLL_ZONE) {
    return edgeScrollStep(EDGE_SCROLL_ZONE - fromBottom);
  }

  return 0;
}

function edgeScrollStep(depth: number): number {
  const ratio = Math.min(1, Math.max(0, depth / EDGE_SCROLL_ZONE));
  return Math.ceil(ratio * EDGE_SCROLL_MAX_SPEED);
}
