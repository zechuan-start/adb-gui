import { describe, expect, it } from "vitest";
import type { LogcatEntry } from "@/lib/logcat";
import {
  formatLogLine,
  hasNativeTextSelection,
  isEditableCopyTarget,
  resolveCopyAction,
} from "@/lib/logcatSelection";

function entry(overrides: Partial<LogcatEntry> = {}): LogcatEntry {
  return {
    seq: 42,
    time: "08-29 22:00:00.123",
    level: "I",
    tag: "ExampleTag",
    pid: "123",
    tid: "456",
    message: "message",
    raw: "raw",
    searchKey: "exampletag\u0000message",
    crashKind: null,
    processName: "com.example.app:remote",
    packageName: "com.example.app",
    ...overrides,
  };
}

describe("formatLogLine", () => {
  it("formats the full available timestamp and fields in the required order", () => {
    expect(formatLogLine(entry())).toBe(
      "08-29 22:00:00.123\t123/456\tExampleTag\tcom.example.app\tI\tmessage",
    );
  });

  it("keeps stable tab-separated columns when fields are empty", () => {
    expect(
      formatLogLine(
        entry({
          time: "",
          pid: "",
          tid: "",
          tag: "",
          packageName: null,
          message: "",
        }),
      ),
    ).toBe("\t\t\t\tI\t");
  });
});

describe("copy selection inputs", () => {
  it("recognizes non-empty native selections without discarding whitespace", () => {
    expect(hasNativeTextSelection(null)).toBe(false);
    expect(hasNativeTextSelection("")).toBe(false);
    expect(hasNativeTextSelection(" ")).toBe(true);
    expect(hasNativeTextSelection("two lines\nselected")).toBe(true);
  });

  it.each(["input", "TEXTAREA", "Select"])(
    "recognizes %s as an editable target",
    (tagName) => {
      expect(isEditableCopyTarget({ tagName, isContentEditable: false })).toBe(true);
    },
  );

  it("recognizes contenteditable targets and leaves ordinary targets alone", () => {
    expect(isEditableCopyTarget({ tagName: "div", isContentEditable: true })).toBe(true);
    expect(isEditableCopyTarget({ tagName: "div", isContentEditable: false })).toBe(false);
    expect(isEditableCopyTarget(null)).toBe(false);
  });
});

describe("resolveCopyAction", () => {
  it("leaves copy handling to an editable target", () => {
    expect(
      resolveCopyAction({
        target: { tagName: "input", isContentEditable: false },
        nativeSelectionText: "",
        selectedSeq: 42,
        selectedEntry: entry(),
      }),
    ).toBeNull();
  });

  it("gives a native text selection priority over the selected row", () => {
    expect(
      resolveCopyAction({
        target: { tagName: "div", isContentEditable: false },
        nativeSelectionText: "selected message text",
        selectedSeq: 42,
        selectedEntry: entry(),
      }),
    ).toBeNull();
  });

  it("returns a complete-line copy action for the selected entry", () => {
    expect(
      resolveCopyAction({
        target: { tagName: "div", isContentEditable: false },
        nativeSelectionText: "",
        selectedSeq: 42,
        selectedEntry: entry(),
      }),
    ).toEqual({
      kind: "copy-log-line",
      seq: 42,
      text: "08-29 22:00:00.123\t123/456\tExampleTag\tcom.example.app\tI\tmessage",
    });
  });

  it("returns no action without a selected entry", () => {
    expect(
      resolveCopyAction({
        target: null,
        nativeSelectionText: null,
        selectedSeq: null,
        selectedEntry: null,
      }),
    ).toBeNull();
  });

  it("does not copy a stale entry that differs from the selected seq", () => {
    expect(
      resolveCopyAction({
        target: null,
        nativeSelectionText: null,
        selectedSeq: 43,
        selectedEntry: entry(),
      }),
    ).toBeNull();
  });
});
