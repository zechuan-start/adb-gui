import { ArrowLeft, Delete, Home, Layers3, Power, Minus, Plus, CornerDownLeft } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { sendKey } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const KEY_GROUPS = [
  {
    label: "导航",
    items: [
      { action: "back", title: "返回", icon: ArrowLeft },
      { action: "home", title: "主页", icon: Home },
      { action: "recents", title: "最近任务", icon: Layers3 },
    ],
  },
  {
    label: "输入",
    items: [
      { action: "enter", title: "回车", icon: CornerDownLeft },
      { action: "delete", title: "删除", icon: Delete },
    ],
  },
  {
    label: "硬件",
    items: [
      { action: "power", title: "电源", icon: Power },
      { action: "volume-up", title: "音量+", icon: Plus },
      { action: "volume-down", title: "音量-", icon: Minus },
    ],
  },
] as const;

export function QuickKeysTool() {
  const devices = useDeviceStore((s) => s.devices);
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const device = getDeviceBySerial(devices, selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);

  async function handleKey(action: (typeof KEY_GROUPS)[number]["items"][number]["action"]) {
    if (!device || !isOnlineDevice(device)) {
      return;
    }

    try {
      const result = await sendKey(device.serial, action);
      showToast("success", result || `${action} 已发送`);
    } catch (error) {
      showToast("error", `按键发送失败: ${error}`);
    }
  }

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="flex items-center justify-between gap-3">
        <h2 className="text-sm font-semibold">快捷按键</h2>
        <span className="text-xs text-muted-foreground">{device ? device.model || device.serial : "请先连接设备"}</span>
      </div>

      <div className="mt-4 space-y-3">
        {KEY_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <div className="text-xs text-muted-foreground">{group.label}</div>
            <div className="flex flex-wrap gap-2">
              {group.items.map((item) => {
                const Icon = item.icon;
                return (
                  <button
                    key={item.action}
                    type="button"
                    title={item.title}
                    disabled={!device || !isOnlineDevice(device)}
                    onClick={() => void handleKey(item.action)}
                    className={cn(
                      "inline-flex h-9 w-9 items-center justify-center rounded-md bg-secondary text-foreground transition-all hover:bg-secondary/80 active:scale-95 disabled:cursor-not-allowed disabled:opacity-50"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                  </button>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}
