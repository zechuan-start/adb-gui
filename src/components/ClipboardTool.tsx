import { useEffect, useRef, useState } from "react";
import { ClipboardCopy, RefreshCw, Send } from "lucide-react";
import {
  createClipboardTransfer,
  type ClipboardDirection,
} from "@/lib/clipboardTransfer";
import {
  getDeviceBySerial,
  getDeviceDisplayLabel,
  isOnlineDevice,
} from "@/lib/device";
import {
  getDeviceClipboard,
  isTauriRuntime,
  readHostClipboardText,
  setDeviceClipboard,
  writeHostClipboardText,
} from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";

export function ClipboardTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selected = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selected);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [busy, setBusy] = useState<ClipboardDirection | null>(null);
  const controllerRef = useRef<ReturnType<
    typeof createClipboardTransfer
  > | null>(null);

  useEffect(() => {
    const controller = createClipboardTransfer({
      readHost: readHostClipboardText,
      writeHost: writeHostClipboardText,
      getDevice: getDeviceClipboard,
      setDevice: setDeviceClipboard,
      onBusy: setBusy,
      onSuccess: (direction) =>
        showToast(
          "success",
          direction === "to-device"
            ? "文本已发送到手机剪贴板"
            : "手机文本已复制到电脑剪贴板",
        ),
      onError: (message) => showToast("error", message),
    });
    const bind = () => {
      const state = useDeviceStore.getState();
      controller.bind(getDeviceBySerial(state.devices, state.selectedDevice));
    };
    bind();
    // Synchronous subscription also catches A -> B -> A before React renders again.
    const unsubscribe = useDeviceStore.subscribe(bind);
    controllerRef.current = controller;
    return () => {
      unsubscribe();
      controller.dispose();
      controllerRef.current = null;
    };
  }, [showToast]);

  const disabled =
    !isTauriRuntime() || !isOnlineDevice(device) || busy !== null;
  return (
    <div className="flex h-full min-w-0 flex-col gap-3">
      <div className="grid h-9 grid-cols-2 gap-2">
        {(
          [
            { direction: "to-device", label: "发送到手机", icon: Send },
            { direction: "to-host", label: "复制到电脑", icon: ClipboardCopy },
          ] as const
        ).map(({ direction, label, icon: Icon }) => (
          <button
            key={direction}
            type="button"
            disabled={disabled}
            onClick={() => void controllerRef.current?.transfer(direction)}
            className="flex min-w-0 items-center justify-center gap-1.5 border border-ink bg-ink px-2 text-xs text-onink hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {busy === direction ? (
              <RefreshCw className="h-3.5 w-3.5 shrink-0 animate-spin" />
            ) : (
              <Icon className="h-3.5 w-3.5 shrink-0" />
            )}
            <span className="whitespace-nowrap">{label}</span>
          </button>
        ))}
      </div>
      <div
        className="min-h-8 break-words border-y border-dashed border-rule2 py-2 text-[11px] text-ink2"
        title={device ? getDeviceDisplayLabel(device) : undefined}
      >
        {device ? getDeviceDisplayLabel(device) : "未连接设备"}
      </div>
    </div>
  );
}
