import { describe, expect, it } from "vitest";
import {
  DRAG_ACTIVATION_DISTANCE,
  EDGE_SCROLL_MAX_SPEED,
  EDGE_SCROLL_ZONE,
  beginToolDrag,
  cancelToolDrag,
  commitToolDrag,
  edgeScrollVelocity,
  settleToolDrag,
  updateToolDrag,
  type ToolDragPoint,
  type ToolDragRect,
  type ToolDragState,
} from "@/lib/toolDragController";
import type { ToolModuleId } from "@/lib/toolLayout";

// Cells of 200x100 with the production 14 px grid gap.
const CELL_WIDTH = 200;
const CELL_HEIGHT = 100;
const GAP = 14;

/**
 * Sparse CSS grid auto-placement, as the tools grid uses: items flow in order,
 * and a wide item that does not fit the rest of a row starts the next one,
 * leaving a hole behind.
 */
function layout(
  order: readonly ToolModuleId[],
  columns: number,
  wide: readonly ToolModuleId[] = [],
): ToolDragRect[] {
  const rects: ToolDragRect[] = [];
  let row = 0;
  let column = 0;
  for (const id of order) {
    const span = wide.includes(id) ? 2 : 1;
    if (column + span > columns) {
      row += 1;
      column = 0;
    }
    rects.push({
      id,
      x: column * (CELL_WIDTH + GAP),
      y: row * (CELL_HEIGHT + GAP),
      width: span * CELL_WIDTH + (span - 1) * GAP,
      height: CELL_HEIGHT,
    });
    column += span;
    if (column >= columns) {
      row += 1;
      column = 0;
    }
  }
  return rects;
}

function cell(column: number, row: number, dx = CELL_WIDTH / 2, dy = CELL_HEIGHT / 2) {
  return { x: column * (CELL_WIDTH + GAP) + dx, y: row * (CELL_HEIGHT + GAP) + dy };
}

function rectOf(rects: readonly ToolDragRect[], id: ToolModuleId): ToolDragRect {
  const rect = rects.find((entry) => entry.id === id);
  if (!rect) {
    throw new Error(`missing rect for ${id}`);
  }
  return rect;
}

function inside(rect: ToolDragRect, point: ToolDragPoint): boolean {
  return point.x >= rect.x
    && point.x < rect.x + rect.width
    && point.y >= rect.y
    && point.y < rect.y + rect.height;
}

// Two rows of two cells.
const ORDER: readonly ToolModuleId[] = ["screenshot", "recording", "install", "deeplink"];
const RECTS = layout(ORDER, 2);

function press(id: ToolModuleId, pointer: ToolDragPoint) {
  return beginToolDrag(id, pointer, ORDER, RECTS);
}

/** One pointer move as the hook runs it: update, render the preview, settle. */
function step(
  state: ToolDragState,
  pointer: ToolDragPoint,
  place: (order: readonly ToolModuleId[]) => ToolDragRect[],
): ToolDragState {
  const updated = updateToolDrag(state, pointer, place(state.previewOrder));
  return settleToolDrag(updated, place(updated.previewOrder));
}

