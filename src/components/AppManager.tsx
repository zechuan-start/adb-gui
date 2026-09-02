import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { installApk, isTauriRuntime, onDragDrop, pickApkFile } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type DragState = "idle" | "valid" | "invalid";

function isApkPath(path: string) {
  return path.toLowerCase().endsWith(".apk");
}

function installMessage(result: string) {
  return result.trim() === "Success" ? "APK 安装成功" : result.trim();
}

interface ApkToolProps {
  active?: boolean;
}

export function ApkTool({ active = true }: ApkToolProps) {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const online = Boolean(device && isOnlineDevice(device));
  const showToast = useFeedbackStore((state) => state.showToast);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const listenerEnabledRef = useRef(active && online);
  const [dragState, setDragState] = useState<DragState>("idle");
  const [currentFile, setCurrentFile] = useState("");
  const [status, setStatus] = useState("");

  listenerEnabledRef.current = active && online;

  const fileName = useMemo(() => currentFile.split(/[\\/]/).pop() ?? "", [currentFile]);
  const dropHint = useMemo(() => {
    if (busy) return "正在安装, 请稍候";
    if (!online) return "先选择在线设备";
    if (dragState === "valid") return "释放以安装 APK";
    if (dragState === "invalid") return "仅支持 APK 文件";
    return "拖拽 APK 到此窗口";
  }, [busy, dragState, online]);

  const handleInstall = useCallback(
    async (path: string) => {
      if (busyRef.current) {
        showToast("error", "正在安装 APK, 请稍候");
        return;
      }
      if (!isApkPath(path)) {
        const message = "仅支持 APK 文件";
        setStatus(message);
        showToast("error", message);
        return;
      }
      if (!device || !isOnlineDevice(device)) {
        const message = "请先选择一台在线设备";
        setStatus(message);
        showToast("error", message);
        return;
      }

      busyRef.current = true;
      setBusy(true);
      setCurrentFile(path);
      setStatus("安装中...");
      try {
        const message = installMessage(await installApk(device.serial, path)) || "APK 安装成功";
        setStatus(message);
        showToast("success", message);
      } catch (error) {
        const message = `安装失败: ${error}`;
        setStatus(message);
        showToast("error", message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [device, showToast],
  );

  const handleDroppedPaths = useCallback(
    (paths: string[]) => {
      const apkPaths = paths.filter(isApkPath);
      if (apkPaths.length === 0) {
        const message = "仅支持 APK 文件";
        setStatus(message);
        showToast("error", message);
        return;
      }
      if (apkPaths.length > 1) {
        const message = "一次只能安装一个 APK";
        setStatus(message);
        showToast("error", message);
        return;
      }
      void handleInstall(apkPaths[0]);
    },
    [handleInstall, showToast],
  );

  const handlePick = useCallback(async () => {
    try {
      const selected = await pickApkFile();
      if (selected) {
        await handleInstall(selected);
      }
    } catch (error) {
      const message = `选择 APK 失败: ${error}`;
      setStatus(message);
      showToast("error", message);
    }
  }, [handleInstall, showToast]);

  useEffect(() => {
    if (!active || !online || !isTauriRuntime()) {
      setDragState("idle");
      return;
    }

    let disposed = false;
    let unlisten: (() => void) | null = null;
    onDragDrop((event) => {
      if (!listenerEnabledRef.current) {
        return;
      }
      if (event.type === "enter") {
        setDragState(event.paths.some(isApkPath) ? "valid" : "invalid");
      } else if (event.type === "drop") {
        setDragState("idle");
        handleDroppedPaths(event.paths);
      } else if (event.type === "leave") {
        setDragState("idle");
      }
    })
      .then((cleanup) => {
        if (disposed) {
          cleanup();
        } else {
          unlisten = cleanup;
        }
      })
      .catch((error) => {
        if (!disposed && listenerEnabledRef.current) {
          showToast("error", `拖拽监听启动失败: ${error}`);
        }
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [active, handleDroppedPaths, online, showToast]);

  return (
    <div
      className={cn(
        "flex h-full min-w-0 flex-col border border-dashed border-rule p-3 transition-colors",
        dragState === "valid" && "border-note bg-hover",
        dragState === "invalid" && "border-err bg-err-band",
      )}
    >
      <div className="flex min-h-20 flex-1 items-center justify-center px-3 text-center text-xs text-ink2">
        <div className="space-y-2">
          <div>{dropHint}</div>
          <button
            type="button"
            onClick={() => void handlePick()}
            disabled={!online || busy}
            className="inline-flex h-8 items-center gap-2 border border-ink bg-ink px-3 font-data text-[11px] font-medium text-onink transition-colors hover:border-ink2 hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40"
          >
            <FileUp className="h-4 w-4" />
            选择并安装
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-8 border-t border-dashed border-rule2 pt-2 text-[11px] text-ink2">
        <div className="break-all" title={status || undefined}>
          {status || "安装到当前设备"}
        </div>
        {fileName && (
          <div className="mt-1 truncate font-mono" title={fileName}>
            {fileName}
          </div>
        )}
      </div>
    </div>
  );
}
