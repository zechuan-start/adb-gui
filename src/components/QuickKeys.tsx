import { errorText, useT } from "@/i18n";
import { ArrowLeft, Delete, Home, Layers3, Power, Minus, Plus, CornerDownLeft } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { getDeviceBySerial, isOnlineDevice } from "@/lib/device";
import { sendKey } from "@/lib/tauri";
import { cn } from "@/lib/utils";


export function QuickKeysTool() {
  const t = useT();
  const KEY_GROUPS = [
    {
      label: t.tools.quickKeys.navigation,
      items: [
        { action: "back", title: t.tools.quickKeys.back, icon: ArrowLeft },
        { action: "home", title: t.tools.quickKeys.home, icon: Home },
        { action: "recents", title: t.tools.quickKeys.recentApps, icon: Layers3 },
      ],
    },
    {
      label: t.tools.quickKeys.input,
      items: [
        { action: "enter", title: t.tools.quickKeys.enter, icon: CornerDownLeft },
        { action: "delete", title: t.tools.quickKeys.delete, icon: Delete },
      ],
    },
    {
      label: t.tools.quickKeys.hardware,
      items: [
        { action: "power", title: t.tools.quickKeys.power, icon: Power },
        { action: "volume-up", title: t.tools.quickKeys.volumeUp, icon: Plus },
        { action: "volume-down", title: t.tools.quickKeys.volumeDown, icon: Minus },
      ],
    },
  ] as const;

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
      showToast("success", (t) => (result || t.tools.quickKeys.sent({ action: action })));
    } catch (error) {
      showToast("error", (t) => (t.tools.quickKeys.couldNotSendKey({ detail: errorText(error, t) })));
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
