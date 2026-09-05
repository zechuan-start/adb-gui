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
        const warnings = [
          result.source_cleanup_error,
          behavior.openAfterSave && !result.opened ? "自动打开视频失败" : null,
        ].filter(Boolean);
        useFeedbackStore
          .getState()
          .showToast(
            warnings.length ? "error" : "success",
            `录屏已保存: ${result.path}${warnings.length ? `; ${warnings.join("; ")}` : ""}`,
          );
      },
      onDiscarded: (result) =>
        useFeedbackStore
          .getState()
          .showToast(
            result.source_cleanup_error ? "error" : "success",
            result.source_cleanup_error
              ? `已放弃恢复, 设备源文件可能仍保留: ${result.serial} / ${result.remote_path}; ${result.source_cleanup_error}`
              : "已放弃保存并删除设备源文件",
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
          .showToast("error", `刷新录屏状态失败: ${String(error)}`),
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
        .showToast("error", `打开已保存录屏失败: ${String(failure)}`);
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
          ? "启动中..."
          : saving
            ? "处理中..."
            : failed
              ? "等待恢复保存"
              : idle
                ? "开始录屏"
                : "停止并保存"}
      </button>
      <div className="mt-3 grid grid-cols-2 border-y border-rule text-xs">
        <div className="border-r border-dashed border-rule px-2.5 py-2">
          <div className="text-[10.5px] text-ink3">状态</div>
          <div className="mt-1 font-medium">
            {failed
              ? "保存失败"
              : saving
                ? "处理中"
                : status.phase === "recording"
                  ? "录制中"
                  : status.phase === "pending_save"
                    ? "待保存"
                    : online
                      ? "待开始"
                      : "设备离线"}
          </div>
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1 text-[10.5px] text-ink3">
            <Clock className="h-3.5 w-3.5" />
            时长
          </div>
          <div className="mt-1 font-mono font-medium">{elapsed}</div>
        </div>
      </div>
      {(error || failed) && (
        <div
          role="alert"
          className="mt-3 border-y border-err py-2 text-[11px] text-err"
        >
          <div className="max-h-28 overflow-y-auto break-all">{error}</div>
          {status.attempted_path && (
            <div className="mt-1 break-all">
              保存目标: {status.attempted_path}
            </div>
          )}
          {status.remote_path && (
            <div className="mt-1 break-all text-ink2">
              设备源文件: {status.serial} / {status.remote_path}
            </div>
          )}
          {status.remote_path && (
            <div className="mt-1 text-ink3">退出后需要手动找回设备源文件.</div>
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
            重试保存
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
            另存为
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
            放弃保存
          </button>
        </div>
      )}
      <div className="mt-3 min-h-8 break-all border-b border-dashed border-rule2 pb-2 font-data text-[11px] text-ink2">
        {saved?.path ?? status.local_path ?? "尚无已保存录屏"}
      </div>
      {saved?.source_cleanup_error && (
        <p className="mt-2 break-all text-[11px] text-err">
          {saved.source_cleanup_error}
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
          在文件管理器中显示
        </button>
        <button
          type="button"
          disabled={!saved}
          className={buttonClass}
          onClick={() => void openSaved(false)}
        >
          <Video className="h-3.5 w-3.5" />
          用默认程序打开
        </button>
      </div>
    </div>
  );
}
