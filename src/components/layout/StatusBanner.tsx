import { useT } from "@/i18n";
import { AlertTriangle, CircleOff } from "lucide-react";
import { getDeviceBySerial, getDeviceStateLabel, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";

export function StatusBanner() {
  const t = useT();
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);

  if (isOnlineDevice(device)) {
    return null;
  }

  const unauthorized = device?.state === "unauthorized";
  const Icon = unauthorized ? AlertTriangle : CircleOff;
  const title = device
    ? t.shell.status.device({ state: getDeviceStateLabel(device.state, t) })
    : t.shell.status.noDevice;
  const detail = unauthorized
    ? t.shell.status.unauthorized
    : device
      ? t.shell.status.offline
      : t.shell.status.disconnected;

  return (
    <div
      role="status"
      className={cn(
        "flex shrink-0 items-start gap-2 border-b border-rule border-l-[3px] bg-surface2 px-4 py-2 text-xs text-ink2",
        unauthorized ? "border-l-warn" : "border-l-ink3",
      )}
    >
      <Icon className={unauthorized ? "mt-0.5 h-4 w-4 shrink-0 text-warn" : "mt-0.5 h-4 w-4 shrink-0 text-ink3"} />
      <p className="min-w-0 leading-5">
        <strong className="mr-2 font-semibold text-ink">{title}</strong>
        {detail}
      </p>
    </div>
  );
}
