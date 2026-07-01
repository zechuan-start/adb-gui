import { useMemo, useState } from "react";
import { AlertTriangle, Copy, Play, ShieldAlert, Square } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { clearAppData, forceStopApp, launchApp, uninstallApp } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

export function CurrentAppActionsTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const currentActivity = useDeviceStore((s) => s.currentActivity);
  const currentPackage = useDeviceStore((s) => s.currentPackage);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [manualPkg, setManualPkg] = useState("");
  const [confirmAction, setConfirmAction] = useState<"clear" | "uninstall" | null>(null);

  const packageName = useMemo(() => currentPackage || manualPkg.trim(), [currentPackage, manualPkg]);
  const targetLabel = packageName || "暂无前台应用";
  const canAct = !!device && isOnlineDevice(device) && !!packageName;

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
      showToast("success", result || `${packageName} 操作成功`);
    } catch (error) {
      showToast("error", `当前应用操作失败: ${error}`);
    } finally {
      setConfirmAction(null);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">当前应用</h2>
        <span className="text-xs text-muted-foreground">{device ? device.model || device.serial : "请先连接设备"}</span>
      </div>

      <div className="mt-4 flex items-center gap-2 rounded-md border border-border bg-secondary/30 px-3 py-2">
        <span className="text-xs text-muted-foreground">包名</span>
        <span className="min-w-0 flex-1 truncate font-mono text-sm">{targetLabel}</span>
        <button
          type="button"
          onClick={async () => {
            if (!packageName) {
              return;
            }
            await navigator.clipboard.writeText(packageName);
            showToast("success", "已复制包名");
          }}
          disabled={!packageName}
          className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title="复制包名"
        >
          <Copy className="h-4 w-4" />
        </button>
      </div>

      {!currentPackage && (
        <div className="mt-3">
          <input
            value={manualPkg}
            onChange={(e) => setManualPkg(e.target.value)}
            placeholder="输入包名..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
          />
        </div>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canAct}
            onClick={() => void handleAction("force-stop")}
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Square className="h-4 w-4" />
            强停
          </button>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => void handleAction("launch")}
            className="inline-flex items-center gap-2 rounded-md bg-secondary px-3 py-1.5 text-sm transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Play className="h-4 w-4" />
            启动
          </button>
        </div>

        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={!canAct}
            onClick={() => setConfirmAction(confirmAction === "clear" ? null : "clear")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <AlertTriangle className="h-4 w-4" />
            {confirmAction === "clear" ? `确认清除 ${packageName} 数据?` : "清数据"}
          </button>
          <button
            type="button"
            disabled={!canAct}
            onClick={() => setConfirmAction(confirmAction === "uninstall" ? null : "uninstall")}
            className={cn(
              "inline-flex items-center gap-2 rounded-md border border-red-500/50 px-3 py-1.5 text-sm text-red-200 transition-colors hover:bg-red-500/10 disabled:cursor-not-allowed disabled:opacity-50"
            )}
          >
            <ShieldAlert className="h-4 w-4" />
            {confirmAction === "uninstall" ? `确认卸载 ${packageName}?` : "卸载"}
          </button>
        </div>
      </div>

      {confirmAction && (
        <div className="mt-3 flex items-center justify-between gap-2 rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-100">
          <span>
            {confirmAction === "clear" ? "再次点击以清除数据。" : "再次点击以卸载应用。"}
          </span>
          <button
            type="button"
            onClick={() => void handleAction(confirmAction)}
            className="rounded-md bg-red-500 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-400"
          >
            确认
          </button>
        </div>
      )}

      <div className="mt-3 text-xs text-muted-foreground">
        {currentActivity || "暂无前台 Activity"}
      </div>
    </section>
  );
}
