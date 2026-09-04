import { useState } from "react";
import { ClipboardCopy, FolderOpen, RefreshCw, Image as ImageIcon } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { copyScreenshot, openFile, revealFile, takeScreenshot } from "@/lib/tauri";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

export function ScreenshotTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [pendingAction, setPendingAction] = useState<"open" | "copy" | null>(null);
  const [lastPath, setLastPath] = useState("");
  const busy = pendingAction !== null;

  async function handleScreenshot(action: "open" | "copy") {
    if (!device || !isOnlineDevice(device) || busy) {
      return;
    }

    setPendingAction(action);
    try {
      if (action === "open") {
        const result = await takeScreenshot(device.serial);
        setLastPath(result.path);
        showToast("success", `截图已保存到 ${result.path}`);
      } else {
        await copyScreenshot(device.serial);
        showToast("success", "截图已复制到剪贴板");
      }
    } catch (error) {
      showToast("error", `截图失败: ${error}`);
    } finally {
      setPendingAction(null);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="grid h-9 grid-cols-2 gap-2">
        <button
          type="button"
          onClick={() => void handleScreenshot("open")}
          disabled={!device || !isOnlineDevice(device) || busy}
          className={cn(
            "flex min-w-0 items-center justify-center gap-2 border border-ink bg-ink px-2 font-data text-xs font-medium text-onink transition-colors",
            pendingAction === "open" && "opacity-80",
            (!device || !isOnlineDevice(device)) && "cursor-not-allowed opacity-50",
            !busy && device && isOnlineDevice(device) && "hover:bg-ink2",
          )}
        >
          {pendingAction === "open" ? (
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ImageIcon className="h-4 w-4 shrink-0" />
          )}
          <span className="whitespace-nowrap">{pendingAction === "open" ? "截图中..." : "截图并打开"}</span>
        </button>
        <button
          type="button"
          onClick={() => void handleScreenshot("copy")}
          disabled={!device || !isOnlineDevice(device) || busy}
          className={cn(
            "flex min-w-0 items-center justify-center gap-2 border border-ink bg-ink px-2 font-data text-xs font-medium text-onink transition-colors",
            pendingAction === "copy" && "opacity-80",
            (!device || !isOnlineDevice(device)) && "cursor-not-allowed opacity-50",
            !busy && device && isOnlineDevice(device) && "hover:bg-ink2",
          )}
        >
          {pendingAction === "copy" ? (
            <RefreshCw className="h-4 w-4 shrink-0 animate-spin" />
          ) : (
            <ClipboardCopy className="h-4 w-4 shrink-0" />
          )}
          <span className="whitespace-nowrap">{pendingAction === "copy" ? "复制中..." : "截图并复制"}</span>
        </button>
      </div>

      <div className="mt-3 flex flex-1 flex-col gap-3">
        <div className="min-h-8 break-all border-y border-dashed border-rule2 py-2 font-data text-[11px] text-ink2">
          {lastPath ? lastPath : "最近截图将在这里显示。"}
        </div>
        <div className="mt-auto flex flex-wrap gap-1.5">
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
            className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
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
            className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
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
            className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <ImageIcon className="h-4 w-4" />
            用默认程序打开
          </button>
        </div>
      </div>
    </div>
  );
}
