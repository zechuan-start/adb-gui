import { errorText, useT } from "@/i18n";
import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, Copy, Play, ShieldAlert, Square } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { clearAppData, forceStopApp, launchApp, uninstallApp } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

export function CurrentAppActionsTool() {
  const t = useT();
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const currentPackage = useDeviceStore((s) => s.currentPackage);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [manualPkg, setManualPkg] = useState("");
  const [confirmAction, setConfirmAction] = useState<"clear" | "uninstall" | null>(null);

  const packageName = useMemo(() => currentPackage || manualPkg.trim(), [currentPackage, manualPkg]);
  const targetLabel = packageName || t.apps.activityMonitor.noForegroundApp;
  const canAct = !!device && isOnlineDevice(device) && !!packageName;

  useEffect(() => {
    if (!canAct) {
      setConfirmAction(null);
    }
  }, [canAct]);

  async function handleAction(action: "force-stop" | "launch" | "clear" | "uninstall") {
    if (!device || !isOnlineDevice(device) || !packageName) {
      return;
    }

    try {
      let result = "";
      if (action === "force-stop") {
        result = await forceStopApp(device.serial, packageName);
      } else if (action === "launch") {
        result = await launchApp(device.serial, packageName);
      } else if (action === "clear") {
        result = await clearAppData(device.serial, packageName);
      } else {
        result = await uninstallApp(device.serial, packageName);
      }
      showToast("success", (t) => (result || t.apps.activityMonitor.completedSuccessfully({ packageName: packageName })));
    } catch (error) {
      showToast("error", (t) => (t.apps.activityMonitor.currentAppActionFailed({ detail: errorText(error, t) })));
    } finally {
      setConfirmAction(null);
    }
  }

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex items-center gap-2 border-y border-rule px-2.5 py-2">
        <span className="font-data text-[10.5px] text-ink3">{t.apps.activityMonitor.package}</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{targetLabel}</span>
        <button
          type="button"
          onClick={async () => {
            if (!packageName) {
              return;
            }
            await navigator.clipboard.writeText(packageName);
            showToast("success", (t) => (t.apps.activityMonitor.packageNameCopied));
          }}
          disabled={!packageName}
          className="inline-flex h-7 w-7 items-center justify-center text-ink2 transition-colors hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
          title={t.apps.activityMonitor.copyPackageName}
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      {!currentPackage && (
        <div className="mt-3">
          <input
            value={manualPkg}
            onChange={(e) => setManualPkg(e.target.value)}
            placeholder={t.apps.activityMonitor.enterAPackageName}
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="h-9 w-full border border-rule bg-surface px-2.5 font-data text-xs outline-none placeholder:text-ink3 focus:border-note"
          />
        </div>
      )}

      <div className="mt-3 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!canAct}
            onClick={() => void handleAction("force-stop")}
            className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Square className="h-4 w-4" />
            {t.apps.activityMonitor.forceStop}
          </button>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => void handleAction("launch")}
            className="inline-flex h-8 items-center gap-2 border border-rule bg-transparent px-2.5 font-data text-[11px] transition-colors hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40"
          >
            <Play className="h-4 w-4" />
            {t.apps.activityMonitor.launch}
          </button>
        </div>

        <div className="flex flex-wrap gap-1.5">
          <button
            type="button"
            disabled={!canAct}
            onClick={() => setConfirmAction(confirmAction === "clear" ? null : "clear")}
            className={cn(
              "inline-flex h-8 items-center gap-2 border border-err/60 px-2.5 font-data text-[11px] text-err transition-colors hover:bg-err-band disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            {confirmAction === "clear" ? t.apps.activityMonitor.clearDataFor({ packageName: packageName }) : t.apps.activityMonitor.clearData}
          </button>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => setConfirmAction(confirmAction === "uninstall" ? null : "uninstall")}
            className={cn(
              "inline-flex h-8 items-center gap-2 border border-err/60 px-2.5 font-data text-[11px] text-err transition-colors hover:bg-err-band disabled:cursor-not-allowed disabled:opacity-40"
            )}
          >
            <ShieldAlert className="h-4 w-4" />
            {confirmAction === "uninstall" ? t.apps.activityMonitor.uninstall({ packageName: packageName }) : t.apps.activityMonitor.uninstallLabel}
          </button>
        </div>
      </div>

      {confirmAction && (
        <div className="mt-3 flex items-center justify-between gap-2 border-l-2 border-err bg-err-band px-3 py-2 text-xs text-err">
          <span>
            {confirmAction === "clear" ? t.apps.activityMonitor.clickAgainToClearData : t.apps.activityMonitor.clickAgainToUninstallTheApp}
          </span>
          <button
            type="button"
            onClick={() => void handleAction(confirmAction)}
            disabled={!canAct}
            className="h-7 border border-err bg-err px-3 font-data text-[11px] font-medium text-onink transition-colors hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t.apps.activityMonitor.confirm}
          </button>
        </div>
      )}
    </div>
  );
}
