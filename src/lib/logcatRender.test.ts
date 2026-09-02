import { describe, expect, it } from "vitest";
import { LogcatRingBuffer, type LogcatEntry } from "@/lib/logcat";
import { groupCrashTraces, type LogcatRenderItem } from "@/lib/logcatRender";
import type { CrashKind } from "@/lib/logcatCrash";

function entry(seq: number, crashKind: CrashKind): LogcatEntry {
  return {
    seq,
    time: "09-01 12:00:00.000",
    level: crashKind === null ? "I" : "E",
    tag: "ExampleTag",
    pid: "123",
    tid: "456",
    message: `message-${seq}`,
    raw: `raw-${seq}`,
    searchKey: `exampletag\u0000message-${seq}`,
    crashKind,
    processName: null,
    packageName: null,
  };
}

function bufferWithKinds(kinds: readonly CrashKind[], capacity = kinds.length): LogcatRingBuffer {
  const buffer = new LogcatRingBuffer(capacity);
  kinds.forEach((kind, seq) => buffer.push(entry(seq, kind)));
  return buffer;
}

function group(
  buffer: LogcatRingBuffer,
  filteredSeqs: readonly number[],
  options: {
    filteredHead?: number;
    filteredCount?: number;
    autoFold?: boolean;
    expandedCrashSeqs?: ReadonlySet<number>;
  } = {},
): LogcatRenderItem[] {
  const filteredHead = options.filteredHead ?? 0;
  return groupCrashTraces({
    buffer,
    filteredSeqs,
    filteredHead,
    filteredCount: options.filteredCount ?? filteredSeqs.length - filteredHead,
    autoFold: options.autoFold ?? true,
    expandedCrashSeqs: options.expandedCrashSeqs ?? new Set<number>(),
  });
}

describe("groupCrashTraces", () => {
  it("folds consecutive stacktrace rows into the preceding crash head", () => {
    const buffer = bufferWithKinds(["crash", "stacktrace", "stacktrace", null]);

    expect(group(buffer, [0, 1, 2, 3])).toEqual([
      { kind: "crash-head", seq: 0, traceSeqs: [1, 2], expanded: false },
      { kind: "entry", seq: 3 },
    ]);
  });

  it("keeps stacktrace rows without a visible crash head as ordinary entries", () => {
    const buffer = bufferWithKinds(["crash", "stacktrace", "stacktrace", null]);

    expect(group(buffer, [1, 2, 3])).toEqual([
      { kind: "entry", seq: 1 },
      { kind: "entry", seq: 2 },
      { kind: "entry", seq: 3 },
    ]);
  });

  it("creates independent groups for adjacent crashes", () => {
    const buffer = bufferWithKinds([
      "crash",
      "stacktrace",
      "crash",
      "stacktrace",
      "stacktrace",
    ]);

    expect(group(buffer, [0, 1, 2, 3, 4])).toEqual([
      { kind: "crash-head", seq: 0, traceSeqs: [1], expanded: false },
      { kind: "crash-head", seq: 2, traceSeqs: [3, 4], expanded: false },
    ]);
  });

  it("stops a group at a non-stacktrace row in the filtered sequence", () => {
    const buffer = bufferWithKinds(["crash", "stacktrace", null, "stacktrace"]);
    const filteredSeqs = [0, 2, 3];

    expect(group(buffer, filteredSeqs)).toEqual([
      { kind: "crash-head", seq: 0, traceSeqs: [], expanded: false },
      { kind: "entry", seq: 2 },
      { kind: "entry", seq: 3 },
    ]);
    expect(filteredSeqs).toEqual([0, 2, 3]);
    expect(buffer.bySeq(3)?.crashKind).toBe("stacktrace");
  });

  it("uses the active filtered window and groups its adjacent trace rows", () => {
    const buffer = bufferWithKinds([null, "crash", "stacktrace", "stacktrace", null]);

    expect(
      group(buffer, [0, 1, 3, 4], {
        filteredHead: 1,
        filteredCount: 2,
      }),
    ).toEqual([
      { kind: "crash-head", seq: 1, traceSeqs: [3], expanded: false },
    ]);
  });

  it("expands only crash heads present in the expanded set", () => {
    const buffer = bufferWithKinds([
      "crash",
      "stacktrace",
      "crash",
      "stacktrace",
      "stacktrace",
    ]);

    expect(group(buffer, [0, 1, 2, 3, 4], { expandedCrashSeqs: new Set([2]) })).toEqual([
      { kind: "crash-head", seq: 0, traceSeqs: [1], expanded: false },
      { kind: "crash-head", seq: 2, traceSeqs: [3, 4], expanded: true },
      { kind: "entry", seq: 3 },
      { kind: "entry", seq: 4 },
    ]);
  });

  it("returns every available row as an ordinary entry when auto-fold is disabled", () => {
    const buffer = bufferWithKinds(["crash", "stacktrace", null]);

    expect(
      group(buffer, [0, 1, 2], {
        autoFold: false,
        expandedCrashSeqs: new Set([0]),
      }),
    ).toEqual([
      { kind: "entry", seq: 0 },
      { kind: "entry", seq: 1 },
      { kind: "entry", seq: 2 },
    ]);
  });

  it("ignores evicted seqs and leaves their surviving trace rows ungrouped", () => {
    const buffer = bufferWithKinds(["crash", "stacktrace", "stacktrace"], 2);

    expect(group(buffer, [0, 1, 2])).toEqual([
      { kind: "entry", seq: 1 },
      { kind: "entry", seq: 2 },
    ]);
  });
});
