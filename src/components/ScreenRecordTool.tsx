import { errorText, useT } from "@/i18n";
import { useEffect, useState } from "react";
import {
  Clock,
  FolderOpen,
  RefreshCw,
  Save,
  Square,
  Trash2,
  Video,
} from "lucide-react";
import { requireSettings } from "@/store/settings";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import {
  captureDestination,
  confirmDiscardRecording,
  discardScreenRecord,
  getScreenRecordStatus,
  isTauriRuntime,
  openFile,
  pickRecordingSavePath,
  revealFile,
  startScreenRecord,
  stopScreenRecord,
} from "@/lib/tauri";
import {
  createRecordingController,
  IDLE_RECORDING,
  type RecordingView,
} from "@/lib/screenRecordSession";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { createScreenRecordPollingController } from "@/hooks/screenRecordPollingController";
import { cn } from "@/lib/utils";

export function ScreenRecordTool({ active = true }: { active?: boolean }) {
  const t = useT();
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const online = Boolean(device && isOnlineDevice(device));
  const [view, setView] = useState<RecordingView>({
    status: IDLE_RECORDING,
    busy: null,
    error: null,
    saved: null,
  });
  const [controller] = useState(() =>
    createRecordingController({
      getStatus: getScreenRecordStatus,
      start: (serial) =>
        startScreenRecord(
          serial,
          captureDestination(requireSettings().capture.directory),
        ),
      save: stopScreenRecord,
      discard: discardScreenRecord,
      behavior: () => requireSettings().recording,
      choosePath: pickRecordingSavePath,
      confirmDiscard: confirmDiscardRecording,
      onChange: setView,
      onError: (message) =>
        useFeedbackStore.getState().showToast("error", message),
      onSaved: (result, behavior) => {
        const openFailed = behavior.openAfterSave && !result.opened;
        useFeedbackStore.getState().showToast(
          result.source_cleanup_error || openFailed ? "error" : "success",
          (t) => t.tools.screenRecordTool.recordingSaved({
            path: result.path,
            warnings: [
              result.source_cleanup_error ? errorText(result.source_cleanup_error, t) : null,
              openFailed ? t.tools.screenRecordTool.couldNotOpenVideoAutomatically : null,
            ].filter((warning): warning is string => warning !== null),
          }),
        );
      },
      onDiscarded: (result) =>
        useFeedbackStore
          .getState()
          .showToast(
            result.source_cleanup_error ? "error" : "success",
            (t) => (result.source_cleanup_error
              ? t.tools.screenRecordTool.recoveryAbandonedSourceMayRemainOnDevice({ serial: result.serial, path: result.remote_path, detail: errorText(result.source_cleanup_error, t) })
              : t.tools.screenRecordTool.saveAbandonedAndDeviceSourceDeleted),
          ),
    }),
  );

  useEffect(() => {
    controller.resume();
    return () => controller.dispose();
  }, [controller]);
  useEffect(() => {
    controller.bindSerial(selectedDevice);
  }, [controller, selectedDevice]);
  const shouldPoll = active || view.status.phase !== "idle";
  useEffect(() => {
    if (!shouldPoll || !isTauriRuntime()) return;
    const polling = createScreenRecordPollingController({
      loadStatus: controller.readStatus,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelSchedule: (handle) => window.clearTimeout(handle),
      onStatus: controller.acceptStatus,
      onError: (error) =>
        useFeedbackStore
          .getState()
          .showToast("error", (t) => (t.tools.screenRecordTool.couldNotRefreshRecordingStatus({ detail: errorText(error, t) }))),
    });
    polling.run();
    return () => polling.dispose();
  }, [controller, shouldPoll]);

  const { status, busy, saved } = view;
  const idle = status.phase === "idle";
  const failed =
    status.phase === "save_failed" || (!idle && Boolean(view.error));
  const error = view.error ?? status.error;
  const saving = busy !== null || status.phase === "saving";
  const elapsed = `${Math.floor(status.elapsed_secs / 60)
    .toString()
    .padStart(
      2,
      "0",
    )}:${(status.elapsed_secs % 60).toString().padStart(2, "0")}`;
  const buttonClass =
    "inline-flex min-h-8 items-center justify-center gap-1.5 border border-rule px-2 text-[11px] hover:bg-hover disabled:opacity-40";

  async function openSaved(reveal: boolean) {
    if (!saved) return;
    try {
      await (reveal ? revealFile(saved.path) : openFile(saved.path));
    } catch (failure) {
      useFeedbackStore
        .getState()
        .showToast("error", (t) => (t.tools.screenRecordTool.couldNotOpenSavedRecording({ detail: errorText(failure, t) })));
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <button
        type="button"
        disabled={saving || (idle && !online) || failed}
        onClick={() =>
          idle
            ? device && void controller.start(device.serial)
            : void controller.save(false)
        }
        className={cn(
          "flex h-9 w-full shrink-0 items-center justify-center gap-2 border text-xs font-medium disabled:opacity-40",
          idle ? "border-ink bg-ink text-onink" : "border-err text-err",
        )}
      >
        {saving ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : idle ? (
          <Video className="h-4 w-4" />
        ) : (
          <Square className="h-4 w-4" />
        )}
        {busy === "start"
          ? t.tools.screenRecordTool.starting
          : saving
            ? t.tools.screenRecordTool.processing
            : failed
              ? t.tools.screenRecordTool.waitingToRecoverSave
              : idle
                ? t.tools.screenRecordTool.startRecording
                : t.tools.screenRecordTool.stopAndSave}
      </button>
      <div className="mt-3 grid grid-cols-2 border-y border-rule text-xs">
        <div className="border-r border-dashed border-rule px-2.5 py-2">
          <div className="text-[10.5px] text-ink3">{t.tools.screenRecordTool.status}</div>
          <div className="mt-1 font-medium">
            {failed
              ? t.tools.screenRecordTool.saveFailed
              : saving
                ? t.tools.screenRecordTool.processingLabel
                : status.phase === "recording"
                  ? t.tools.screenRecordTool.recording
                  : status.phase === "pending_save"
                    ? t.tools.screenRecordTool.pendingSave
                    : online
                      ? t.tools.screenRecordTool.ready
                      : t.tools.screenRecordTool.deviceOffline}
          </div>
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10.5px] text-ink3">
            <Clock className="h-3.5 w-3.5" />
            {t.tools.screenRecordTool.duration}
          </div>
          <div className="mt-1 font-mono font-medium">{elapsed}</div>
        </div>
      </div>
      {(error || failed) && (
        <div
          role="alert"
          className="mt-3 border-y border-err py-2 text-[11px] text-err"
        >
          <div className="max-h-28 overflow-y-auto break-all">{error ? errorText(error, t) : ""}</div>
          {status.attempted_path && (
            <div className="mt-1 break-all">
              {t.tools.recordingSaveDestination({ path: status.attempted_path })}
            </div>
          )}
          {status.remote_path && status.serial && (
            <div className="mt-1 break-all text-ink2">
              {t.tools.recordingDeviceSource({ serial: status.serial, path: status.remote_path })}
            </div>
          )}
          {status.remote_path && status.serial && (
            <div className="mt-1 text-ink3">{t.tools.screenRecordTool.afterClosingRecoverTheDeviceSourceManually}</div>
          )}
        </div>
      )}
      {failed && (
        <div className="mt-2 flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={saving}
            className={buttonClass}
            onClick={() => void controller.save(false)}
          >
            <RefreshCw className="h-3.5 w-3.5" />
            {t.tools.screenRecordTool.retrySave}
          </button>
          <button
            type="button"
            disabled={saving}
            className={buttonClass}
            onClick={async (event) => {
              const trigger = event.currentTarget;
              await controller.save(true);
              if (trigger.isConnected && trigger.getClientRects().length) trigger.focus();
            }}
          >
            <Save className="h-3.5 w-3.5" />
            {t.tools.screenRecordTool.saveAs}
          </button>
          <button
            type="button"
            disabled={saving}
            className={buttonClass}
            onClick={async (event) => {
              const trigger = event.currentTarget;
              await controller.discard();
              if (trigger.isConnected && trigger.getClientRects().length) trigger.focus();
            }}
          >
            <Trash2 className="h-3.5 w-3.5" />
            {t.tools.screenRecordTool.discardSave}
          </button>
        </div>
      )}
      <div className="mt-3 min-h-8 break-all border-b border-dashed border-rule2 pb-2 font-data text-[11px] text-ink2">
        {saved?.path ?? status.local_path ?? t.tools.screenRecordTool.noSavedRecordingYet}
      </div>
      {saved?.source_cleanup_error && (
        <p className="mt-2 break-all text-[11px] text-err">
          {errorText(saved.source_cleanup_error, t)}
        </p>
      )}
      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        <button
          type="button"
          disabled={!saved}
          className={buttonClass}
          onClick={() => void openSaved(true)}
        >
          <FolderOpen className="h-3.5 w-3.5" />
          {t.tools.screenRecordTool.revealInFileManager}
        </button>
        <button
          type="button"
          disabled={!saved}
          className={buttonClass}
          onClick={() => void openSaved(false)}
        >
          <Video className="h-3.5 w-3.5" />
          {t.tools.screenRecordTool.openWithDefaultApp}
        </button>
      </div>
    </div>
  );
}
