import { useCallback, useEffect, useRef, useState } from "react";
import { Clock, FolderOpen, RefreshCw, Square, Video } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import {
  getScreenRecordStatus,
  openFile,
  revealFile,
  startScreenRecord,
  stopScreenRecord,
  type ScreenRecordStatus,
} from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

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

export function ScreenRecordTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const device = getDeviceBySerial(devices, selectedDevice);
  const online = Boolean(device && isOnlineDevice(device));

  const [status, setStatus] = useState<ScreenRecordStatus>(IDLE_STATUS);
  const [busy, setBusy] = useState<"start" | "stop" | null>(null);
  const [lastPath, setLastPath] = useState("");
  const finalizingRef = useRef(false);

  const refreshStatus = useCallback(async () => {
    try {
      const nextStatus = await getScreenRecordStatus();
      setStatus(nextStatus);
      return nextStatus;
    } catch (error) {
      showToast("error", `刷新录屏状态失败: ${error}`);
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
    void refreshStatus();
    const timer = window.setInterval(() => {
      void refreshStatus();
    }, 1000);

    return () => window.clearInterval(timer);
  }, [refreshStatus]);

  useEffect(() => {
    if (status.pending_pull) {
      void finalizeRecording("录屏已结束，文件已保存");
    }
  }, [finalizeRecording, status.pending_pull]);

  useEffect(() => {
    if (!status.active || !status.serial || status.serial === selectedDevice) {
      return;
    }

    void finalizeRecording("切换设备，已停止并保存上一段录屏");
  }, [finalizeRecording, selectedDevice, status.active, status.serial]);

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
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Video className="h-4 w-4" />
          录屏
        </h2>
        <span className="text-xs text-muted-foreground">
          {device ? device.model || device.serial : "请选择设备"}
        </span>
      </div>

      <button
        type="button"
        onClick={() => recording ? void finalizeRecording() : void handleStart()}
        disabled={buttonDisabled}
        className={cn(
          "mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-border px-4 text-sm font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
          recording
            ? "bg-destructive/10 text-destructive hover:bg-destructive/15"
            : "bg-secondary hover:bg-secondary/80",
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

      <div className="mt-4 grid grid-cols-2 gap-2 text-xs">
        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
          <div className="text-muted-foreground">状态</div>
          <div className="mt-1 font-medium">
            {status.pending_pull ? "保存中" : status.active ? "录制中" : online ? "待开始" : "设备在线后可操作"}
          </div>
        </div>
        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2">
          <div className="flex items-center gap-1 text-muted-foreground">
            <Clock className="h-3.5 w-3.5" />
            时长
          </div>
          <div className="mt-1 font-mono font-medium">{elapsed}</div>
        </div>
      </div>

      <div className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        {lastPath ? lastPath : "录屏将保存到截图目录。"}
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!lastPath}
          onClick={() => {
            if (lastPath) {
              void revealFile(lastPath);
            }
          }}
          className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
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
          className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Video className="h-4 w-4" />
          用默认程序打开
        </button>
      </div>
    </section>
  );
}
