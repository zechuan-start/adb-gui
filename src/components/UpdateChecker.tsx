import { useEffect, useState } from "react";
import { check } from "@tauri-apps/plugin-updater";
import { relaunch } from "@tauri-apps/plugin-process";
import { Download, RefreshCw, X } from "lucide-react";
import { isTauriRuntime } from "@/lib/tauri";
import { useFeedbackStore } from "@/store/feedback";
import { useSettingsStore } from "@/store/settings";
import { createStartupCheck } from "@/lib/startup";

const initialSettings = useSettingsStore.getState();
const startupCheck = createStartupCheck(
  initialSettings.available && initialSettings.preferences.general.checkUpdatesOnStartup,
  check,
);
const unsubscribeSettings = useSettingsStore.subscribe((state) => {
  if (!state.available || !state.preferences.general.checkUpdatesOnStartup) startupCheck.disable();
});
if (import.meta.hot) import.meta.hot.dispose(unsubscribeSettings);

export function UpdateChecker() {
  const [update, setUpdate] = useState<Awaited<ReturnType<typeof check>> | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installing, setInstalling] = useState(false);
  const showToast = useFeedbackStore((state) => state.showToast);
  const enabled = useSettingsStore((state) => state.available && state.preferences.general.checkUpdatesOnStartup);

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }
    let disposed = false;
    void startupCheck.run()
      .then((nextUpdate) => {
        if (!disposed && nextUpdate?.available) {
          setUpdate(nextUpdate);
        }
      })
      .catch((error) => {
        console.error("Failed to check for updates:", error);
      });
    return () => {
      disposed = true;
    };
  }, []);

  if (!update?.available || dismissed || (!enabled && !installing)) return null;

  async function handleInstall(): Promise<void> {
    const currentUpdate = update;
    if (!currentUpdate || installing) {
      return;
    }
    setInstalling(true);
    try {
      await currentUpdate.downloadAndInstall();
      await relaunch();
    } catch (error) {
      showToast("error", `安装更新失败: ${String(error)}`);
      setInstalling(false);
    }
  }

  return (
    <div
      role="status"
      aria-live="polite"
      className="fixed bottom-4 right-4 z-40 w-[min(352px,calc(100vw-2rem))] border border-rule bg-paper text-ink shadow-[3px_3px_0_var(--color-hard-shadow)]"
    >
      <div className="flex min-h-11 items-center justify-between gap-3 border-b border-dashed border-rule px-3 py-2">
        <div className="flex items-center gap-2">
          <Download className="h-4 w-4 text-note" />
          <div>
            <div className="text-xs font-semibold">发现新版本</div>
            <div className="font-data text-[10px] text-ink3">v{update.version}</div>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          className="inline-flex h-7 w-7 items-center justify-center text-ink3 hover:bg-hover hover:text-ink"
          aria-label="关闭更新提示"
          title="关闭"
        >
          <X className="h-4 w-4" />
        </button>
      </div>
      {update.body && (
        <div className="max-h-32 overflow-auto whitespace-pre-wrap border-b border-rule px-3 py-2 text-xs leading-5 text-ink2">{update.body}</div>
      )}
      <div className="flex gap-2 p-3">
        <button
          type="button"
          onClick={() => void handleInstall()}
          disabled={installing}
          className="inline-flex h-8 items-center gap-2 border border-ink bg-ink px-3 font-data text-[11px] font-medium text-onink hover:border-ink2 hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-50"
        >
          {installing && <RefreshCw className="h-3.5 w-3.5 animate-spin" />}
          {installing ? "正在安装" : "安装并重启"}
        </button>
        <button
          type="button"
          onClick={() => setDismissed(true)}
          disabled={installing}
          className="h-8 border border-rule bg-surface px-3 font-data text-[11px] text-ink hover:border-ink3 hover:bg-hover disabled:cursor-not-allowed disabled:opacity-50"
        >
          稍后
        </button>
      </div>
    </div>
  );
}
