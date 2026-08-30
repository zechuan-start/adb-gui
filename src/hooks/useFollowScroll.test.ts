import { describe, expect, it } from "vitest";
import {
  anchoredLogcatScrollTop,
  isNearLogcatBottom,
} from "@/hooks/useFollowScroll";

describe("useFollowScroll helpers", () => {
  it("recognizes the configured bottom threshold", () => {
    expect(isNearLogcatBottom({ scrollHeight: 1_000, scrollTop: 560, clientHeight: 400 })).toBe(false);
    expect(isNearLogcatBottom({ scrollHeight: 1_000, scrollTop: 561, clientHeight: 400 })).toBe(true);
  });

  it("keeps an anchored fixed-height row at the same viewport offset", () => {
    expect(anchoredLogcatScrollTop(25, 80, 2_000, 400)).toBe(420);
  });

  it("clamps anchor compensation to the scrollable range", () => {
    expect(anchoredLogcatScrollTop(1, 80, 2_000, 400)).toBe(0);
    expect(anchoredLogcatScrollTop(100, 0, 1_000, 400)).toBe(600);
  });
});
