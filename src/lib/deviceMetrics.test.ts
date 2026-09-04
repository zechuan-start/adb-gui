import { describe, expect, it } from "vitest";
import {
  computeAdaptiveDomain,
  DeviceMetricsRingBuffer,
  downsample,
  formatMemory,
  formatMemoryParts,
  formatPercent,
  formatPercentParts,
  formatSpanLabel,
  formatTemperature,
} from "@/lib/deviceMetrics";

describe("DeviceMetricsRingBuffer", () => {
  it("keeps insertion order before and after wrapping", () => {
    const buffer = new DeviceMetricsRingBuffer<number>(3);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.toArray()).toEqual([1, 2]);

    buffer.push(3);
    buffer.push(4);
    expect(buffer.count).toBe(3);
    expect(buffer.toArray()).toEqual([2, 3, 4]);
    expect(buffer.at(0)).toBe(2);
    expect(buffer.at(2)).toBe(4);
  });

  it("clears contents without changing capacity", () => {
    const buffer = new DeviceMetricsRingBuffer<number>(2);
    buffer.push(1);
    buffer.clear();
    expect(buffer.count).toBe(0);
    buffer.push(2);
    expect(buffer.toArray()).toEqual([2]);
  });
});

describe("downsample", () => {
  it("respects the point limit and preserves a narrow spike", () => {
    const points = Array.from({ length: 100 }, (_, index) => ({
      index,
      value: index === 53 ? 999 : index % 7,
    }));
    const sampled = downsample(points, 20, (point) => point.value);

    expect(sampled.length).toBeLessThanOrEqual(20);
    expect(sampled[0]).toBe(points[0]);
    expect(sampled[sampled.length - 1]).toBe(points[99]);
    expect(sampled.some((point) => point.value === 999)).toBe(true);
  });

  it("handles empty and very small limits", () => {
    expect(downsample([], 10, (value: number) => value)).toEqual([]);
    expect(downsample([1, 2, 3], 1, (value) => value)).toEqual([3]);
    expect(downsample([1, 2, 3], 2, (value) => value)).toEqual([1, 3]);
  });
});

describe("metric formatting", () => {
  it("formats zero, large and unavailable values", () => {
    expect(formatPercent(0)).toBe("0.0%");
    expect(formatPercent(null)).toBe("--");
    expect(formatMemory(0)).toBe("0.0 MB");
    expect(formatMemory(2 * 1024 * 1024)).toBe("2.00 GB");
    expect(formatMemory(null)).toBe("--");
    expect(formatTemperature(32.16)).toBe("32.2°C");
    expect(formatTemperature(null)).toBe("--");
  });

  it("splits value and unit so the unit can be de-emphasised", () => {
    expect(formatMemoryParts(2 * 1024 * 1024)).toEqual({ value: "2.00", unit: "GB" });
    expect(formatMemoryParts(512 * 1024)).toEqual({ value: "512.0", unit: "MB" });
    expect(formatMemoryParts(null)).toEqual({ value: "--", unit: "" });
    expect(formatPercentParts(5.94)).toEqual({ value: "5.9", unit: "%" });
    expect(formatPercentParts(null)).toEqual({ value: "--", unit: "" });
  });

  it("labels the covered wall-clock span", () => {
    expect(formatSpanLabel(0)).toBe("最近 0 秒");
    expect(formatSpanLabel(45_000)).toBe("最近 45 秒");
    expect(formatSpanLabel(120_000)).toBe("最近 2 分");
    expect(formatSpanLabel(192_000)).toBe("最近 3 分 12 秒");
  });
});

describe("computeAdaptiveDomain", () => {
  it("falls back to a minimum span window when there is no data", () => {
    expect(computeAdaptiveDomain([], 0.5)).toEqual({ min: 0, max: 0.5 });
  });

  it("keeps a floor on the window so noise is not magnified", () => {
    const domain = computeAdaptiveDomain([3.6, 3.61, 3.6], 0.5);
    expect(domain.max - domain.min).toBeCloseTo(0.5, 6);
    expect(domain.min).toBeLessThan(3.6);
    expect(domain.max).toBeGreaterThan(3.61);
  });

  it("pads a window that is already wider than the floor", () => {
    const domain = computeAdaptiveDomain([2, 6], 0.5);
    expect(domain.min).toBeCloseTo(1.52, 6);
    expect(domain.max).toBeCloseTo(6.48, 6);
  });

  it("never produces a negative lower bound", () => {
    const domain = computeAdaptiveDomain([0.05], 0.5);
    expect(domain.min).toBe(0);
    expect(domain.max).toBeCloseTo(0.5, 6);
  });
});
