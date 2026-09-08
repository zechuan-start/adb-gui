import { errorText, useT } from "@/i18n";
import { useState } from "react";
import { ExternalLink, RefreshCw } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { openDeepLink } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

export function DeepLinkTool() {
  const t = useT();
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [url, setUrl] = useState("");
  const [busy, setBusy] = useState(false);

  async function handleOpen() {
    const target = url.trim();
    if (!device || !isOnlineDevice(device) || !target || busy) {
      return;
    }

    setBusy(true);
    try {
      const result = await openDeepLink(device.serial, target);
      showToast("success", (t) => (result || t.tools.deepLinkTool.deepLinkOpened));
    } catch (error) {
      showToast("error", (t) => (t.tools.deepLinkTool.couldNotOpen({ detail: errorText(error, t) })));
    } finally {
      setBusy(false);
    }
  }

  const disabled = !device || !isOnlineDevice(device) || !url.trim() || busy;

  return (
    <div className="flex h-full min-w-0 flex-col">
      <div className="flex gap-1.5">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleOpen();
            }
          }}
          placeholder={t.tools.deepLinkTool.httpsExampleComOrMyappPath}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          disabled={!device || !isOnlineDevice(device)}
          className="h-9 min-w-0 flex-1 border border-rule bg-surface px-2.5 font-data text-xs outline-none transition-colors placeholder:text-ink3 focus:border-note disabled:cursor-not-allowed disabled:opacity-40"
        />
        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={disabled}
          className={cn(
            "inline-flex h-9 shrink-0 items-center gap-2 border border-ink bg-ink px-3 font-data text-xs font-medium text-onink transition-colors hover:border-ink2 hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-40",
            busy && "opacity-80",
          )}
        >
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          {t.tools.deepLinkTool.open}
        </button>
      </div>

      <div className="mt-auto border-t border-dashed border-rule2 pt-3 text-xs text-ink2">
        {device && isOnlineDevice(device) ? t.tools.deepLinkTool.enterAnAddress : t.tools.deepLinkTool.availableWhenTheDeviceIsOnline}
      </div>
    </div>
  );
}
