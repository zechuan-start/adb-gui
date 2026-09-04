import { describe, expect, it } from "vitest";
import {
  DeviceMetricsRingBuffer,
  downsample,
  formatMemory,
  formatPercent,
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
    expect(formatTemperature(32.16)).toBe("32.2 C");
    expect(formatTemperature(null)).toBe("--");
  });
});
