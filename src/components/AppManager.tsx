import { useEffect, useMemo, useState } from "react";
import { FileUp, Upload } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { installApk, onDragDrop, pickApkFile } from "@/lib/tauri";
import { cn } from "@/lib/utils";

export function ApkInstallTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [dragging, setDragging] = useState(false);
  const [currentFile, setCurrentFile] = useState("");
  const [status, setStatus] = useState<string>("");

  useEffect(() => {
    let unlisten: (() => void) | null = null;
    onDragDrop((event) => {
      if (event.type === "enter" || event.type === "over") {
        setDragging(true);
        return;
      }

      if (event.type === "leave") {
        setDragging(false);
        return;
      }

      if (event.type === "drop") {
        setDragging(false);
        const selected = event.paths.find((path) => path.toLowerCase().endsWith(".apk"));
        if (selected) {
          void handleInstall(selected);
        } else {
          showToast("error", "仅支持 APK 文件");
        }
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      unlisten?.();
    };
  }, [showToast]);

  async function handleInstall(path: string) {
    if (!device || !isOnlineDevice(device) || busy) {
      return;
    }

    setBusy(true);
    setCurrentFile(path);
    setStatus("安装中...");
    try {
      const result = await installApk(device.serial, path);
      setStatus(result);
      showToast("success", result || "APK 安装成功");
    } catch (error) {
      const message = `安装失败: ${error}`;
      setStatus(message);
      showToast("error", message);
    } finally {
      setBusy(false);
    }
  }

  const fileName = useMemo(() => currentFile.split(/[\\/]/).pop() ?? "", [currentFile]);

  function handleFileDrop(event: globalThis.React.DragEvent<HTMLElement>) {
    event.preventDefault();
    setDragging(false);

    const file = event.dataTransfer.files[0];
    const droppedPath = (file as File & { path?: string }).path;
    if (droppedPath) {
      void handleInstall(droppedPath);
    }
  }

  return (
    <section
      className={cn(
        "rounded-lg border border-dashed bg-card p-4 transition-colors",
        dragging ? "border-primary bg-primary/5" : "border-border"
      )}
      onDragEnter={() => setDragging(true)}
      onDragLeave={() => setDragging(false)}
      onDragOver={(event) => {
        event.preventDefault();
        setDragging(true);
      }}
      onDrop={handleFileDrop}
    >
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Upload className="h-4 w-4" />
          APK 安装
        </h2>
        <span className="text-xs text-muted-foreground">
          {device ? `→ ${device.model || device.serial}` : "请选择设备"}
        </span>
      </div>

      <div className="mt-4 flex min-h-20 items-center justify-center rounded-md border border-dashed border-border bg-secondary/30 px-4 text-center text-sm text-muted-foreground">
        <div className="space-y-2">
          <div>{dragging ? "释放以安装" : "拖拽 APK 文件到此处"}</div>
          <button
            type="button"
            onClick={async () => {
              const selected = await pickApkFile();
              if (selected) {
                await handleInstall(selected);
              }
            }}
            disabled={!device || !isOnlineDevice(device) || busy}
            className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FileUp className="h-4 w-4" />
            选择文件
          </button>
        </div>
      </div>

      <div className="mt-3 flex items-center justify-between gap-3 text-xs text-muted-foreground">
        <span className="truncate">{status || "仅支持 APK 文件"}</span>
        <span className="truncate font-mono">{fileName}</span>
      </div>
    </section>
  );
}
