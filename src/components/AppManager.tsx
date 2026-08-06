import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { FileUp, Package, Upload } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { installApk, onDragDrop, pickAnyFile, pickApkFile, pushFile } from "@/lib/tauri";
import { cn } from "@/lib/utils";

type DragState = "idle" | "valid" | "invalid";
type ApkAction = "install" | "push";

function isApkPath(path: string) {
  return path.toLowerCase().endsWith(".apk");
}

function installMessage(result: string) {
  return result.trim() === "Success" ? "APK 安装成功" : result.trim();
}

export function ApkTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [action, setAction] = useState<ApkAction>("install");
  const [dragState, setDragState] = useState<DragState>("idle");
  const [currentFile, setCurrentFile] = useState("");
  const [status, setStatus] = useState<string>("");

  const fileName = useMemo(() => currentFile.split(/[\\/]/).pop() ?? "", [currentFile]);
  const dropHint = useMemo(() => {
    if (busy) return action === "install" ? "正在安装, 请稍候" : "正在推送, 请稍候";
    if (!device || !isOnlineDevice(device)) return "先选择在线设备";
    if (dragState === "valid") {
      return action === "install" ? "释放以安装 APK" : "释放以推送文件";
    }
    if (dragState === "invalid") return "安装模式仅支持 APK 文件";
    return action === "install" ? "拖拽 APK 到此窗口" : "拖拽任意文件到此窗口";
  }, [action, busy, device, dragState]);

  const handleFile = useCallback(
    async (path: string) => {
      if (busyRef.current) {
        showToast("error", action === "install" ? "正在处理 APK, 请稍候" : "正在推送文件, 请稍候");
        return;
      }

      if (action === "install" && !isApkPath(path)) {
        const message = "安装模式仅支持 APK 文件";
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
      setStatus(action === "install" ? "安装中..." : "正在推送到设备下载目录...");
      try {
        const message = action === "install"
          ? installMessage(await installApk(device.serial, path)) || "APK 安装成功"
          : `已推送到 ${await pushFile(device.serial, path)}`;
        setStatus(message);
        showToast("success", message);
      } catch (error) {
        const message = `${action === "install" ? "安装" : "推送"}失败: ${error}`;
        setStatus(message);
        showToast("error", message);
      } finally {
        busyRef.current = false;
        setBusy(false);
      }
    },
    [action, device, showToast]
  );

  const handleDroppedPaths = useCallback(
    (paths: string[]) => {
      if (paths.length === 0) {
        return;
      }

      if (action === "install") {
        const apkPaths = paths.filter(isApkPath);

        if (apkPaths.length === 0) {
          const message = "安装模式仅支持 APK 文件";
          setStatus(message);
          showToast("error", message);
          return;
        }

        if (apkPaths.length > 1) {
          const message = "一次只能处理一个 APK";
          setStatus(message);
          showToast("error", message);
          return;
        }

        void handleFile(apkPaths[0]);
        return;
      }

      if (paths.length > 1) {
        const message = "一次只能推送一个文件";
        setStatus(message);
        showToast("error", message);
        return;
      }

      void handleFile(paths[0]);
    },
    [action, handleFile, showToast]
  );

  const handlePick = useCallback(async () => {
    try {
      const selected = action === "install" ? await pickApkFile() : await pickAnyFile();
      if (selected) {
        await handleFile(selected);
      }
    } catch (error) {
      const message = `选择${action === "install" ? " APK" : "文件"}失败: ${error}`;
      setStatus(message);
      showToast("error", message);
    }
  }, [action, handleFile, showToast]);

  useEffect(() => {
    let disposed = false;
    let unlisten: (() => void) | null = null;

    onDragDrop((event) => {
      if (event.type === "enter") {
        if (action === "install") {
          setDragState(event.paths.some(isApkPath) ? "valid" : "invalid");
        } else {
          setDragState(event.paths.length > 0 ? "valid" : "invalid");
        }
        return;
      }

      if (event.type === "drop") {
        setDragState("idle");
        handleDroppedPaths(event.paths);
        return;
      }

      if (event.type === "leave") {
        setDragState("idle");
      }
    })
      .then((fn) => {
        if (disposed) {
          fn();
          return;
        }
        unlisten = fn;
      })
      .catch((error) => {
        showToast("error", `拖拽监听启动失败: ${error}`);
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [action, handleDroppedPaths, showToast]);

  return (
    <section
      className={cn(
        "rounded-lg border border-dashed bg-card p-4 transition-colors",
        dragState === "valid" && "border-primary bg-primary/5",
        dragState === "invalid" && "border-destructive bg-destructive/5",
        dragState === "idle" && "border-border"
      )}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Package className="h-4 w-4" />
          APK / 文件
        </h2>
        <span className="text-xs text-muted-foreground">
          {device ? `→ ${device.model || device.serial}` : "请选择设备"}
        </span>
      </div>

      <div
        className="mt-3 grid grid-cols-2 rounded-md bg-secondary p-1"
        role="group"
        aria-label="安装与推送操作模式"
      >
        {(["install", "push"] as const).map((item) => (
          <button
            key={item}
            type="button"
            onClick={() => {
              setAction(item);
              setCurrentFile("");
              setStatus("");
            }}
            disabled={busy}
            aria-pressed={action === item}
            className={cn(
              "inline-flex h-7 items-center justify-center gap-1.5 rounded px-2 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-50",
              action === item
                ? "bg-background text-foreground shadow-sm"
                : "text-muted-foreground hover:text-foreground"
            )}
          >
            {item === "install" ? (
              <Package className="h-3.5 w-3.5" />
            ) : (
              <Upload className="h-3.5 w-3.5" />
            )}
            {item === "install" ? "安装" : "推送"}
          </button>
        ))}
      </div>

      <div className="mt-3 flex min-h-20 items-center justify-center rounded-md border border-dashed border-border bg-secondary/30 px-4 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <div>{dropHint}</div>
          <button
            type="button"
            onClick={() => void handlePick()}
            disabled={!device || !isOnlineDevice(device) || busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            {action === "install" ? "选择并安装" : "选择并推送"}
          </button>
        </div>
      </div>

      <div className="mt-3 min-h-8 text-xs text-muted-foreground">
        <div className="break-all" title={status || undefined}>
          {status || (action === "install" ? "安装到当前设备" : "推送到 /sdcard/Download")}
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