describe("updateToolDrag", () => {
  it("stays inactive until the pointer passes the activation distance", () => {
    const origin = cell(1, 1);
    const begun = press("deeplink", origin);

    const nudged = updateToolDrag(
      begun,
      { x: origin.x + DRAG_ACTIVATION_DISTANCE, y: origin.y },
      RECTS,
    );

    expect(nudged.active).toBe(false);
    expect(nudged.offset).toEqual({ x: 0, y: 0 });
    expect(nudged.previewOrder).toEqual([...ORDER]);
    expect(nudged.pending).toBeNull();
  });

  it("keeps the grabbed point of the module under the pointer", () => {
    const slot = rectOf(RECTS, "deeplink");
    const grabbed = { x: slot.x + 12, y: slot.y + 9 };
    const begun = press("deeplink", grabbed);

    const dragged = updateToolDrag(begun, { x: grabbed.x + 60, y: grabbed.y + 40 }, RECTS);

    expect(dragged.offset).toEqual({ x: 60, y: 40 });
    expect(dragged.pending).toBeNull();
  });

  it("proposes a swap once the pointer enters another module", () => {
    const begun = press("deeplink", cell(1, 1));

    const dragged = updateToolDrag(begun, cell(0, 0), RECTS);

    expect(dragged.active).toBe(true);
    expect(dragged.previewOrder).toEqual(["deeplink", "screenshot", "recording", "install"]);
    expect(dragged.pending).toEqual({
      order: ORDER,
      slot: rectOf(RECTS, "deeplink"),
    });
  });

  it("leaves the preview alone while the pointer rests in a grid gap", () => {
    const begun = press("deeplink", cell(1, 1));

    // Between the first-row cells, inside neither rectangle.
    const inGap = updateToolDrag(begun, { x: CELL_WIDTH + GAP / 2, y: CELL_HEIGHT / 2 }, RECTS);

    expect(inGap.active).toBe(true);
    expect(inGap.previewOrder).toEqual([...ORDER]);
    expect(inGap.pending).toBeNull();
  });

  it("leaves the preview alone over the hole a wide module leaves behind", () => {
    const order: ToolModuleId[] = ["screenshot", "recording", "ports", "install"];
    const rects = layout(order, 3, ["ports"]);
    const begun = beginToolDrag("install", cell(2, 1), order, rects);

    // The ports module did not fit after two cells, so row 0, column 2 is empty.
    const overHole = updateToolDrag(begun, cell(2, 0), rects);

    expect(overHole.previewOrder).toEqual(order);
    expect(overHole.pending).toBeNull();
  });

  it("leaves the preview alone over the dragged module's own slot", () => {
    const begun = press("deeplink", cell(1, 1, 20, 20));

    const overSelf = updateToolDrag(begun, cell(1, 1, 60, 60), RECTS);

    expect(overSelf.previewOrder).toEqual([...ORDER]);
    expect(overSelf.pending).toBeNull();
  });

  it("pulls a pointer outside the grid onto its edge", () => {
    const begun = press("deeplink", cell(1, 1));

    // Above the first row and left of the first column, where edge auto-scroll
    // leaves the pointer.
    const above = updateToolDrag(begun, { x: -40, y: -60 }, RECTS);

    expect(above.previewOrder[0]).toBe("deeplink");
  });

  it("keeps the preview unchanged when no rectangles were measured", () => {
    const begun = press("deeplink", cell(1, 1));

    const dragged = updateToolDrag(begun, { x: 0, y: 0 }, []);

    expect(dragged.active).toBe(true);
    expect(dragged.previewOrder).toEqual([...ORDER]);
    expect(dragged.pending).toBeNull();
  });
});

