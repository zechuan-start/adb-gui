import { useState } from "react";
import { ClipboardCopy, FileArchive, FolderOpen, RefreshCw } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { collectFullBugreport, collectQuickBugReport, revealFile } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

type BusyMode = "quick" | "full" | null;

export function BugReportTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const device = getDeviceBySerial(devices, selectedDevice);
  const online = Boolean(device && isOnlineDevice(device));

  const [busy, setBusy] = useState<BusyMode>(null);
  const [lastPath, setLastPath] = useState("");
  const [lastKind, setLastKind] = useState<"quick" | "full" | null>(null);

  async function handleQuickCollect() {
    if (!device || !online || busy) {
      return;
    }

    setBusy("quick");
    try {
      const result = await collectQuickBugReport(device.serial);
      setLastPath(result.dir);
      setLastKind("quick");
      showToast("success", `Bug 资料已收集到 ${result.dir}`);
    } catch (error) {
      showToast("error", `快速收集失败: ${error}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleFullBugreport() {
    if (!device || !online || busy) {
      return;
    }

    setBusy("full");
    try {
      const result = await collectFullBugreport(device.serial);
      setLastPath(result.path);
      setLastKind("full");
      showToast("success", `完整 Bugreport 已保存到 ${result.path}`);
    } catch (error) {
      showToast("error", `完整 Bugreport 失败: ${error}`);
    } finally {
      setBusy(null);
    }
  }

  const disabled = !online || busy !== null;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
        <button
          type="button"
          onClick={() => void handleQuickCollect()}
          disabled={disabled}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-2 border border-rule bg-transparent px-3 font-data text-xs font-medium transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40",
            busy === "quick" && "opacity-80",
          )}
        >
          {busy === "quick" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FolderOpen className="h-4 w-4" />}
          快速收集
        </button>
        <button
          type="button"
          onClick={() => void handleFullBugreport()}
          disabled={disabled}
          className={cn(
            "inline-flex h-9 items-center justify-center gap-2 border border-rule bg-transparent px-3 font-data text-xs font-medium transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40",
            busy === "full" && "opacity-80",
          )}
        >
          {busy === "full" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <FileArchive className="h-4 w-4" />}
          完整 Bugreport
        </button>
      </div>

      <div className="mt-3 min-h-5 text-xs text-ink2">
        {busy === "full" ? "正在生成完整 Bugreport，可能需要数分钟。" : "快速收集包含截图、Activity、设备信息和最近日志。"}
      </div>

      <div className="mt-3 min-h-8 break-all border-y border-dashed border-rule2 py-2 font-data text-[11px] text-ink2">
        {lastPath ? lastPath : online ? "最近报告路径将在这里显示。" : "设备在线后可操作"}
      </div>

      <div className="mt-auto flex flex-wrap gap-1.5 pt-3">
        <button
          type="button"
          disabled={!lastPath}
          onClick={async () => {
            if (!lastPath) {
              return;
            }
            await navigator.clipboard.writeText(lastPath);
            showToast("success", "已复制报告路径");
          }}
          className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardCopy className="h-4 w-4" />
          复制路径
        </button>
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
          {lastKind === "full" ? "显示文件" : "显示目录"}
        </button>
      </div>
    </div>
  );
}
