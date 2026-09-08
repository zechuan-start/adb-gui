import { errorText, useT } from "@/i18n";
import { useState } from "react";
import { ClipboardCopy, FileArchive, FolderOpen, RefreshCw } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { collectFullBugreport, collectQuickBugReport, revealFile } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

type BusyMode = "quick" | "full" | null;

export function BugReportTool() {
  const t = useT();
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
      showToast("success", (t) => (t.tools.bugReportTool.bugDataCollectedIn({ path: result.dir })));
    } catch (error) {
      showToast("error", (t) => (t.tools.bugReportTool.quickCollectionFailed({ detail: errorText(error, t) })));
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
      showToast("success", (t) => (t.tools.bugReportTool.fullBugreportSavedTo({ path: result.path })));
    } catch (error) {
      showToast("error", (t) => (t.tools.bugReportTool.fullBugreportFailed({ detail: errorText(error, t) })));
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
          {t.tools.bugReportTool.quickCollect}
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
          {t.tools.bugReportTool.fullBugreport}
        </button>
      </div>

      <div className="mt-3 min-h-5 text-xs text-ink2">
        {busy === "full" ? t.tools.bugReportTool.generatingAFullBugreportThisMayTakeSeveral : t.tools.bugReportTool.quickCollectIncludesAScreenshotActivityDeviceInfo}
      </div>

      <div className="mt-3 min-h-8 break-all border-y border-dashed border-rule2 py-2 font-data text-[11px] text-ink2">
        {lastPath ? lastPath : online ? t.tools.bugReportTool.theLatestReportPathWillAppearHere : t.tools.bugReportTool.availableWhenTheDeviceIsOnline}
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
            showToast("success", (t) => (t.tools.bugReportTool.reportPathCopied));
          }}
          className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
        >
          <ClipboardCopy className="h-4 w-4" />
          {t.tools.bugReportTool.copyPath}
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
          {lastKind === "full" ? t.tools.bugReportTool.showFile : t.tools.bugReportTool.showFolder}
        </button>
      </div>
    </div>
  );
}
