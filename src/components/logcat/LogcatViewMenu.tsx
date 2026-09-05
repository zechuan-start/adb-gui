import { Settings } from "lucide-react";
import { useUiStore } from "@/store/ui";

export function LogcatViewMenu() {
  const openSettings = useUiStore((state) => state.openSettings);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-controls="settings-dialog"
      onClick={() => openSettings("logcat")}
      aria-label="日志设置"
      title="日志设置"
      className="inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink"
    >
      <Settings className="h-3.5 w-3.5" />
    </button>
  );
}
