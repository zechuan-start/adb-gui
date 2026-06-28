import { useState } from "react";
import { Camera, ClipboardCopy, FolderOpen, RefreshCw, Image as ImageIcon } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { openFile, revealFile, takeScreenshot } from "@/lib/tauri";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

export function ScreenshotTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [busy, setBusy] = useState(false);
  const [lastPath, setLastPath] = useState("");

  async function handleScreenshot() {
    if (!device || !isOnlineDevice(device) || busy) {
      return;
    }

    setBusy(true);
    try {
      const result = await takeScreenshot(device.serial);
      setLastPath(result.path);
      showToast("success", `截图已保存到 ${result.path}`);
    } catch (error) {
      showToast("error", `截图失败: ${error}`);
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Camera className="h-4 w-4" />
          截图
        </h2>
        <span className="text-xs text-muted-foreground">
          {device ? device.model || device.serial : "请选择设备"}
        </span>
      </div>

      <button
        type="button"
        onClick={handleScreenshot}
        disabled={!device || !isOnlineDevice(device) || busy}
        className={cn(
          "mt-4 flex h-14 w-full items-center justify-center gap-3 rounded-lg border border-border bg-secondary px-4 text-sm font-medium transition-colors",
          busy && "opacity-80",
          (!device || !isOnlineDevice(device)) && "cursor-not-allowed opacity-50",
          !busy && device && isOnlineDevice(device) && "hover:bg-secondary/80"
        )}
      >
        {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ImageIcon className="h-4 w-4" />}
        {busy ? "截图中..." : "截图并打开"}
      </button>

      <div className="mt-4 space-y-3">
        <div className="rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
          {lastPath ? lastPath : "最近截图将在这里显示。"}
        </div>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!lastPath}
            onClick={async () => {
              if (!lastPath) {
                return;
              }
              await navigator.clipboard.writeText(lastPath);
              showToast("success", "已复制截图路径");
            }}
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ClipboardCopy className="h-4 w-4" />
            复制路径
          </button>
          <button
            type="button"
            disabled={!lastPath}
            onClick={async () => {
              if (!lastPath) {
                return;
              }
              await revealFile(lastPath);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <FolderOpen className="h-4 w-4" />
            在文件管理器中显示
          </button>
          <button
            type="button"
            disabled={!lastPath}
            onClick={async () => {
              if (!lastPath) {
                return;
              }
              await openFile(lastPath);
            }}
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-xs transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <ImageIcon className="h-4 w-4" />
            用默认程序打开
          </button>
        </div>
      </div>
    </section>
  );
}
