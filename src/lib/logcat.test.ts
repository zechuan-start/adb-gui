import { describe, expect, it } from "vitest";
import {
  findFilteredSeqIndex,
  LogcatRingBuffer,
  normalizeLine,
  type LogcatEntry,
} from "@/lib/logcat";

function entry(seq: number, overrides: Partial<LogcatEntry> = {}): LogcatEntry {
  return {
    seq,
    time: "08-29 22:00:00.000",
    level: "I",
    tag: "ExampleTag",
    pid: "123",
    tid: "456",
    message: `message-${seq}`,
    raw: `raw-${seq}`,
    searchKey: `exampletag\u0000message-${seq}`,
    crashKind: null,
    processName: null,
    packageName: null,
    ...overrides,
  };
}

describe("LogcatRingBuffer", () => {
  it("appends without copying and preserves oldest-first access", () => {
    const buffer = new LogcatRingBuffer(3);
    buffer.push(entry(10));
    buffer.push(entry(11));
    buffer.push(entry(12));

    expect(buffer.count).toBe(3);
    expect(buffer.oldestSeq).toBe(10);
    expect(buffer.at(0)?.seq).toBe(10);
    expect(buffer.at(2)?.seq).toBe(12);
  });

  it("evicts the oldest entry when capacity is exceeded", () => {
    const buffer = new LogcatRingBuffer(3);
    [20, 21, 22, 23].forEach((seq) => buffer.push(entry(seq)));

    expect(buffer.count).toBe(3);
    expect(buffer.oldestSeq).toBe(21);
    expect(buffer.at(0)?.seq).toBe(21);
    expect(buffer.at(2)?.seq).toBe(23);
    expect(buffer.bySeq(20)).toBeUndefined();
    expect(buffer.bySeq(24)).toBeUndefined();
    expect(buffer.bySeq(22)?.seq).toBe(22);
  });

  it("supports capacity one and reuse after clear", () => {
    const buffer = new LogcatRingBuffer(1);
    buffer.push(entry(3));
    buffer.push(entry(4));
    expect(buffer.at(0)?.seq).toBe(4);

    buffer.clear();
    expect(buffer.count).toBe(0);
    expect(buffer.bySeq(4)).toBeUndefined();

    buffer.push(entry(100));
    expect(buffer.at(0)?.seq).toBe(100);
    expect(buffer.bySeq(100)?.seq).toBe(100);
  });

  it("rejects invalid capacities and non-contiguous sequences", () => {
    expect(() => new LogcatRingBuffer(0)).toThrow(RangeError);
    const buffer = new LogcatRingBuffer(2);
    buffer.push(entry(1));
    expect(() => buffer.push(entry(3))).toThrow(/expected 2/);
  });
});

describe("normalizeLine", () => {
  it("stores the seq and a lowercase tag-message search key", () => {
    const normalized = normalizeLine(
      {
        time: "08-29 22:00:00.000",
        level: "D",
        tag: "MyTAG",
        pid: "1",
        tid: "2",
        message: "Hello WORLD",
        raw: "raw",
      },
      42,
    );

    expect(normalized.seq).toBe(42);
    expect(normalized.searchKey).toBe("mytag\u0000hello world");
    expect(normalized.crashKind).toBeNull();
    expect(normalized.processName).toBeNull();
    expect(normalized.packageName).toBeNull();
  });

  it("freezes the supplied process identity on the normalized entry", () => {
    const normalized = normalizeLine(
      {
        time: "08-29 22:00:00.000",
        level: "I",
        tag: "ExampleTag",
        pid: "123",
        tid: "456",
        message: "message",
        raw: "raw",
      },
      7,
      {
        processName: "com.example.app:remote",
        packageName: "com.example.app",
      },
    );

    expect(normalized.processName).toBe("com.example.app:remote");
    expect(normalized.packageName).toBe("com.example.app");
  });

  it("does not create matches across the tag-message boundary", () => {
    const normalized = normalizeLine(
      {
        time: "",
        level: "I",
        tag: "foo",
        pid: "",
        tid: "",
        message: "bar",
        raw: "raw",
      },
      0,
    );

    expect(normalized.searchKey).not.toContain("oob");
  });

  it.each([
    {
      level: "E" as const,
      tag: "AndroidRuntime",
      message: "FATAL EXCEPTION: main",
      expected: "crash",
    },
    {
      level: "D" as const,
      tag: "ExampleTag",
      message: "\tat com.example.Main.run(Main.java:1)",
      expected: "stacktrace",
    },
  ])("stores $expected classification during normalization", ({ level, tag, message, expected }) => {
    const normalized = normalizeLine(
      {
        time: "08-29 22:00:00.000",
        level,
        tag,
        pid: "1",
        tid: "2",
        message,
        raw: "raw",
      },
      43,
    );

    expect(normalized.crashKind).toBe(expected);
  });
});

describe("findFilteredSeqIndex", () => {
  it("finds a seq relative to a compacted index head", () => {
    expect(findFilteredSeqIndex([1, 4, 7, 10, 13], 1, 3, 10)).toBe(2);
  });

  it("does not search outside the active filtered window", () => {
    const seqs = [1, 4, 7, 10, 13];
    expect(findFilteredSeqIndex(seqs, 1, 3, 1)).toBeNull();
    expect(findFilteredSeqIndex(seqs, 1, 3, 13)).toBeNull();
    expect(findFilteredSeqIndex(seqs, 1, 3, 8)).toBeNull();
  });
});
