import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, LayoutList, Moon, RefreshCw, Sun, TabletSmartphone } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useThemeStore } from "@/store/theme";
import {
  getAdbInfo,
  getCurrentActivity,
  listDevices,
  onDevicesUpdated,
} from "@/lib/tauri";
import { DeviceSelector } from "@/components/DeviceSelector";
import { ScreenshotTool } from "@/components/Screenshot";
import { ApkInstallTool } from "@/components/AppManager";
import { QuickKeysTool } from "@/components/LogcatViewer";
import { LogcatPanel } from "@/components/Logcat";
import { CurrentAppActionsTool } from "@/components/ActivityMonitor";
import { UpdateChecker } from "@/components/UpdateChecker";
import { DeviceInfoButton } from "@/components/DeviceInfoPanel";
import { PackageManagerPanel } from "@/components/PackageManager";
import { ToastBar } from "@/components/ToastBar";
import { cn } from "@/lib/utils";

type TabId = "tools" | "logcat" | "apps";

const TABS: { id: TabId; label: string; icon: typeof TabletSmartphone; badge?: string }[] = [
  { id: "tools", label: "工具", icon: TabletSmartphone },
  { id: "logcat", label: "日志", icon: ClipboardList },
  { id: "apps", label: "应用", icon: LayoutList },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("tools");
  const {
    adbInfo,
    setAdbInfo,
    setDevices,
    selectedDevice,
    setCurrentActivity,
    currentActivity,
  } = useDeviceStore();
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    getAdbInfo().then(setAdbInfo).catch(console.error);
    listDevices().then(setDevices).catch(console.error);

    let unlistenDevices: (() => void) | null = null;

    onDevicesUpdated((devices) => setDevices(devices)).then((fn) => {
      unlistenDevices = fn;
    });

    return () => {
      unlistenDevices?.();
    };
  }, [setAdbInfo, setDevices, setCurrentActivity]);

  const refreshCurrentActivity = useCallback(async () => {
    if (!selectedDevice) {
      setCurrentActivity("");
      return "";
    }
    try {
      const activity = await getCurrentActivity(selectedDevice);
      setCurrentActivity(activity);
      return activity;
    } catch (error) {
      console.error("Failed to refresh current activity:", error);
      setCurrentActivity("");
      return "";
    }
  }, [selectedDevice, setCurrentActivity]);

  useEffect(() => {
    void refreshCurrentActivity();

    if (!selectedDevice) {
      return;
    }

    const timer = window.setInterval(() => {
      void refreshCurrentActivity();
    }, 5000);

    return () => window.clearInterval(timer);
  }, [refreshCurrentActivity, selectedDevice]);

  const adbLabel = useMemo(() => {
    if (!adbInfo) {
      return "adb 未就绪";
    }
    return `adb ${adbInfo.version} (${adbInfo.source})`;
  }, [adbInfo]);

  return (
    <div className="flex h-screen flex-col bg-background text-foreground">
      <header className="border-b border-border bg-card/80">
        <div className="flex h-10 items-center gap-3 px-4">
          <div className="flex items-center gap-2 text-sm font-semibold">
            <TabletSmartphone className="h-4 w-4" />
            <span>ADB GUI</span>
          </div>
          <DeviceSelector />
          <div className="ml-auto flex items-center gap-2 text-xs text-muted-foreground">
            <span className="font-mono">{adbLabel}</span>
            <DeviceInfoButton />
            <button
              type="button"
              onClick={() => {
                const next = theme === "dark" ? "light" : "dark";
                setTheme(next);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              title={theme === "dark" ? "切换到亮色模式" : "切换到暗色模式"}
            >
              {theme === "dark" ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            </button>
            <button
              type="button"
              onClick={() => {
                getAdbInfo().then(setAdbInfo).catch(console.error);
                listDevices().then(setDevices).catch(console.error);
              }}
              className="inline-flex h-8 w-8 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
              title="刷新"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
          </div>
        </div>
        {selectedDevice && (
          <div className="flex h-7 items-center gap-3 border-t border-border bg-secondary/40 px-4 text-xs">
            <span className="text-muted-foreground">Activity:</span>
            <span className="min-w-0 flex-1 truncate font-mono text-foreground" title={currentActivity || "暂无前台 Activity"}>
              {currentActivity || "暂无前台 Activity"}
            </span>
            <button
              type="button"
              onClick={() => void refreshCurrentActivity()}
              className="inline-flex h-6 w-6 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-secondary hover:text-foreground"
              title="刷新 Activity"
            >
              <RefreshCw className="h-3.5 w-3.5" />
            </button>
          </div>
        )}
      </header>

      <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
        <div className="border-b border-border bg-card px-4 py-2">
          <div className="inline-flex rounded-lg border border-border bg-secondary/60 p-1">
            {TABS.map((tab) => {
              const Icon = tab.icon;
              const active = activeTab === tab.id;
              return (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveTab(tab.id)}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-sm transition-colors",
                    active ? "bg-background text-foreground shadow-sm" : "text-muted-foreground hover:text-foreground"
                  )}
                >
                  <Icon className="h-4 w-4" />
                  <span>{tab.label}</span>
                  {tab.badge && <span className="text-[10px] text-muted-foreground">{tab.badge}</span>}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-0 flex-1 overflow-hidden">
          {activeTab === "tools" && (
            <section className="flex min-h-0 h-full flex-col gap-3 overflow-y-auto p-4">
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[55fr_45fr]">
                <ScreenshotTool />
                <ApkInstallTool />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
                <QuickKeysTool />
                <CurrentAppActionsTool />
              </div>
            </section>
          )}
          {activeTab === "logcat" && <LogcatPanel />}
          {activeTab === "apps" && <PackageManagerPanel />}
        </div>
      </main>
      <ToastBar />
      <UpdateChecker />
    </div>
  );
}

export default App;
