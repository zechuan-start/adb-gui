import { Copy, Minus, RefreshCw, Square, X } from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { getCurrentWindow } from "@tauri-apps/api/window";
import { DevicePicker } from "@/components/layout/DevicePicker";
import { WifiConnectButton } from "@/components/WifiConnect";
import { getAdbInfo, isTauriRuntime, listDevices } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore, type ToastKind } from "@/store/feedback";

function isWindowsTauriRuntime(): boolean {
  return isTauriRuntime() && /Windows/i.test(globalThis.navigator?.userAgent ?? "");
}

interface WindowControlButtonProps {
  label: string;
  onClick: () => void;
  children: ReactNode;
  danger?: boolean;
}

function WindowControlButton({
  label,
  onClick,
  children,
  danger = false,
}: WindowControlButtonProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      title={label}
      className={cn(
        "flex h-full w-11 items-center justify-center text-ink2 transition-colors hover:bg-hover hover:text-ink",
        danger && "hover:bg-err hover:text-onink",
      )}
    >
      {children}
    </button>
  );
}

interface WindowControlsProps {
  showToast: (kind: ToastKind, message: string) => void;
}

function WindowControls({ showToast }: WindowControlsProps) {
  const [maximized, setMaximized] = useState(false);
  const appWindow = useMemo(() => getCurrentWindow(), []);

  useEffect(() => {
    let disposed = false;

    function syncMaximizedState(): void {
      void appWindow
        .isMaximized()
        .then((nextMaximized) => {
          if (!disposed) {
            setMaximized(nextMaximized);
          }
        })
        .catch(() => {
          // Window state is only available in the desktop runtime.
        });
    }

    syncMaximizedState();
    let unlisten: (() => void) | null = null;
    void appWindow
      .onResized(syncMaximizedState)
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
        } else {
          unlisten = nextUnlisten;
        }
      })
      .catch(() => {
        // Window event registration is unavailable outside the desktop runtime.
      });

    return () => {
      disposed = true;
      unlisten?.();
    };
  }, [appWindow]);

  function runWindowAction(action: () => Promise<void>, label: string): void {
    void action().catch((error: unknown) => {
      showToast("error", `${label}失败: ${String(error)}`);
    });
  }

  return (
    <div
      className="flex h-full shrink-0 items-stretch border-l border-rule"
      data-tauri-drag-region="false"
    >
      <WindowControlButton
        label="最小化窗口"
        onClick={() => runWindowAction(() => appWindow.minimize(), "最小化窗口")}
      >
        <Minus className="h-4 w-4" aria-hidden="true" />
      </WindowControlButton>
      <WindowControlButton
        label={maximized ? "还原窗口" : "最大化窗口"}
        onClick={() => runWindowAction(() => appWindow.toggleMaximize(), "切换窗口大小")}
      >
        {maximized ? (
          <Copy className="h-3.5 w-3.5" aria-hidden="true" />
        ) : (
          <Square className="h-3.5 w-3.5" aria-hidden="true" />
        )}
      </WindowControlButton>
      <WindowControlButton
        label="关闭窗口"
        onClick={() => runWindowAction(() => appWindow.close(), "关闭窗口")}
        danger
      >
        <X className="h-4 w-4" aria-hidden="true" />
      </WindowControlButton>
    </div>
  );
}

export function TopBar() {
  const adbInfo = useDeviceStore((state) => state.adbInfo);
  const setAdbInfo = useDeviceStore((state) => state.setAdbInfo);
  const setDevices = useDeviceStore((state) => state.setDevices);
  const showToast = useFeedbackStore((state) => state.showToast);
  const [refreshing, setRefreshing] = useState(false);
  const windowsRuntime = isWindowsTauriRuntime();
  const adbLabel = adbInfo ? `adb ${adbInfo.version} · ${adbInfo.source}` : "adb 未就绪";

  async function refreshDevices() {
    if (refreshing) {
      return;
    }
    setRefreshing(true);
    try {
      const [info, nextDevices] = await Promise.all([getAdbInfo(), listDevices()]);
      setAdbInfo(info);
      setDevices(nextDevices);
    } catch (error) {
      showToast("error", `刷新设备失败: ${String(error)}`);
    } finally {
      setRefreshing(false);
    }
  }

  return (
    <header
      className={cn(
        "flex h-[54px] shrink-0 items-center gap-2.5 border-b border-rule bg-surface px-[18px]",
        windowsRuntime && "pr-0",
      )}
      data-tauri-drag-region={windowsRuntime ? "deep" : undefined}
    >
      <div className="flex w-[clamp(190px,32vw,292px)] min-w-0 items-center">
        <DevicePicker />
      </div>
      <button
        type="button"
        onClick={() => void refreshDevices()}
        disabled={refreshing}
        className="flex h-[34px] w-[34px] shrink-0 items-center justify-center border border-rule text-ink2 hover:border-ink hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
        title="刷新设备"
        aria-label="刷新设备"
      >
        <RefreshCw className={cn("h-4 w-4", refreshing && "animate-spin")} />
      </button>
      <WifiConnectButton />

      <div className="ml-auto flex min-w-0 items-center justify-end">
        <span className="min-w-0 truncate font-data text-[10.5px] text-ink3" title={adbLabel}>
          {adbLabel}
        </span>
      </div>
      {windowsRuntime && <WindowControls showToast={showToast} />}
    </header>
  );
}
