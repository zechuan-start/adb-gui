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
    <div className="flex h-full min-w-0 flex-col justify-between gap-3">
      <div className="flex flex-1 flex-col justify-between gap-3">
        {KEY_GROUPS.map((group) => (
          <div key={group.label} className="space-y-2">
            <div className="font-data text-[10.5px] text-ink3">{group.label}</div>
            <div className="flex flex-wrap gap-1.5">
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
                      "inline-flex h-8 w-8 items-center justify-center border border-rule bg-transparent text-ink transition-all hover:border-ink3 hover:bg-hover active:scale-95 disabled:cursor-not-allowed disabled:opacity-40"
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
    </div>
  );
}
