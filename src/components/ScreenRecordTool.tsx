import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, FolderOpen, RefreshCw, Square, Video } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import {
  getScreenRecordStatus,
  isTauriRuntime,
  openFile,
  revealFile,
  startScreenRecord,
  stopScreenRecord,
  type ScreenRecordStatus,
} from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { createScreenRecordPollingController } from "@/hooks/screenRecordPollingController";
import { cn } from "@/lib/utils";

interface ScreenRecordToolProps {
  active?: boolean;
}

const IDLE_STATUS: ScreenRecordStatus = {
  active: false,
  serial: null,
  elapsed_secs: 0,
  pending_pull: false,
};

function formatElapsed(seconds: number): string {
  const minutes = Math.floor(seconds / 60).toString().padStart(2, "0");
  const rest = Math.max(0, seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${rest}`;
}

export function ScreenRecordTool({ active = true }: ScreenRecordToolProps) {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const device = getDeviceBySerial(devices, selectedDevice);
  const online = Boolean(device && isOnlineDevice(device));

  const [status, setStatus] = useState<ScreenRecordStatus>(IDLE_STATUS);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [lastPath, setLastPath] = useState("");
  const finalizingRef = useRef(false);
  const activeRef = useRef(active);
  const refreshSeqRef = useRef(0);

  activeRef.current = active;

  const refreshStatus = useCallback(async () => {
    const requestSeq = refreshSeqRef.current + 1;
    refreshSeqRef.current = requestSeq;
    try {
      const nextStatus = await getScreenRecordStatus();
      if (!activeRef.current || refreshSeqRef.current !== requestSeq) {
        return null;
      }
      setStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      if (activeRef.current && refreshSeqRef.current === requestSeq) {
        showToast("error", `刷新录屏状态失败: ${error}`);
      }
      return null;
    }
  }, [showToast]);

  const finalizeRecording = useCallback(async (message?: string) => {
    if (finalizingRef.current) {
      return;
    }

    finalizingRef.current = true;
    setBusy("stop");
    try {
      const result = await stopScreenRecord();
      setLastPath(result.path);
      setStatus(IDLE_STATUS);
      showToast("success", message ? `${message}: ${result.path}` : `录屏已保存到 ${result.path}`);
    } catch (error) {
      showToast("error", `停止录屏失败: ${error}`);
      await refreshStatus();
    } finally {
      setBusy(null);
      finalizingRef.current = false;
    }
  }, [refreshStatus, showToast]);

  useEffect(() => {
    if (!active || busy !== null || !isTauriRuntime()) {
      refreshSeqRef.current += 1;
      return;
    }

    const controller = createScreenRecordPollingController({
      loadStatus: getScreenRecordStatus,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelSchedule: (handle) => window.clearTimeout(handle),
      onStatus: setStatus,
      onError: (error) => {
        showToast("error", `刷新录屏状态失败: ${String(error)}`);
      },
    });
    controller.run();

    return () => {
      controller.dispose();
      refreshSeqRef.current += 1;
    };
  }, [active, busy, showToast]);

  useEffect(() => {
    if (active && status.pending_pull) {
      void finalizeRecording("录屏已结束，文件已保存");
    }
  }, [active, finalizeRecording, status.pending_pull]);

  useEffect(() => {
    if (!active || !status.active || !status.serial || status.serial === selectedDevice) {
      return;
    }

    void finalizeRecording("切换设备，已停止并保存上一段录屏");
  }, [active, finalizeRecording, selectedDevice, status.active, status.serial]);

  async function handleStart() {
    if (!device || !online || busy || status.active || status.pending_pull) {
      return;
    }

    setBusy("start");
    try {
      const nextStatus = await startScreenRecord(device.serial);
      setStatus(nextStatus);
      setLastPath("");
      showToast("success", "录屏已开始");
    } catch (error) {
      showToast("error", `开始录屏失败: ${error}`);
      await refreshStatus();
    } finally {
      setBusy(null);
    }
  }

  const recording = status.active || status.pending_pull;
  const buttonDisabled = busy !== null || (!recording && !online);
  const elapsed = recording ? formatElapsed(status.elapsed_secs) : "00:00";

  return (
    <div className="flex h-full min-w-0 flex-col">
      <button
        type="button"
        onClick={() => recording ? void finalizeRecording() : void handleStart()}
        disabled={buttonDisabled}
        className={cn(
          "flex h-9 w-full items-center justify-center gap-2 border px-3 font-data text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40",
          recording
            ? "border-err text-err hover:bg-err-band"
            : "border-ink bg-ink text-onink hover:border-ink2 hover:bg-ink2",
          busy && "opacity-80",
        )}
      >
        {busy ? (
          <RefreshCw className="h-4 w-4 animate-spin" />
        ) : recording ? (
          <Square className="h-4 w-4" />
        ) : (
          <Video className="h-4 w-4" />
        )}
        {busy === "start" ? "启动中..." : busy === "stop" ? "保存中..." : recording ? "停止录屏" : "开始录屏"}
      </button>

      <div className="mt-3 grid grid-cols-2 border-y border-rule text-xs">
        <div className="border-r border-dashed border-rule px-2.5 py-2">
          <div className="font-data text-[10.5px] text-ink3">状态</div>
          <div className="mt-1 font-medium">
            {status.pending_pull ? "保存中" : status.active ? "录制中" : online ? "待开始" : "设备在线后可操作"}
          </div>
        </div>
        <div className="px-2.5 py-2">
          <div className="flex items-center gap-1 font-data text-[10.5px] text-ink3">
            <Clock className="h-3.5 w-3.5" />
            时长
          </div>
          <div className="mt-1 font-mono font-medium">{elapsed}</div>
        </div>
      </div>

      <div className="mt-3 min-h-8 break-all border-b border-dashed border-rule2 pb-2 font-data text-[11px] text-ink2">
        {lastPath ? lastPath : "录屏将保存到截图目录。"}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        <button
          type="button"
          disabled={!lastPath}
          onClick={() => {
            if (lastPath) {
              void revealFile(lastPath);
            }
          }}
          className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <FolderOpen className="h-4 w-4" />
          在文件管理器中显示
        </button>
        <button
          type="button"
          disabled={!lastPath}
          onClick={() => {
            if (lastPath) {
              void openFile(lastPath);
            }
          }}
          className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <Video className="h-4 w-4" />
          用默认程序打开
        </button>
      </div>
    </div>
  );
}
