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

/** A swap that has been applied to the preview but not yet checked against layout. */
export interface ToolDragPending {
  /** Preview order before the swap, restored when the swap is refused. */
  order: readonly ToolModuleId[];
  /** Slot the dragged module occupied before the swap. */
  slot: ToolDragRect | null;
}

export interface ToolDragState {
  moved: ToolModuleId;
  /** Pointer position at press, measured against for the activation distance. */
  origin: ToolDragPoint;
  /** Where inside the module the pointer grabbed it. */
  grab: ToolDragPoint;
  /** Latest pointer position. */
  pointer: ToolDragPoint;
  /** Translation to paint on the module, zero until the drag activates. */
  offset: ToolDragPoint;
  originOrder: readonly ToolModuleId[];
  previewOrder: readonly ToolModuleId[];
  active: boolean;
  /**
   * Set by `updateToolDrag` when it swaps, cleared by `settleToolDrag`. The
   * caller must render the preview and settle it before the next update.
   */
  pending: ToolDragPending | null;
}

export function beginToolDrag(
  moved: ToolModuleId,
  pointer: ToolDragPoint,
  order: readonly ToolModuleId[],
  rects: readonly ToolDragRect[],
): ToolDragState {
  const slot = slotOf(rects, moved);
  return {
    moved,
    origin: { x: pointer.x, y: pointer.y },
    grab: slot
      ? { x: pointer.x - slot.x, y: pointer.y - slot.y }
      : { x: 0, y: 0 },
    pointer: { x: pointer.x, y: pointer.y },
    offset: { x: 0, y: 0 },
    originOrder: [...order],
    previewOrder: [...order],
    active: false,
    pending: null,
  };
}

/**
 * Follows the pointer and, when it enters another module, moves the dragged
 * module into that module's index.
 *
 * Only a rectangle that contains the pointer is a target. Nearest-centre
 * resolution flips between two orders when modules differ in size: the swap
 * reflows the grid, and in the new layout another centre is nearest.
 */
export function updateToolDrag(
  state: ToolDragState,
  pointer: ToolDragPoint,
  rects: readonly ToolDragRect[],
): ToolDragState {
  const active = state.active
    || Math.hypot(pointer.x - state.origin.x, pointer.y - state.origin.y)
      > DRAG_ACTIVATION_DISTANCE;
  if (!active) {
    return { ...state, pointer };
  }

  const slot = slotOf(rects, state.moved);
  const lifted: ToolDragState = {
    ...state,
    active,
    pointer,
    offset: liftOffset(state.grab, pointer, slot, state.offset),
  };
  const target = moduleAt(rects, clampToBounds(pointer, rects));
  if (target === null || target === state.moved) {
    // A gap, a hole left by a wide module, or the dragged module's own slot:
    // nothing to displace.
    return lifted;
  }

  return {
    ...lifted,
    previewOrder: moveTool(state.previewOrder, state.moved, target),
    pending: { order: state.previewOrder, slot },
  };
}

/**
 * Keeps a pending swap only if, in the layout it produced, the dragged module's
 * slot contains the pointer.
 *
 * That makes every accepted state stable: the next swap needs the pointer to
 * leave the slot first, so two orders can never alternate under a pointer that
 * stays put. In a uniform grid the dragged module takes over the target's slot
 * exactly and the check always passes; it only refuses swaps that a wider or
 * taller module would have sent somewhere else.
 */
export function settleToolDrag(
  state: ToolDragState,
  rects: readonly ToolDragRect[],
): ToolDragState {
  const { pending } = state;
  if (!pending) {
    return state;
  }

  const slot = slotOf(rects, state.moved);
  if (slot && contains(slot, clampToBounds(state.pointer, rects))) {
    return {
      ...state,
      pending: null,
      offset: liftOffset(state.grab, state.pointer, slot, state.offset),
    };
  }
  return {
    ...state,
    previewOrder: pending.order,
    pending: null,
    offset: liftOffset(state.grab, state.pointer, pending.slot, state.offset),
  };
}

export function commitToolDrag(state: ToolDragState): readonly ToolModuleId[] {
  return state.previewOrder;
}

export function cancelToolDrag(state: ToolDragState): readonly ToolModuleId[] {
  return state.originOrder;
}

/** Translation that keeps the grabbed point of the module under the pointer. */
function liftOffset(
  grab: ToolDragPoint,
  pointer: ToolDragPoint,
  slot: ToolDragRect | null,
  fallback: ToolDragPoint,
): ToolDragPoint {
  if (!slot) {
    return fallback;
  }
  return {
    x: pointer.x - slot.x - grab.x,
    y: pointer.y - slot.y - grab.y,
  };
}

function slotOf(rects: readonly ToolDragRect[], id: ToolModuleId): ToolDragRect | null {
  return rects.find((rect) => rect.id === id) ?? null;
}

function contains(rect: ToolDragRect, point: ToolDragPoint): boolean {
  return point.x >= rect.x
    && point.x < rect.x + rect.width
    && point.y >= rect.y
    && point.y < rect.y + rect.height;
}

function moduleAt(
  rects: readonly ToolDragRect[],
  point: ToolDragPoint,
): ToolModuleId | null {
  return rects.find((rect) => contains(rect, point))?.id ?? null;
}

/**
 * Pulls a pointer outside the grid back onto its edge, so dragging above the
 * first row or past the last column still targets the modules there. Edge
 * auto-scroll relies on this: the pointer rests in the band above the grid.
 */
function clampToBounds(
  pointer: ToolDragPoint,
  rects: readonly ToolDragRect[],
): ToolDragPoint {
  if (rects.length === 0) {
    return pointer;
  }
  const left = Math.min(...rects.map((rect) => rect.x));
  const top = Math.min(...rects.map((rect) => rect.y));
  const right = Math.max(...rects.map((rect) => rect.x + rect.width));
  const bottom = Math.max(...rects.map((rect) => rect.y + rect.height));
  // One pixel inside the far edges, because `contains` excludes them.
  return {
    x: Math.min(Math.max(pointer.x, left), right - 1),
    y: Math.min(Math.max(pointer.y, top), bottom - 1),
  };
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
