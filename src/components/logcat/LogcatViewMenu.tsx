import { useT } from "@/i18n";
import { Settings } from "lucide-react";
import { useUiStore } from "@/store/ui";

export function LogcatViewMenu() {
  const t = useT();
  const openSettings = useUiStore((state) => state.openSettings);
  return (
    <button
      type="button"
      aria-haspopup="dialog"
      aria-controls="settings-dialog"
      onClick={() => openSettings("logcat")}
      aria-label={t.logcat.settings}
      title={t.logcat.settings}
      className="inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink"
    >
      <Settings className="h-3.5 w-3.5" />
    </button>
  );
}
