import { describe, expect, it } from "vitest";
import {
  DEFAULT_TOOL_ORDER,
  isToolModuleId,
  moveTool,
  reconcileToolOrder,
  sameToolOrder,
  shiftTool,
  toolPosition,
  type ToolModuleId,
} from "@/lib/toolLayout";

const defaults = DEFAULT_TOOL_ORDER;

describe("reconcileToolOrder", () => {
  it("falls back to defaults for values that are not an id array", () => {
    expect(reconcileToolOrder(null, defaults)).toEqual([...defaults]);
    expect(reconcileToolOrder(undefined, defaults)).toEqual([...defaults]);
    expect(reconcileToolOrder("screenshot", defaults)).toEqual([...defaults]);
    expect(reconcileToolOrder({ 0: "screenshot" }, defaults)).toEqual([...defaults]);
    expect(reconcileToolOrder(["screenshot", 7], defaults)).toEqual([...defaults]);
  });

  it("returns a legal order unchanged", () => {
    const stored: ToolModuleId[] = [
      "ports",
      "deeplink",
      "screenshot",
      "recording",
      "install",
      "keys",
      "clipboard",
      "currentApp",
      "bugReport",
    ];

    expect(reconcileToolOrder(stored, defaults)).toEqual(stored);
  });

  it("drops ids that no longer exist", () => {
    const stored = ["ports", "retiredTool", "screenshot"];

    expect(reconcileToolOrder(stored, defaults)).not.toContain("retiredTool");
    expect(reconcileToolOrder(stored, defaults)).toHaveLength(defaults.length);
  });

  it("reinserts a missing id at its default index instead of appending it", () => {
    const stored: ToolModuleId[] = [
      "screenshot",
      "recording",
      "deeplink",
      "ports",
      "keys",
      "clipboard",
      "currentApp",
      "bugReport",
    ];

    // "install" is absent; its default index is 2.
    expect(reconcileToolOrder(stored, defaults)).toEqual([
      "screenshot",
      "recording",
      "install",
      "deeplink",
      "ports",
      "keys",
      "clipboard",
      "currentApp",
      "bugReport",
    ]);
  });

  it("keeps the first occurrence of a duplicated id", () => {
    const stored = ["ports", "screenshot", "ports"];
    const reconciled = reconcileToolOrder(stored, defaults);

    expect(reconciled.filter((id) => id === "ports")).toHaveLength(1);
    expect(reconciled[0]).toBe("ports");
    expect(new Set(reconciled).size).toBe(defaults.length);
  });

  it("rebuilds the full default order from an empty array", () => {
    expect(reconcileToolOrder([], defaults)).toEqual([...defaults]);
  });

  it("never returns the defaults array itself", () => {
    expect(reconcileToolOrder(null, defaults)).not.toBe(defaults);
  });
});

describe("moveTool", () => {
  const order: ToolModuleId[] = ["screenshot", "recording", "install", "deeplink"];

  it("takes over the target slot when dragged toward the end", () => {
    expect(moveTool(order, "screenshot", "install")).toEqual([
      "recording",
      "install",
      "screenshot",
      "deeplink",
    ]);
  });

  it("takes over the target slot when dragged toward the start", () => {
    expect(moveTool(order, "deeplink", "recording")).toEqual([
      "screenshot",
      "deeplink",
      "recording",
      "install",
    ]);
  });

  it("swaps with the next module instead of ignoring an adjacent forward drag", () => {
    expect(moveTool(order, "screenshot", "recording")).toEqual([
      "recording",
      "screenshot",
      "install",
      "deeplink",
    ]);
  });

  it("moves a module to the first slot", () => {
    expect(moveTool(order, "deeplink", "screenshot")).toEqual([
      "deeplink",
      "screenshot",
      "recording",
      "install",
    ]);
  });

  it("moves a module to the last slot", () => {
    expect(moveTool(order, "screenshot", "deeplink")).toEqual([
      "recording",
      "install",
      "deeplink",
      "screenshot",
    ]);
  });

  it("leaves the order alone when the target is the moved module", () => {
    expect(moveTool(order, "install", "install")).toEqual(order);
  });

  it("leaves the order alone when an id is absent", () => {
    expect(moveTool(["screenshot", "recording"], "ports", "screenshot")).toEqual([
      "screenshot",
      "recording",
    ]);
  });
});

describe("shiftTool", () => {
  const order: ToolModuleId[] = ["screenshot", "recording", "install"];

  it("shifts a module one slot forward", () => {
    expect(shiftTool(order, "install", -1)).toEqual(["screenshot", "install", "recording"]);
  });

  it("shifts a module one slot backward", () => {
    expect(shiftTool(order, "screenshot", 1)).toEqual(["recording", "screenshot", "install"]);
  });

  it("clamps at the first slot", () => {
    expect(shiftTool(order, "screenshot", -1)).toEqual(order);
  });

  it("clamps at the last slot", () => {
    expect(shiftTool(order, "install", 1)).toEqual(order);
  });
});

describe("order identity helpers", () => {
  it("recognises tool module ids", () => {
    expect(isToolModuleId("ports")).toBe(true);
    expect(isToolModuleId("retiredTool")).toBe(false);
    expect(isToolModuleId(3)).toBe(false);
  });

  it("compares orders element by element", () => {
    expect(sameToolOrder(defaults, [...defaults])).toBe(true);
    expect(sameToolOrder(defaults, shiftTool(defaults, "ports", 1))).toBe(false);
    expect(sameToolOrder(defaults, defaults.slice(0, 3))).toBe(false);
  });

  it("reports a one-based position for announcements", () => {
    expect(toolPosition(defaults, "screenshot")).toBe(1);
    expect(toolPosition(defaults, "bugReport")).toBe(defaults.length);
  });
});
