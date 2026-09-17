import { describe, expect, it } from "vitest";
import { planLayoutFlip, type FlipPoint } from "@/lib/layoutFlip";

function points(entries: Record<string, FlipPoint>): Map<string, FlipPoint> {
  return new Map(Object.entries(entries));
}

describe("planLayoutFlip", () => {
  it("starts each moved element from where it was painted", () => {
    const moves = planLayoutFlip(
      points({ a: { x: 0, y: 0 }, b: { x: 214, y: 0 } }),
      points({ a: { x: 214, y: 0 }, b: { x: 0, y: 0 } }),
      new Map(),
    );

    expect(moves).toEqual([
      { id: "a", from: { x: -214, y: 0 } },
      { id: "b", from: { x: 214, y: 0 } },
    ]);
  });

  it("skips elements that did not move by at least a pixel", () => {
    const moves = planLayoutFlip(
      points({ a: { x: 10.4, y: 20 }, b: { x: 0, y: 0 } }),
      points({ a: { x: 10, y: 20 }, b: { x: 0, y: 114 } }),
      new Map(),
    );

    expect(moves).toEqual([{ id: "b", from: { x: 0, y: -114 } }]);
  });

  it("lets an animation already heading to the same slot run on", () => {
    const moves = planLayoutFlip(
      // Captured mid-flight, so it is painted away from its slot.
      points({ a: { x: 120, y: 0 } }),
      points({ a: { x: 214, y: 0 } }),
      points({ a: { x: 214, y: 0 } }),
    );

    expect(moves).toEqual([]);
  });

  it("retargets an animation whose slot changed from its painted position", () => {
    const moves = planLayoutFlip(
      points({ a: { x: 120, y: 0 } }),
      points({ a: { x: 0, y: 114 } }),
      points({ a: { x: 214, y: 0 } }),
    );

    expect(moves).toEqual([{ id: "a", from: { x: 120, y: -114 } }]);
  });

  it("stops an animation whose element already sits on its new slot", () => {
    const moves = planLayoutFlip(
      points({ a: { x: 0, y: 114 } }),
      points({ a: { x: 0, y: 114 } }),
      points({ a: { x: 214, y: 0 } }),
    );

    expect(moves).toEqual([{ id: "a", from: null }]);
  });

  it("ignores elements that were not painted before the change", () => {
    const moves = planLayoutFlip(
      points({}),
      points({ a: { x: 0, y: 114 } }),
      new Map(),
    );

    expect(moves).toEqual([]);
  });
});