describe("settleToolDrag", () => {
  it("does nothing without a pending swap", () => {
    const begun = press("deeplink", cell(1, 1));

    expect(settleToolDrag(begun, RECTS)).toBe(begun);
  });

  it("keeps a swap that put the dragged module under the pointer", () => {
    const slot = rectOf(RECTS, "deeplink");
    const begun = press("deeplink", { x: slot.x + 12, y: slot.y + 9 });
    const pointer = cell(0, 0);
    const proposed = updateToolDrag(begun, pointer, RECTS);
    const placed = layout(proposed.previewOrder, 2);

    const settled = settleToolDrag(proposed, placed);

    const taken = rectOf(placed, "deeplink");
    expect(settled.previewOrder).toEqual(["deeplink", "screenshot", "recording", "install"]);
    expect(settled.pending).toBeNull();
    // Measured against the slot the module really took over.
    expect(settled.offset).toEqual({
      x: pointer.x - taken.x - 12,
      y: pointer.y - taken.y - 9,
    });
  });

  it("refuses a swap that sent the dragged module away from the pointer", () => {
    // Three columns: screenshot fills row 0 with recording and install, the
    // wide ports module sits beside deeplink in row 1.
    const order: ToolModuleId[] = ["recording", "screenshot", "install", "deeplink", "ports"];
    const place = (next: readonly ToolModuleId[]) => layout(next, 3, ["ports"]);
    const start = rectOf(place(order), "screenshot");
    const begun = beginToolDrag("screenshot", { x: start.x + 10, y: start.y + 10 }, order, place(order));
    // The left half of ports. Moving screenshot there reflows ports to the
    // start of row 1 and screenshot to its end, away from this pointer.
    const pointer = cell(1, 1);

    const proposed = updateToolDrag(begun, pointer, place(order));
    expect(proposed.previewOrder).toEqual(["recording", "install", "deeplink", "ports", "screenshot"]);

    const settled = settleToolDrag(proposed, place(proposed.previewOrder));

    expect(settled.previewOrder).toEqual(order);
    expect(settled.pending).toBeNull();
    expect(settled.offset).toEqual({
      x: pointer.x - start.x - 10,
      y: pointer.y - start.y - 10,
    });
  });

  it("accepts the same move once the pointer reaches where the module lands", () => {
    const order: ToolModuleId[] = ["recording", "screenshot", "install", "deeplink", "ports"];
    const place = (next: readonly ToolModuleId[]) => layout(next, 3, ["ports"]);
    const begun = beginToolDrag("screenshot", cell(1, 0), order, place(order));

    // The right half of ports, which is where screenshot ends up.
    const settled = step(begun, cell(2, 1), place);

    expect(settled.previewOrder).toEqual(["recording", "install", "deeplink", "ports", "screenshot"]);
    expect(inside(rectOf(place(settled.previewOrder), "screenshot"), cell(2, 1))).toBe(true);
  });

  it("never alternates between two orders while sweeping across a wide module", () => {
    const order: ToolModuleId[] = [
      "recording", "screenshot", "install", "deeplink", "ports",
      "keys", "clipboard", "currentApp", "bugReport",
    ];
    const place = (next: readonly ToolModuleId[]) => layout(next, 3, ["ports"]);
    let state = beginToolDrag("screenshot", cell(1, 0), order, place(order));
    const changes = [{ order: state.previewOrder.join(), x: Number.NaN }];
    const row1 = cell(0, 1).y;
    // Right across row 1 in 5 px steps, then back.
    const sweep = [
      ...Array.from({ length: 130 }, (_, index) => index * 5),
      ...Array.from({ length: 130 }, (_, index) => 645 - index * 5),
    ];

    for (const x of sweep) {
      const pointer = { x, y: row1 };
      const before = state.previewOrder;
      state = step(state, pointer, place);
      expect(state.pending).toBeNull();
      if (state.previewOrder !== before) {
        // Every accepted swap leaves the pointer over the module it moved.
        expect(inside(rectOf(place(state.previewOrder), "screenshot"), pointer)).toBe(true);
        changes.push({ order: state.previewOrder.join(), x });
      }
    }

    // Two slot changes on the way right and one on the way back. Nearest-centre
    // resolution flipped on nearly every step here.
    expect(changes).toHaveLength(4);
    for (let index = 2; index < changes.length; index += 1) {
      if (changes[index].order === changes[index - 2].order) {
        // Undoing a swap takes real travel, not a pixel of jitter.
        expect(Math.abs(changes[index].x - changes[index - 1].x)).toBeGreaterThan(CELL_WIDTH);
      }
    }
  });
});

describe("drag resolution", () => {
  it("commits the preview order and rolls back to the order captured at press", () => {
    const begun = press("deeplink", cell(1, 1));
    const dragged = step(begun, cell(0, 0), (order) => layout(order, 2));

    expect(commitToolDrag(dragged)).toEqual([
      "deeplink",
      "screenshot",
      "recording",
      "install",
    ]);
    expect(cancelToolDrag(dragged)).toEqual([...ORDER]);
  });

  it("snapshots the starting order so later store writes cannot change the rollback", () => {
    const mutable: ToolModuleId[] = [...ORDER];
    const begun = beginToolDrag("deeplink", cell(1, 1), mutable, RECTS);

    mutable.reverse();

    expect(cancelToolDrag(begun)).toEqual([...ORDER]);
  });
});

describe("edgeScrollVelocity", () => {
  it("stays still away from both edges", () => {
    expect(edgeScrollVelocity(400, 100, 700)).toBe(0);
  });

  it("scrolls up near the top edge and down near the bottom edge", () => {
    expect(edgeScrollVelocity(100 + EDGE_SCROLL_ZONE - 24, 100, 700)).toBeLessThan(0);
    expect(edgeScrollVelocity(700 - EDGE_SCROLL_ZONE + 24, 100, 700)).toBeGreaterThan(0);
  });

  it("accelerates toward the edge and caps beyond it", () => {
    const shallow = edgeScrollVelocity(700 - EDGE_SCROLL_ZONE + 8, 100, 700);
    const deep = edgeScrollVelocity(700 - 2, 100, 700);

    expect(deep).toBeGreaterThan(shallow);
    expect(deep).toBeLessThanOrEqual(EDGE_SCROLL_MAX_SPEED);
    expect(edgeScrollVelocity(900, 100, 700)).toBe(EDGE_SCROLL_MAX_SPEED);
    expect(edgeScrollVelocity(-100, 100, 700)).toBe(-EDGE_SCROLL_MAX_SPEED);
  });
});
