import { useMemo, useState } from "react";
import { Link2, RefreshCw, Unplug, Wifi, X } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { adbConnect, adbDisconnect, enableWifiDebugging, listDevices } from "@/lib/tauri";
import { getDeviceBySerial, getDeviceStateLabel, isConnectedNetworkDevice, isOnlineDevice } from "@/lib/device";
import { cn } from "@/lib/utils";

type BusyState = "connect" | "wifi" | `disconnect:${string}` | null;

export function WifiConnectButton() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const setDevices = useDeviceStore((s) => s.setDevices);
  const showToast = useFeedbackStore((s) => s.showToast);
  const device = getDeviceBySerial(devices, selectedDevice);
  const networkDevices = useMemo(
    () => devices.filter(isConnectedNetworkDevice),
    [devices],
  );
  const [open, setOpen] = useState(false);
  const [address, setAddress] = useState("");
  const [busy, setBusy] = useState<BusyState>(null);

  async function refreshDevices() {
    try {
      const list = await listDevices();
      setDevices(list);
    } catch (error) {
      console.error("Failed to refresh devices:", error);
      showToast("error", `刷新设备列表失败: ${error}`);
    }
  }

  async function handleConnect() {
    const input = address.trim();
    if (!input || busy) {
      return;
    }

    setBusy("connect");
    try {
      const result = await adbConnect(input);
      showToast("success", result || "设备连接成功");
      void refreshDevices();
      setAddress("");
    } catch (error) {
      showToast("error", `WiFi 连接失败: ${error}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleDisconnect(serial: string) {
    if (busy) {
      return;
    }

    setBusy(`disconnect:${serial}`);
    try {
      const result = await adbDisconnect(serial);
      showToast("success", result || "设备已断开");
      void refreshDevices();
    } catch (error) {
      showToast("error", `断开设备失败: ${error}`);
    } finally {
      setBusy(null);
    }
  }

  async function handleEnableWifi() {
    if (!device || !isOnlineDevice(device) || busy) {
      return;
    }

    setBusy("wifi");
    try {
      const addr = await enableWifiDebugging(device.serial);
      showToast("success", `已连接 ${addr}, 可以拔掉 USB 线`);
      void refreshDevices();
    } catch (error) {
      showToast("error", `一键切换到 WiFi 失败: ${error}`);
    } finally {
      setBusy(null);
    }
  }

  const canEnableWifi = !!device && isOnlineDevice(device);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen(!open)}
        className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        title="WiFi 连接"
      >
        <Wifi className="h-4 w-4" />
      </button>

      {open && (
        <div className="absolute left-0 top-10 z-50 w-80 rounded-lg border border-border bg-card p-3 shadow-xl">
          <div className="mb-3 flex items-center justify-between">
            <span className="text-sm font-semibold">WiFi 连接</span>
            <button
              type="button"
              onClick={() => setOpen(false)}
              className="text-muted-foreground transition-colors hover:text-foreground"
              title="关闭"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3">
            <div>
              <div className="mb-1 text-xs text-muted-foreground">手动连接</div>
              <div className="flex gap-2">
                <input
                  value={address}
                  onChange={(event) => setAddress(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") {
                      void handleConnect();
                    }
                  }}
                  placeholder="192.168.1.10:5555"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="off"
                  spellCheck={false}
                  className="min-w-0 flex-1 rounded-md border border-border bg-secondary px-3 py-1.5 font-mono text-xs outline-none focus:ring-1 focus:ring-ring"
                />
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={!address.trim() || busy !== null}
                  className="inline-flex items-center gap-2 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "connect" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  连接
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1 text-xs text-muted-foreground">网络设备</div>
              <div className="space-y-1">
                {networkDevices.length === 0 && (
                  <div className="rounded-md border border-border bg-secondary/40 px-2 py-2 text-xs text-muted-foreground">
                    暂无 WiFi 设备
                  </div>
                )}
                {networkDevices.map((item) => {
                  const disconnectBusy = busy === `disconnect:${item.serial}`;
                  return (
                    <div
                      key={item.serial}
                      className="flex items-center justify-between gap-2 rounded-md border border-border bg-secondary/40 px-2 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-mono">{item.serial}</span>
                      <span
                        className={cn(
                          "shrink-0 rounded px-1.5 py-0.5 text-[10px]",
                          isOnlineDevice(item) ? "bg-emerald-500/10 text-emerald-600" : "bg-secondary text-muted-foreground",
                        )}
                      >
                        {getDeviceStateLabel(item.state)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDisconnect(item.serial)}
                        disabled={busy !== null}
                        className="inline-flex items-center gap-1 rounded-md bg-secondary px-2 py-1 transition-colors hover:bg-secondary/80 disabled:cursor-not-allowed disabled:opacity-50"
                      >
                        {disconnectBusy ? <RefreshCw className="h-3 w-3 animate-spin" /> : <Unplug className="h-3 w-3" />}
                        断开
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>

            <button
              type="button"
              onClick={() => void handleEnableWifi()}
              disabled={!canEnableWifi || busy !== null}
              className={cn(
                "flex w-full items-center justify-center gap-2 rounded-md border border-border bg-secondary px-3 py-2 text-xs font-medium transition-colors",
                canEnableWifi && busy === null && "hover:bg-secondary/80",
                (!canEnableWifi || busy !== null) && "cursor-not-allowed opacity-50",
              )}
            >
              {busy === "wifi" ? <RefreshCw className="h-4 w-4 animate-spin" /> : <Wifi className="h-4 w-4" />}
              一键切换当前 USB 设备到 WiFi
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
