import type { DeviceInfo } from "@/lib/tauri";

export const METRICS_HISTORY_CAPACITY = 1_800;
export const METRICS_CHART_MAX_POINTS = 300;

export function getDeviceMetricsKey(device: DeviceInfo): string {
  return device.device_id ?? device.alias_identity ?? device.serial;
}

export class DeviceMetricsRingBuffer<T> {
  private readonly items: (T | undefined)[];
  private writeIndex = 0;
  private length = 0;

  constructor(readonly capacity: number = METRICS_HISTORY_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity <= 0) {
      throw new Error("Ring buffer capacity must be a positive integer");
    }
    this.items = new Array<T | undefined>(capacity);
  }

  get count(): number {
    return this.length;
  }

  push(item: T): void {
    this.items[this.writeIndex] = item;
    this.writeIndex = (this.writeIndex + 1) % this.capacity;
    this.length = Math.min(this.length + 1, this.capacity);
  }

  at(index: number): T | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      return undefined;
    }
    const oldest = this.length === this.capacity ? this.writeIndex : 0;
    return this.items[(oldest + index) % this.capacity];
  }

  toArray(): T[] {
    const result: T[] = [];
    for (let index = 0; index < this.length; index += 1) {
      const item = this.at(index);
      if (item !== undefined) {
        result.push(item);
      }
    }
    return result;
  }

  clear(): void {
    this.items.fill(undefined);
    this.writeIndex = 0;
    this.length = 0;
  }
}

export function downsample<T>(
  points: readonly T[],
  maxPoints: number,
  valueOf: (point: T) => number,
): T[] {
  if (maxPoints <= 0 || points.length === 0) {
    return [];
  }
  if (points.length <= maxPoints) {
    return Array.from(points);
  }
  if (maxPoints === 1) {
    return [points[points.length - 1]];
  }
  if (maxPoints === 2) {
    return [points[0], points[points.length - 1]];
  }

  const result: T[] = [points[0]];
  const interiorCount = points.length - 2;
  const interiorBudget = maxPoints - 2;
  const bucketCount = Math.max(1, Math.ceil(interiorBudget / 2));

  for (let bucket = 0; bucket < bucketCount && result.length < maxPoints - 1; bucket += 1) {
    const start = 1 + Math.floor((bucket * interiorCount) / bucketCount);
    const end = 1 + Math.floor(((bucket + 1) * interiorCount) / bucketCount);
    let minIndex = start;
    let maxIndex = start;
    for (let index = start + 1; index < end; index += 1) {
      if (valueOf(points[index]) < valueOf(points[minIndex])) {
        minIndex = index;
      }
      if (valueOf(points[index]) > valueOf(points[maxIndex])) {
        maxIndex = index;
      }
    }
    const ordered = minIndex <= maxIndex ? [minIndex, maxIndex] : [maxIndex, minIndex];
    for (const index of ordered) {
      if (result.length >= maxPoints - 1) {
        break;
      }
      if (result[result.length - 1] !== points[index]) {
        result.push(points[index]);
      }
    }
  }

  result.push(points[points.length - 1]);
  return result;
}

export function formatPercent(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(1)}%`;
}

export function formatMemory(kilobytes: number | null): string {
  if (kilobytes === null || !Number.isFinite(kilobytes) || kilobytes < 0) {
    return "--";
  }
  if (kilobytes >= 1024 * 1024) {
    return `${(kilobytes / 1024 / 1024).toFixed(2)} GB`;
  }
  return `${(kilobytes / 1024).toFixed(1)} MB`;
}

export function formatTemperature(value: number | null): string {
  return value === null || !Number.isFinite(value) ? "--" : `${value.toFixed(1)} C`;
}
