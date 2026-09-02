import { AlertTriangle, CircleOff } from "lucide-react";
import { getDeviceBySerial, getDeviceStateLabel, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";

export function StatusBanner() {
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);

  if (isOnlineDevice(device)) {
    return null;
  }

  const unauthorized = device?.state === "unauthorized";
  const Icon = unauthorized ? AlertTriangle : CircleOff;
  const title = device
    ? `设备${getDeviceStateLabel(device.state)}`
    : "没有检测到设备";
  const detail = unauthorized
    ? "请在设备上确认 USB 调试授权. 生码和解码等本地工具仍可使用."
    : device
      ? "请重新连接设备或刷新设备列表. 生码和解码等本地工具仍可使用."
      : "连接 Android 设备后可使用 ADB 功能. 生码和解码等本地工具仍可使用.";

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
