import { useState } from "react";
import { ExternalLink, Link2, RefreshCw } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { openDeepLink } from "@/lib/tauri";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

export function DeepLinkTool() {
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
      showToast("success", result || "已打开 Deep Link");
    } catch (error) {
      showToast("error", `打开失败: ${error}`);
    } finally {
      setBusy(false);
    }
  }

  const disabled = !device || !isOnlineDevice(device) || !url.trim() || busy;

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="flex items-center gap-2 text-sm font-semibold">
          <Link2 className="h-4 w-4" />
          Deep Link
        </h2>
        <span className="text-xs text-muted-foreground">
          {device ? device.model || device.serial : "请选择设备"}
        </span>
      </div>

      <div className="mt-4 flex gap-2">
        <input
          value={url}
          onChange={(event) => setUrl(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              void handleOpen();
            }
          }}
          placeholder="https://example.com 或 myapp://path"
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="off"
          spellCheck={false}
          className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-3 py-2 text-sm outline-none focus:ring-1 focus:ring-ring"
        />
        <button
          type="button"
          onClick={() => void handleOpen()}
          disabled={disabled}
          className={cn(
            "inline-flex items-center gap-2 rounded-md bg-primary px-3 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50",
            busy && "opacity-80",
          )}
        >
          {busy ? <RefreshCw className="h-4 w-4 animate-spin" /> : <ExternalLink className="h-4 w-4" />}
          打开
        </button>
      </div>

      <div className="mt-3 rounded-md border border-border bg-secondary/40 px-3 py-2 text-xs text-muted-foreground">
        {device && isOnlineDevice(device) ? "等待输入地址" : "设备在线后可操作"}
      </div>
    </section>
  );
}
