export type ViewFormat = "standard" | "compact";

export type LogcatColumn =
  | "date"
  | "time"
  | "pid"
  | "tid"
  | "packageName"
  | "tag"
  | "level";

export interface ViewSettings {
  format: ViewFormat;
  columns: Record<LogcatColumn, boolean>;
  softWrap: boolean;
}

export const STANDARD_COLUMNS: Readonly<Record<LogcatColumn, boolean>> = {
  date: false,
  time: true,
  pid: true,
  tid: false,
  packageName: false,
  tag: true,
  level: true,
};

export const COMPACT_COLUMNS: Readonly<Record<LogcatColumn, boolean>> = {
  date: false,
  time: true,
  pid: false,
  tid: false,
  packageName: false,
  tag: false,
  level: true,
};

export const COLUMN_WIDTHS: Readonly<Record<LogcatColumn, string>> = {
  date: "w-10",
  time: "w-[5.75rem]",
  pid: "w-[5.75rem]",
  tid: "w-[5.75rem]",
  packageName: "w-[10.5rem]",
  tag: "w-[9.5rem]",
  level: "w-3.5",
};

export const LOGCAT_COLUMNS: ReadonlyArray<{
  column: LogcatColumn;
  label: string;
}> = [
  { column: "date", label: "日期" },
  { column: "time", label: "时间" },
  { column: "pid", label: "PID" },
  { column: "tid", label: "TID" },
  { column: "packageName", label: "包名" },
  { column: "tag", label: "Tag" },
  { column: "level", label: "等级" },
];

export function splitTimestamp(time: string): { date: string; clock: string } {
  const value = time.trim();
  const match = /^(\d{2}-\d{2})\s+(.+)$/.exec(value);
  if (!match) {
    return { date: "", clock: value };
  }
  return { date: match[1], clock: match[2] };
}

export function packageFromProcessName(name: string): string | null {
  const value = name.trim();
  const suffixIndex = value.indexOf(":");
  const packageName = suffixIndex < 0 ? value : value.slice(0, suffixIndex);
  return /^[A-Za-z][A-Za-z0-9_]*(?:\.[A-Za-z][A-Za-z0-9_]*)+$/.test(packageName)
    ? packageName
    : null;
}

export function columnsMatch(
  columns: Readonly<Record<LogcatColumn, boolean>>,
  preset: Readonly<Record<LogcatColumn, boolean>>,
): boolean {
  return LOGCAT_COLUMNS.every(({ column }) => columns[column] === preset[column]);
}

export function columnSignature(
  columns: Readonly<Record<LogcatColumn, boolean>>,
): string {
  return LOGCAT_COLUMNS.map(({ column }) => (columns[column] ? "1" : "0")).join("");
}
