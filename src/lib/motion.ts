// Motion tokens, taken from the `animate` skill in emilkowalski/skills rather
// than approximated. The built-in CSS curves are too weak for UI motion.

/** Strong ease-out: a system response to something the user just did. */
export const EASE_OUT = "cubic-bezier(0.23, 1, 0.32, 1)";

/** Strong ease-in-out: an element moving from one place on screen to another. */
export const EASE_IN_OUT = "cubic-bezier(0.77, 0, 0.175, 1)";

/** Modules making room for a dragged one, or taking their default slots back. */
export const LAYOUT_SHIFT_MS = 200;

/** A released module landing in its slot. */
export const DROP_SETTLE_MS = 200;

/**
 * Reduced motion keeps comprehension aids such as fades and drops movement.
 * Everything animated here is movement, so it is skipped entirely.
 */
export function prefersReducedMotion(): boolean {
  return window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
