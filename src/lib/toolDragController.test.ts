import { describe, expect, it } from "vitest";
import {
  DRAG_ACTIVATION_DISTANCE,
  EDGE_SCROLL_MAX_SPEED,
  EDGE_SCROLL_ZONE,
  beginToolDrag,
  cancelToolDrag,
  commitToolDrag,
  edgeScrollVelocity,
  updateToolDrag,
  type ToolDragRect,
} from "@/lib/toolDragController";
import type { ToolModuleId } from "@/lib/toolLayout";

// Two rows of two 200x100 cells with the production 14 px grid gap.
const CELL_WIDTH = 200;
const CELL_HEIGHT = 100;
const GAP = 14;

const RECTS: readonly ToolDragRect[] = [
  { id: "screenshot", x: 0, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT },
  { id: "recording", x: CELL_WIDTH + GAP, y: 0, width: CELL_WIDTH, height: CELL_HEIGHT },
  { id: "install", x: 0, y: CELL_HEIGHT + GAP, width: CELL_WIDTH, height: CELL_HEIGHT },
  {
    id: "deeplink",
    x: CELL_WIDTH + GAP,
    y: CELL_HEIGHT + GAP,
    width: CELL_WIDTH,
    height: CELL_HEIGHT,
  },
];

const ORDER: readonly ToolModuleId[] = ["screenshot", "recording", "install", "deeplink"];

function rectOf(id: ToolModuleId): ToolDragRect {
  const rect = RECTS.find((entry) => entry.id === id);
  if (!rect) {
    throw new Error(`missing rect for ${id}`);
  }
  return rect;
}

function centerOf(id: ToolModuleId) {
  const rect = rectOf(id);
  return { x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 };
}

function press(id: ToolModuleId, pointer = centerOf(id)) {
  return beginToolDrag(id, pointer, ORDER, RECTS);
}

describe("updateToolDrag", () => {
  it("stays inactive until the pointer passes the activation distance", () => {
    const origin = centerOf("deeplink");
    const begun = press("deeplink", origin);

    const nudged = updateToolDrag(
      begun,
      { x: origin.x + DRAG_ACTIVATION_DISTANCE, y: origin.y },
      RECTS,
    );

    expect(nudged.active).toBe(false);
    expect(nudged.offset).toEqual({ x: 0, y: 0 });
    expect(nudged.previewOrder).toEqual([...ORDER]);
  });

  it("keeps the grabbed point of the module under the pointer", () => {
    const slot = rectOf("deeplink");
    const grabbed = { x: slot.x + 12, y: slot.y + 9 };
    const begun = press("deeplink", grabbed);

    const dragged = updateToolDrag(begun, { x: grabbed.x + 60, y: grabbed.y + 40 }, RECTS);

    expect(dragged.offset).toEqual({ x: 60, y: 40 });
  });

  it("anchors the lift to the slot the module is taking over", () => {
    const slot = rectOf("deeplink");
    const grabbed = { x: slot.x + 12, y: slot.y + 9 };
    const begun = press("deeplink", grabbed);
    const target = rectOf("screenshot");
    const pointer = centerOf("screenshot");

    const dragged = updateToolDrag(begun, pointer, RECTS);

    // Measured against the target slot, not the one the drag started in, so the
    // module does not snap away from the pointer for a frame after the swap.
    expect(dragged.previewOrder[0]).toBe("deeplink");
    expect(dragged.offset).toEqual({
      x: pointer.x - target.x - 12,
      y: pointer.y - target.y - 9,
    });
  });

  it("reorders once the pointer reaches another module centre", () => {
    const begun = press("deeplink");

    const dragged = updateToolDrag(begun, centerOf("screenshot"), RECTS);

    expect(dragged.active).toBe(true);
    expect(dragged.previewOrder).toEqual(["deeplink", "screenshot", "recording", "install"]);
    expect(dragged.lockedTarget).toBe("screenshot");
  });

  it("resolves a pointer resting in the grid gap to the nearest module", () => {
    const begun = press("deeplink");

    // Between the first-row cells: inside neither rectangle, closer to the left one.
    const inGap = updateToolDrag(begun, { x: CELL_WIDTH + 5, y: CELL_HEIGHT / 2 }, RECTS);

    expect(inGap.lockedTarget).toBe("screenshot");
    expect(inGap.previewOrder).toEqual(["deeplink", "screenshot", "recording", "install"]);
  });

  it("does not reorder again while the pointer holds the same target", () => {
    const begun = press("deeplink");
    const dragged = updateToolDrag(begun, centerOf("screenshot"), RECTS);

    const held = updateToolDrag(dragged, centerOf("screenshot"), RECTS);

    expect(held.previewOrder).toEqual(dragged.previewOrder);
    expect(held.lockedTarget).toBe("screenshot");
  });

  it("reorders again once the pointer moves on to a different module", () => {
    const begun = press("deeplink");
    const dragged = updateToolDrag(begun, centerOf("screenshot"), RECTS);

    const moved = updateToolDrag(dragged, centerOf("recording"), RECTS);

    expect(moved.previewOrder).toEqual(["screenshot", "recording", "deeplink", "install"]);
    expect(moved.lockedTarget).toBe("recording");
  });

  it("releases the lock and keeps the preview over the dragged module's own slot", () => {
    const begun = press("deeplink");
    const dragged = updateToolDrag(begun, centerOf("screenshot"), RECTS);

    const overSelf = updateToolDrag(dragged, centerOf("deeplink"), RECTS);

    expect(overSelf.previewOrder).toEqual(dragged.previewOrder);
    expect(overSelf.lockedTarget).toBeNull();
  });

  it("keeps the preview unchanged when no rectangles were measured", () => {
    const begun = press("deeplink");

    const dragged = updateToolDrag(begun, { x: 0, y: 0 }, []);

    expect(dragged.active).toBe(true);
    expect(dragged.previewOrder).toEqual([...ORDER]);
  });
});

describe("drag resolution", () => {
  it("commits the preview order and rolls back to the order captured at press", () => {
    const begun = press("deeplink");
    const dragged = updateToolDrag(begun, centerOf("screenshot"), RECTS);

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
    const begun = beginToolDrag("deeplink", centerOf("deeplink"), mutable, RECTS);

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
