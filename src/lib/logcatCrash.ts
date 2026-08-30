import type { LogLevel } from "@/lib/logcat";

export type CrashKind = "crash" | "stacktrace" | null;

const STACK_FRAME_RE = /^\s+at\s+[\w$.]+\(.*\)/;
const CAUSED_BY_RE = /^Caused by:\s/;
const MORE_FRAMES_RE = /^\s*\.\.\.\s+\d+\s+more\s*$/;
const EXCEPTION_HEADER_RE = /^[\w.$]+(Exception|Error|Throwable)(:|$)/;

export function detectCrashKind(level: LogLevel, tag: string, message: string): CrashKind {
  if (message.includes("FATAL EXCEPTION")) {
    return "crash";
  }
  if (
    tag === "AndroidRuntime" &&
    (level === "E" || level === "F") &&
    message.includes("Process:") &&
    message.includes("Exception")
  ) {
    return "crash";
  }
  if (tag === "DEBUG" && message.includes("*** *** ***")) {
    return "crash";
  }
  if (message.startsWith("ANR in ")) {
    return "crash";
  }

  if (
    STACK_FRAME_RE.test(message) ||
    CAUSED_BY_RE.test(message) ||
    MORE_FRAMES_RE.test(message) ||
    EXCEPTION_HEADER_RE.test(message)
  ) {
    return "stacktrace";
  }

  return null;
}
