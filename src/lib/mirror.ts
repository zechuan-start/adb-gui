// Presentation rules for the scrcpy launcher. Rust owns discovery, argument
// syntax and process outcomes; this module only maps their results to views.

import type { Messages } from "@/i18n";
import { errorText, type AppErrorPayload } from "@/i18n/errors";
import {
  MIRROR_OPTIONS,
  type MirrorOption,
  type MirrorOptions,
  type MirrorPreferences,
} from "@/lib/settings";
import type { MirrorOutcome, MirrorRequest, ScrcpyInfo } from "@/lib/tauri";

export type MirrorDetection =
  | { status: "idle" }
  | { status: "detecting"; scrcpyPath: string | null }
  | { status: "ready"; scrcpyPath: string | null; info: ScrcpyInfo }
  | { status: "error"; scrcpyPath: string | null; error: AppErrorPayload };

export type MirrorSession =
  | { phase: "starting" }
  | { phase: "running"; sessionId: number; stopError: AppErrorPayload | null }
  | { phase: "stopping"; sessionId: number };

export interface MirrorLastExit {
  outcome: MirrorOutcome;
  error: AppErrorPayload | null;
  at: number;
}

// Start failures with these codes describe the scrcpy installation itself.
export const DETECTION_ERROR_CODES: ReadonlySet<string> = new Set([
  "mirror.notFound",
  "mirror.customPathInvalid",
  "mirror.versionUnreadable",
  "mirror.versionTimeout",
  "mirror.tooOld",
]);

export function mirrorRequest(preferences: MirrorPreferences): MirrorRequest {
  return {
    scrcpyPath: preferences.scrcpyPath,
    preset: preferences.preset,
    options: { ...preferences.options },
    extraArgs: preferences.extraArgs,
  };
}

/** Detection for the stored path only; a result for another path is stale. */
export function currentDetection(
  detection: MirrorDetection,
  scrcpyPath: string | null,
): MirrorDetection {
  return detection.status !== "idle" && detection.scrcpyPath !== scrcpyPath
    ? { status: "detecting", scrcpyPath }
    : detection;
}

export type MirrorToolView =
  | { kind: "unavailable" }
  | { kind: "detecting" }
  | { kind: "notFound" }
  | { kind: "tooOld"; error: AppErrorPayload }
  | { kind: "pathInvalid"; error: AppErrorPayload }
  | { kind: "detectionFailed"; error: AppErrorPayload }
  | { kind: "ready"; last: MirrorLastExit | null }
  | { kind: "starting" }
  | { kind: "running"; stopError: AppErrorPayload | null }
  | { kind: "stopping" };

export function mirrorToolView({
  native,
  online,
  detection,
  session,
  lastExit,
}: {
  native: boolean;
  online: boolean;
  detection: MirrorDetection;
  session: MirrorSession | undefined;
  lastExit: MirrorLastExit | undefined;
}): MirrorToolView {
  // A live session stays stoppable even after the device drops offline.
  if (session?.phase === "starting") return { kind: "starting" };
  if (session?.phase === "running") return { kind: "running", stopError: session.stopError };
  if (session?.phase === "stopping") return { kind: "stopping" };
  if (!native || !online) return { kind: "unavailable" };
  if (detection.status === "idle" || detection.status === "detecting") {
    return { kind: "detecting" };
  }
  if (detection.status === "error") {
    const { error } = detection;
    switch (error.code) {
      case "mirror.notFound":
        return { kind: "notFound" };
      case "mirror.tooOld":
        return { kind: "tooOld", error };
      case "mirror.customPathInvalid":
        return { kind: "pathInvalid", error };
      default:
        return { kind: "detectionFailed", error };
    }
  }
  return { kind: "ready", last: lastExit ?? null };
}

/** scrcpy's own ERROR text when it has one; the full translation otherwise. */
export function mirrorFailureText(error: AppErrorPayload, messages: Messages): string {
  return error.code === "mirror.exitFailed" && error.detail
    ? error.detail
    : errorText(error, messages);
}

export function mirrorOptionChips(
  options: MirrorOptions,
  messages: Messages,
): { value: MirrorOption; label: string; disabled: boolean }[] {
  return MIRROR_OPTIONS.map(({ value, label, requiresControl }) => ({
    value,
    label: label(messages),
    // Stored values survive; Rust leaves them out of argv while view-only is on.
    disabled: requiresControl && options.viewOnly,
  }));
}
