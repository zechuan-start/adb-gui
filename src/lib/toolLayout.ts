// Tool module identity and order algebra.
//
// The ids live here rather than in `lib/toolModules.tsx` so `store/ui.ts` can
// persist an order without importing the whole tool component tree, mirroring
// how `lib/panes.ts` carries `PaneId` for the same store.

export type ToolModuleId =
  | "screenshot"
  | "recording"
  | "install"
  | "deeplink"
  | "ports"
  | "keys"
  | "clipboard"
  | "currentApp"
  | "bugReport";

export const DEFAULT_TOOL_ORDER: readonly ToolModuleId[] = [
  "screenshot",
  "recording",
  "install",
  "deeplink",
  "ports",
  "keys",
  "clipboard",
  "currentApp",
  "bugReport",
];

const TOOL_MODULE_IDS: ReadonlySet<string> = new Set<string>(DEFAULT_TOOL_ORDER);

export function isToolModuleId(value: unknown): value is ToolModuleId {
  return typeof value === "string" && TOOL_MODULE_IDS.has(value);
}

/**
 * Turns an arbitrary persisted value into a complete, duplicate-free order.
 *
 * Missing ids are reinserted at their default index instead of appended, so a
 * user who stored today's modules still sees a module added by a later version
 * in the position it was designed for.
 */
export function reconcileToolOrder(
  persisted: unknown,
  defaults: readonly ToolModuleId[],
): ToolModuleId[] {
  if (!Array.isArray(persisted)) {
    return [...defaults];
  }
  if (persisted.some((entry) => typeof entry !== "string")) {
    return [...defaults];
  }

  const reconciled: ToolModuleId[] = [];
  for (const entry of persisted) {
    if (isToolModuleId(entry) && defaults.includes(entry) && !reconciled.includes(entry)) {
      reconciled.push(entry);
    }
  }

  defaults.forEach((id, index) => {
    if (!reconciled.includes(id)) {
      reconciled.splice(Math.min(index, reconciled.length), 0, id);
    }
  });

  return reconciled;
}

/**
 * Moves `moved` into the slot `target` occupies, pushing `target` toward the
 * side the drag came from.
 *
 * The target index is read before the removal, so dragging forward lands after
 * the target and dragging backward lands before it without a direction branch.
 * Reading it afterwards would make a forward drag onto the next module a no-op.
 */
export function moveTool(
  order: readonly ToolModuleId[],
  moved: ToolModuleId,
  target: ToolModuleId,
): ToolModuleId[] {
  const next = [...order];
  if (moved === target || !next.includes(moved) || !next.includes(target)) {
    return next;
  }

  const targetIndex = next.indexOf(target);
  next.splice(next.indexOf(moved), 1);
  next.splice(targetIndex, 0, moved);
  return next;
}

/** Moves `moved` one slot forward (`-1`) or backward (`1`), clamped at both ends. */
export function shiftTool(
  order: readonly ToolModuleId[],
  moved: ToolModuleId,
  delta: 1 | -1,
): ToolModuleId[] {
  const next = [...order];
  const index = next.indexOf(moved);
  const target = index + delta;
  if (index < 0 || target < 0 || target >= next.length) {
    return next;
  }

  next.splice(index, 1);
  next.splice(target, 0, moved);
  return next;
}

export function sameToolOrder(
  left: readonly ToolModuleId[],
  right: readonly ToolModuleId[],
): boolean {
  return left.length === right.length && left.every((id, index) => id === right[index]);
}

export function toolPosition(
  order: readonly ToolModuleId[],
  id: ToolModuleId,
): number {
  return order.indexOf(id) + 1;
}
