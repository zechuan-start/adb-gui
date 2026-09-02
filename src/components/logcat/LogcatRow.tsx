import { memo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { LogcatEntry } from "@/lib/logcat";
import {
  COLUMN_WIDTHS,
  splitTimestamp,
  type LogcatColumn,
} from "@/lib/logcatView";

interface LogcatRowProps {
  entry: LogcatEntry;
  selected: boolean;
  columns: Readonly<Record<LogcatColumn, boolean>>;
  softWrap: boolean;
  cozy: boolean;
  traceCount: number;
  traceExpanded: boolean;
  onTagClick: (tag: string) => void;
  onToggleTrace: (seq: number) => void;
}

function LogcatRowView({
  entry,
  selected,
  columns,
  softWrap,
  cozy,
  traceCount,
  traceExpanded,
  onTagClick,
  onToggleTrace,
}: LogcatRowProps) {
  const timestamp = splitTimestamp(entry.time);
  const packageName = entry.packageName ?? "";
  const pidTid = columns.pid && columns.tid
    ? `${entry.pid}/${entry.tid}`
    : columns.pid
      ? entry.pid
      : entry.tid;
  const messageTone = entry.crashKind === "stacktrace"
    ? "text-log-dim2"
    : entry.level === "W"
      ? "text-warn"
      : entry.level === "E" || entry.level === "F"
        ? "text-err"
        : "text-ink";
  const statusStrip = entry.level === "W"
    ? "border-l-warn"
    : entry.level === "E" || entry.level === "F"
      ? "border-l-err"
      : "border-l-transparent";
  return (
    <div
      data-logcat-seq={entry.seq}
      role="row"
      aria-selected={selected}
      className={cn(
        "flex min-h-5 gap-2 border-l-[3px] px-3 font-data hover:bg-hover",
        softWrap ? (cozy ? "items-start py-1" : "items-start py-0.5") : "h-full items-center",
        statusStrip,
        entry.crashKind === "crash" && "bg-err-band",
        selected && "bg-note/20 ring-1 ring-inset ring-note",
      )}
    >
      {columns.date && (
        <span
          className={cn(COLUMN_WIDTHS.date, "shrink-0 select-none text-log-dim")}
          title={timestamp.date}
        >
          {timestamp.date}
        </span>
      )}
      {columns.time && (
        <span
          className={cn(COLUMN_WIDTHS.time, "shrink-0 select-none text-log-dim")}
          title={entry.time}
        >
          {timestamp.clock}
        </span>
      )}
      {(columns.pid || columns.tid) && (
        <span
          className={cn(COLUMN_WIDTHS.pid, "shrink-0 select-none truncate text-log-dim")}
          title={pidTid}
        >
          {pidTid}
        </span>
      )}
      {columns.tag && (
        <button
          type="button"
          onClick={() => {
            if (entry.tag) {
              onTagClick(entry.tag);
            }
          }}
          className={cn(
            COLUMN_WIDTHS.tag,
            "shrink-0 select-none truncate text-left font-medium text-log-tag",
            entry.tag && "cursor-pointer hover:text-ink",
          )}
          title={entry.tag}
          tabIndex={entry.tag ? 0 : -1}
        >
          {entry.tag}
        </button>
      )}
      {columns.packageName && (
        <span
          className={cn(
            COLUMN_WIDTHS.packageName,
            "shrink-0 select-none truncate text-log-dim",
          )}
          title={packageName}
        >
          {packageName}
        </span>
      )}
      {columns.level && (
        <span
          className={cn(
            COLUMN_WIDTHS.level,
            "shrink-0 select-none text-center font-semibold",
            messageTone,
          )}
        >
          {entry.level}
        </span>
      )}
      <span
        data-logcat-message
        className={cn(
          "min-w-0 flex-1 select-text",
          softWrap
            ? "whitespace-pre-wrap break-words"
            : "overflow-hidden text-ellipsis whitespace-pre",
          messageTone,
          entry.crashKind === "stacktrace" && "ml-2 border-l border-err/45 pl-3",
        )}
        title={softWrap ? undefined : entry.message}
      >
        {entry.message}
      </span>
      {traceCount > 0 && (
        <button
          type="button"
          onClick={() => onToggleTrace(entry.seq)}
          className="flex h-5 shrink-0 select-none items-center gap-1 border border-err/35 px-1.5 text-[10px] text-err hover:bg-err-band"
          aria-expanded={traceExpanded}
          title={traceExpanded ? "折叠堆栈" : "展开堆栈"}
        >
          {traceExpanded ? (
            <ChevronDown className="h-3 w-3" aria-hidden="true" />
          ) : (
            <ChevronRight className="h-3 w-3" aria-hidden="true" />
          )}
          <span>+{traceCount} 行堆栈</span>
        </button>
      )}
    </div>
  );
}

export const LogcatRow = memo(LogcatRowView);
LogcatRow.displayName = "LogcatRow";
