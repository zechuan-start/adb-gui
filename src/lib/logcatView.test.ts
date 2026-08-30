import { describe, expect, it } from "vitest";
import {
  columnSignature,
  columnsMatch,
  COMPACT_COLUMNS,
  packageFromProcessName,
  splitTimestamp,
  STANDARD_COLUMNS,
} from "@/lib/logcatView";

describe("logcatView", () => {
  it("splits a threadtime timestamp into date and clock fields", () => {
    expect(splitTimestamp("08-29 22:00:00.123")).toEqual({
      date: "08-29",
      clock: "22:00:00.123",
    });
  });

  it("preserves malformed timestamp text in the clock field", () => {
    expect(splitTimestamp("")).toEqual({ date: "", clock: "" });
    expect(splitTimestamp("device-time")).toEqual({ date: "", clock: "device-time" });
    expect(splitTimestamp("  malformed timestamp  ")).toEqual({
      date: "",
      clock: "malformed timestamp",
    });
  });

  it("derives a package name without a secondary-process suffix", () => {
    expect(packageFromProcessName("com.example.app")).toBe("com.example.app");
    expect(packageFromProcessName("com.example.app:remote")).toBe("com.example.app");
    expect(packageFromProcessName("  com.example.app:worker  ")).toBe("com.example.app");
    expect(packageFromProcessName("[kworker/0:1]")).toBeNull();
    expect(packageFromProcessName("system_server")).toBeNull();
    expect(packageFromProcessName("/system/bin/surfaceflinger")).toBeNull();
    expect(packageFromProcessName("")).toBeNull();
  });

  it("keeps the existing Standard fields and the compact message-focused preset", () => {
    expect(STANDARD_COLUMNS).toEqual({
      date: false,
      time: true,
      pid: true,
      tid: false,
      packageName: false,
      tag: true,
      level: true,
    });
    expect(COMPACT_COLUMNS).toEqual({
      date: false,
      time: true,
      pid: false,
      tid: false,
      packageName: false,
      tag: false,
      level: true,
    });
  });

  it("recognizes presets and creates a stable column signature", () => {
    expect(columnsMatch({ ...STANDARD_COLUMNS }, STANDARD_COLUMNS)).toBe(true);
    expect(columnsMatch({ ...STANDARD_COLUMNS, tid: true }, STANDARD_COLUMNS)).toBe(false);
    expect(columnSignature(STANDARD_COLUMNS)).toBe("0110011");
    expect(columnSignature(COMPACT_COLUMNS)).toBe("0100001");
  });
});
