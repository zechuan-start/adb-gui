import type { LogcatEntry } from "@/lib/logcat";
import { splitTimestamp } from "@/lib/logcatView";

export interface CopyTargetSnapshot {
  tagName: string | null;
  isContentEditable: boolean;
}

export interface ResolveCopyActionInput {
  target: CopyTargetSnapshot | null;
  nativeSelectionText: string | null;
  selectedSeq: number | null;
  selectedEntry: LogcatEntry | null;
}

export interface CopyLogLineAction {
  kind: "copy-log-line";
  seq: number;
  text: string;
}

export function hasNativeTextSelection(selectionText: string | null): boolean {
  return selectionText !== null && selectionText.length > 0;
}

export function isEditableCopyTarget(target: CopyTargetSnapshot | null): boolean {
  if (!target) {
    return false;
  }
  const tagName = target.tagName?.toLowerCase();
  return (
    target.isContentEditable ||
    tagName === "input" ||
    tagName === "textarea" ||
    tagName === "select"
  );
}

export function formatLogLine(entry: LogcatEntry): string {
  const { date, clock } = splitTimestamp(entry.time);
  const time = date ? `${date} ${clock}` : clock;
  const pidTid = entry.pid && entry.tid
    ? `${entry.pid}/${entry.tid}`
    : entry.pid || entry.tid;

  return [
    time,
    pidTid,
    entry.tag,
    entry.packageName ?? "",
    entry.level,
    entry.message,
  ].join("\t");
}

export function resolveCopyAction({
  target,
  nativeSelectionText,
  selectedSeq,
  selectedEntry,
}: ResolveCopyActionInput): CopyLogLineAction | null {
  if (
    isEditableCopyTarget(target) ||
    hasNativeTextSelection(nativeSelectionText) ||
    selectedSeq === null ||
    selectedEntry?.seq !== selectedSeq
  ) {
    return null;
  }

  return {
    kind: "copy-log-line",
    seq: selectedSeq,
    text: formatLogLine(selectedEntry),
  };
}
