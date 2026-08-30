import type { LogcatLine as BackendLogcatLine } from "@/lib/tauri";
import { detectCrashKind, type CrashKind } from "@/lib/logcatCrash";

export type LogLevel = "V" | "D" | "I" | "W" | "E" | "F";

export const LEVELS: readonly LogLevel[] = ["V", "D", "I", "W", "E", "F"];
export const LOGCAT_CAPACITY = 10_000;
export const LOGCAT_ROW_HEIGHT = 20;

type NormalizableLogcatLine = Omit<BackendLogcatLine, "level"> & {
  level: LogLevel;
};

export interface LogcatEntry extends NormalizableLogcatLine {
  seq: number;
  searchKey: string;
  crashKind: CrashKind;
  processName: string | null;
  packageName: string | null;
}

export interface LogcatProcessIdentity {
  processName: string | null;
  packageName: string | null;
}

const UNKNOWN_PROCESS_IDENTITY: LogcatProcessIdentity = {
  processName: null,
  packageName: null,
};

export function normalizeLine(
  line: NormalizableLogcatLine,
  seq: number,
  identity: LogcatProcessIdentity = UNKNOWN_PROCESS_IDENTITY,
): LogcatEntry {
  return {
    ...line,
    seq,
    searchKey: `${line.tag}\u0000${line.message}`.toLowerCase(),
    crashKind: detectCrashKind(line.level, line.tag, line.message),
    processName: identity.processName,
    packageName: identity.packageName,
  };
}

export class LogcatRingBuffer {
  private readonly slots: Array<LogcatEntry | undefined>;
  private start = 0;
  private length = 0;
  private baseSeq = 0;

  constructor(private readonly capacity: number = LOGCAT_CAPACITY) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError("Logcat capacity must be a positive integer");
    }
    this.slots = new Array<LogcatEntry | undefined>(capacity);
  }

  push(entry: LogcatEntry): void {
    if (this.length === 0) {
      this.start = 0;
      this.baseSeq = entry.seq;
      this.slots[0] = entry;
      this.length = 1;
      return;
    }

    const expectedSeq = this.baseSeq + this.length;
    if (entry.seq !== expectedSeq) {
      throw new Error(`Logcat seq must be contiguous: expected ${expectedSeq}, got ${entry.seq}`);
    }

    if (this.length < this.capacity) {
      this.slots[(this.start + this.length) % this.capacity] = entry;
      this.length += 1;
      return;
    }

    this.slots[this.start] = entry;
    this.start = (this.start + 1) % this.capacity;
    this.baseSeq += 1;
  }

  at(index: number): LogcatEntry | undefined {
    if (!Number.isInteger(index) || index < 0 || index >= this.length) {
      return undefined;
    }
    return this.slots[(this.start + index) % this.capacity];
  }

  bySeq(seq: number): LogcatEntry | undefined {
    const offset = seq - this.baseSeq;
    return this.at(offset);
  }

  get count(): number {
    return this.length;
  }

  get oldestSeq(): number {
    return this.baseSeq;
  }

  clear(): void {
    this.slots.fill(undefined);
    this.start = 0;
    this.length = 0;
    this.baseSeq = 0;
  }
}

export function findFilteredSeqIndex(
  filteredSeqs: readonly number[],
  head: number,
  count: number,
  seq: number,
): number | null {
  let low = head;
  let high = head + count - 1;
  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2);
    const candidate = filteredSeqs[middle];
    if (candidate === seq) {
      return middle - head;
    }
    if (candidate < seq) {
      low = middle + 1;
    } else {
      high = middle - 1;
    }
  }
  return null;
}
