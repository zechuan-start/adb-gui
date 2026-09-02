import { useCallback, useEffect, useMemo, useRef, useState } from "react";
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
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);

  const closePanel = useCallback(() => {
    setOpen(false);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        closePanel();
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      closePanel();
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closePanel, open]);

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
    <div ref={rootRef} className="relative">
      <button
        ref={triggerRef}
        type="button"
        onClick={() => setOpen((current) => !current)}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="wifi-connect-panel"
        className="inline-flex h-[34px] w-[34px] items-center justify-center border border-rule bg-transparent text-ink2 hover:border-ink hover:bg-hover hover:text-ink"
        title="WiFi 连接"
      >
        <Wifi className="h-4 w-4" />
      </button>

      {open && (
        <div
          id="wifi-connect-panel"
          role="dialog"
          aria-label="WiFi 连接"
          className="absolute left-0 top-10 z-50 w-80 max-w-[calc(100vw-2rem)] border border-rule bg-paper text-ink shadow-[3px_3px_0_var(--color-hard-shadow)]"
        >
          <div className="flex h-10 items-center justify-between border-b border-dashed border-rule px-3">
            <span className="font-data text-xs font-semibold">WiFi 连接</span>
            <button
              type="button"
              onClick={closePanel}
              className="inline-flex h-7 w-7 items-center justify-center text-ink3 hover:bg-hover hover:text-ink"
              title="关闭"
              aria-label="关闭 WiFi 连接"
            >
              <X className="h-4 w-4" />
            </button>
          </div>

          <div className="space-y-3 p-3">
            <div>
              <div className="mb-1.5 font-data text-[10px] font-medium text-ink3">手动连接</div>
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
                  className="h-8 min-w-0 flex-1 border border-rule bg-surface px-2.5 font-data text-xs text-ink outline-none placeholder:text-ink3 focus-visible:border-note"
                />
                <button
                  type="button"
                  onClick={() => void handleConnect()}
                  disabled={!address.trim() || busy !== null}
                  className="inline-flex h-8 items-center gap-2 border border-ink bg-ink px-3 font-data text-[11px] font-medium text-onink hover:border-ink2 hover:bg-ink2 disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {busy === "connect" ? <RefreshCw className="h-3.5 w-3.5 animate-spin" /> : <Link2 className="h-3.5 w-3.5" />}
                  连接
                </button>
              </div>
            </div>

            <div>
              <div className="mb-1.5 border-t border-dashed border-rule pt-3 font-data text-[10px] font-medium text-ink3">网络设备</div>
              <div className="space-y-1">
                {networkDevices.length === 0 && (
                  <div className="border border-dashed border-rule bg-surface2 px-2.5 py-2 font-data text-[11px] text-ink3">
                    暂无 WiFi 设备
                  </div>
                )}
                {networkDevices.map((item) => {
                  const disconnectBusy = busy === `disconnect:${item.serial}`;
                  return (
                    <div
                      key={item.serial}
                      className="flex min-h-8 items-center justify-between gap-2 border border-rule bg-surface px-2.5 py-1.5 text-xs"
                    >
                      <span className="min-w-0 flex-1 truncate font-data">{item.serial}</span>
                      <span
                        className={cn(
                          "shrink-0 border px-1.5 py-0.5 font-data text-[10px]",
                          isOnlineDevice(item)
                            ? "border-ok/45 bg-success-surface text-ok"
                            : "border-rule bg-surface2 text-ink3",
                        )}
                      >
                        {getDeviceStateLabel(item.state)}
                      </span>
                      <button
                        type="button"
                        onClick={() => void handleDisconnect(item.serial)}
                        disabled={busy !== null}
                        className="inline-flex h-7 items-center gap-1 border border-rule px-2 font-data text-[10px] text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-50"
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
                "flex h-9 w-full items-center justify-center gap-2 border border-rule bg-surface px-3 font-data text-[11px] font-medium text-ink",
                canEnableWifi && busy === null && "hover:border-ink3 hover:bg-hover",
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
