import { memo } from "react";
import { cn } from "@/lib/utils";
import type { LogcatEntry, LogLevel } from "@/lib/logcat";
import {
  COLUMN_WIDTHS,
  splitTimestamp,
  type LogcatColumn,
} from "@/lib/logcatView";

const LEVEL_COLORS: Record<LogLevel, string> = {
  V: "text-slate-400",
  D: "text-gray-400",
  I: "text-blue-400",
  W: "text-amber-400",
  E: "text-red-400",
  F: "text-red-500 font-bold",
};

interface LogcatRowProps {
  entry: LogcatEntry;
  anchored: boolean;
  columns: Readonly<Record<LogcatColumn, boolean>>;
  softWrap: boolean;
  onTagClick: (tag: string) => void;
}

function LogcatRowView({
  entry,
  anchored,
  columns,
  softWrap,
  onTagClick,
}: LogcatRowProps) {
  const levelColor = LEVEL_COLORS[entry.level];
  const timestamp = splitTimestamp(entry.time);
  const packageName = entry.packageName ?? "";
  return (
    <div
      data-logcat-seq={entry.seq}
      role="row"
      aria-selected={anchored}
      className={cn(
        "flex min-h-5 gap-2 border-l-2 border-transparent px-4",
        softWrap ? "items-start py-0.5" : "h-full items-center",
        entry.crashKind === "crash" &&
          "border-destructive bg-destructive/10 hover:bg-destructive/15",
        entry.crashKind === "stacktrace" && "border-destructive/30",
        entry.crashKind === null && "hover:bg-secondary/40",
        anchored && entry.crashKind !== "crash" && "bg-secondary/70",
        anchored && "ring-1 ring-inset ring-ring",
      )}
    >
      {columns.date && (
        <span
          className={cn(COLUMN_WIDTHS.date, "shrink-0 select-none text-muted-foreground")}
          title={timestamp.date}
        >
          {timestamp.date}
        </span>
      )}
      {columns.time && (
        <span
          className={cn(COLUMN_WIDTHS.time, "shrink-0 select-none text-muted-foreground")}
          title={entry.time}
        >
          {timestamp.clock}
        </span>
      )}
      {columns.level && (
        <span
          className={cn(
            COLUMN_WIDTHS.level,
            "shrink-0 select-none text-center",
            levelColor,
          )}
        >
          {entry.level}
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
            "shrink-0 select-none truncate text-left text-muted-foreground",
            entry.tag && "cursor-pointer hover:text-foreground",
          )}
          title={entry.tag}
          tabIndex={entry.tag ? 0 : -1}
        >
          {entry.tag}
        </button>
      )}
      {columns.pid && (
        <span
          className={cn(COLUMN_WIDTHS.pid, "shrink-0 select-none text-muted-foreground")}
          title={entry.pid}
        >
          {entry.pid}
        </span>
      )}
      {columns.tid && (
        <span
          className={cn(COLUMN_WIDTHS.tid, "shrink-0 select-none text-muted-foreground")}
          title={entry.tid}
        >
          {entry.tid}
        </span>
      )}
      {columns.packageName && (
        <span
          className={cn(
            COLUMN_WIDTHS.packageName,
            "shrink-0 select-none truncate text-muted-foreground",
          )}
          title={packageName}
        >
          {packageName}
        </span>
      )}
      <span
        className={cn(
          "min-w-0 flex-1 select-text",
          softWrap
            ? "whitespace-pre-wrap break-words"
            : "overflow-hidden text-ellipsis whitespace-pre",
          levelColor,
        )}
        title={softWrap ? undefined : entry.message}
      >
        {entry.message}
      </span>
    </div>
  );
}

export const LogcatRow = memo(LogcatRowView);
LogcatRow.displayName = "LogcatRow";
