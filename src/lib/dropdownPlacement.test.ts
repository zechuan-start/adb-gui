import { describe, expect, it } from "vitest";
import { dropdownPlacement } from "@/lib/dropdownPlacement";

describe("dropdown placement within the visible scroll area", () => {
  it("opens the final settings menu above its trigger without clipping options", () => {
    expect(dropdownPlacement({ top: 438, bottom: 474 }, { top: 60, bottom: 580 }, 182))
      .toEqual({ side: "above", maxHeight: 182 });
  });

  it("keeps a menu below when it fits", () => {
    expect(dropdownPlacement({ top: 100, bottom: 136 }, { top: 60, bottom: 580 }, 240))
      .toEqual({ side: "below", maxHeight: 240 });
  });

  it("limits a long menu to the larger available side", () => {
    expect(dropdownPlacement({ top: 170, bottom: 206 }, { top: 60, bottom: 300 }, 240))
      .toEqual({ side: "above", maxHeight: 102 });
  });

  it("keeps a long menu scrollable below a trigger near the top", () => {
    expect(dropdownPlacement({ top: 68, bottom: 104 }, { top: 60, bottom: 200 }, 240))
      .toEqual({ side: "below", maxHeight: 88 });
  });
});
