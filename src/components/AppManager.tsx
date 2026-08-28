import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Package } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { installApk, onDragDrop, pickApkFile } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type DragState = "idle" | "valid" | "invalid";

function isApkPath(path: string) {
  return path.toLowerCase().endsWith(".apk");
}

function installMessage(result: string) {
  return result.trim() === "Success" ? "APK 安装成功" : result.trim();
}

export function ApkTool() {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [dragState, setDragState] = useState<DragState>("idle");
  const [currentFile, setCurrentFile] = useState("");
  const [status, setStatus] = useState("");

  const fileName = useMemo(() => currentFile.split(/[\\/]/).pop() ?? "", [currentFile]);
  const dropHint = useMemo(() => {
    if (busy) return "正在安装, 请稍候";
    if (!device || !isOnlineDevice(device)) return "先选择在线设备";
    if (dragState === "valid") return "释放以安装 APK";
    if (dragState === "invalid") return "仅支持 APK 文件";
    return "拖拽 APK 到此窗口";
  }, [busy, device, dragState]);

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
    let disposed = false;
    let unlisten: (() => void) | null = null;
    onDragDrop((event) => {
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
      .catch((error) => showToast("error", `拖拽监听启动失败: ${error}`));

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [handleDroppedPaths, showToast]);

  return (
    <section
      className={cn(
        "rounded-lg border border-dashed bg-card p-4 transition-colors",
        dragState === "valid" && "border-primary bg-primary/5",
        dragState === "invalid" && "border-destructive bg-destructive/5",
        dragState === "idle" && "border-border",
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4" />
          APK 安装
        </h2>
        <span className="text-xs text-muted-foreground">
          {device ? `→ ${device.model || device.serial}` : "请选择设备"}
        </span>
      </div>

      <div className="mt-4 flex min-h-20 items-center justify-center rounded-md border border-dashed border-border bg-secondary/30 px-4 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <div>{dropHint}</div>
          <button
            type="button"
            onClick={() => void handlePick()}
            disabled={!device || !isOnlineDevice(device) || busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            选择并安装
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-8 text-xs text-muted-foreground">
        <div className="break-all" title={status || undefined}>
          {status || "安装到当前设备"}
        </div>
        {fileName && (
          <div className="mt-1 truncate font-mono" title={fileName}>
            {fileName}
          </div>
        )}
      </div>
    </section>
  );
}
