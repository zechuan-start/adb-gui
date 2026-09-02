import { type LogcatRingBuffer } from "@/lib/logcat";

export type LogcatRenderItem =
  | { kind: "entry"; seq: number }
  | {
      kind: "crash-head";
      seq: number;
      traceSeqs: readonly number[];
      expanded: boolean;
    };

interface GroupCrashTracesOptions {
  buffer: LogcatRingBuffer;
  filteredSeqs: readonly number[];
  filteredHead: number;
  filteredCount: number;
  autoFold: boolean;
  expandedCrashSeqs: ReadonlySet<number>;
}

export function groupCrashTraces({
  buffer,
  filteredSeqs,
  filteredHead,
  filteredCount,
  autoFold,
  expandedCrashSeqs,
}: GroupCrashTracesOptions): LogcatRenderItem[] {
  const renderItems: LogcatRenderItem[] = [];
  const end = filteredHead + filteredCount;

  if (!autoFold) {
    for (let index = filteredHead; index < end; index += 1) {
      const seq = filteredSeqs[index];
      if (buffer.bySeq(seq) !== undefined) {
        renderItems.push({ kind: "entry", seq });
      }
    }
    return renderItems;
  }

  let index = filteredHead;
  while (index < end) {
    const seq = filteredSeqs[index];
    const entry = buffer.bySeq(seq);
    if (entry === undefined) {
      index += 1;
      continue;
    }

    if (entry.crashKind !== "crash") {
      renderItems.push({ kind: "entry", seq });
      index += 1;
      continue;
    }

    const traceSeqs: number[] = [];
    let nextIndex = index + 1;
    while (nextIndex < end) {
      const traceSeq = filteredSeqs[nextIndex];
      const traceEntry = buffer.bySeq(traceSeq);
      if (traceEntry?.crashKind !== "stacktrace") {
        break;
      }
      traceSeqs.push(traceSeq);
      nextIndex += 1;
    }

    const expanded = expandedCrashSeqs.has(seq);
    renderItems.push({ kind: "crash-head", seq, traceSeqs, expanded });
    if (expanded) {
      for (const traceSeq of traceSeqs) {
        renderItems.push({ kind: "entry", seq: traceSeq });
      }
    }
    index = nextIndex;
  }

  return renderItems;
}
