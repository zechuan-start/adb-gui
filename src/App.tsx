import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  ClipboardList,
  FolderTree,
  LayoutList,
  Moon,
  QrCode,
  RefreshCw,
  Sun,
  TabletSmartphone,
} from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { useThemeStore } from "@/store/theme";
import {
  createActivityPollingController,
  type ActivityPollingController,
} from "@/hooks/activityPollingController";
import {
  getAdbInfo,
  getCurrentActivity,
  listDeviceProcesses,
  listDevices,
  onDevicesUpdated,
} from "@/lib/tauri";
import { DeviceSelector } from "@/components/DeviceSelector";
import { ScreenshotTool } from "@/components/Screenshot";
import { ScreenRecordTool } from "@/components/ScreenRecordTool";
import { ApkTool } from "@/components/AppManager";
import { QuickKeysTool } from "@/components/QuickKeys";
import { LogcatPanel } from "@/components/logcat/LogcatPanel";
import { CurrentAppActionsTool } from "@/components/ActivityMonitor";
import { UpdateChecker } from "@/components/UpdateChecker";
import { DeviceInfoButton } from "@/components/DeviceInfoPanel";
import { DeepLinkTool } from "@/components/DeepLinkTool";
import { PortForwardTool } from "@/components/PortForwardTool";
import { BugReportTool } from "@/components/BugReportTool";
import { PackageManagerPanel } from "@/components/PackageManager";
import { ToastBar } from "@/components/ToastBar";
import { WifiConnectButton } from "@/components/WifiConnect";
import { CodeGeneratorPage } from "@/components/CodeGeneratorPage";
import { DeviceFileManager } from "@/components/DeviceFileManager";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";

type TabId = "tools" | "logcat" | "apps" | "files" | "code";

const TABS: { id: TabId; label: string; icon: typeof TabletSmartphone; badge?: string }[] = [
  { id: "tools", label: "工具", icon: TabletSmartphone },
  { id: "logcat", label: "日志", icon: ClipboardList },
  { id: "apps", label: "应用", icon: LayoutList },
  { id: "files", label: "文件", icon: FolderTree },
  { id: "code", label: "生码", icon: QrCode },
];

function App() {
  const [activeTab, setActiveTab] = useState<TabId>("tools");
  const [logcatMounted, setLogcatMounted] = useState(false);
  const activityControllerRef = useRef<ActivityPollingController | null>(null);
  const processGenerationRef = useRef(0);
  const logcatVisible = activeTab === "logcat";
  const logcatRestartNonce = useLogcatStore((state) => state.restartNonce);
  const {
    adbInfo,
    setAdbInfo,
    setDevices,
    selectedDevice,
    setCurrentActivity,
    currentActivity,
  } = useDeviceStore();
  const showToast = useFeedbackStore((state) => state.showToast);
  const { theme, setTheme } = useThemeStore();

  useEffect(() => {
    if (logcatVisible) {
      setLogcatMounted(true);
    }
  }, [logcatVisible]);

  useEffect(() => {
    getAdbInfo().then(setAdbInfo).catch(console.error);
    listDevices().then(setDevices).catch(console.error);

    let disposed = false;
    let unlistenDevices: (() => void) | null = null;
    void onDevicesUpdated((devices) => setDevices(devices))
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlistenDevices = nextUnlisten;
      })
      .catch((error) => {
        if (!disposed) {
          showToast("error", `监听设备更新失败: ${String(error)}`);
        }
      });

    return () => {
      disposed = true;
      unlistenDevices?.();
      unlistenDevices = null;
    };
  }, [setAdbInfo, setDevices, showToast]);

  const refreshCurrentActivity = useCallback(() => {
    activityControllerRef.current?.refresh();
  }, []);

  useEffect(() => {
    if (!selectedDevice) {
      activityControllerRef.current = null;
      setCurrentActivity("");
      useLogcatStore.getState().clearProcessMap();
      return;
    }
    let lastError = "";
    let lastProcessError = "";
    let processMapKey: string | null = null;
    if (logcatMounted) {
      processGenerationRef.current += 1;
      processMapKey = `${selectedDevice}:${logcatRestartNonce}:${processGenerationRef.current}`;
      useLogcatStore.getState().beginProcessMapSession(processMapKey);
    }
    const controller = createActivityPollingController(selectedDevice, {
      loadActivity: getCurrentActivity,
      loadProcesses: processMapKey === null ? undefined : listDeviceProcesses,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelSchedule: (handle) => window.clearTimeout(handle),
      now: () => Date.now(),
      onActivity: (activity) => {
        lastError = "";
        setCurrentActivity(activity);
      },
      onError: (error) => {
        const message = `刷新前台 Activity 失败: ${String(error)}`;
        if (lastError !== message) {
          lastError = message;
          showToast("error", message);
        }
      },
      onProcessRefreshing: () => {
        if (processMapKey !== null) {
          useLogcatStore.getState().beginProcessMapRefresh(processMapKey);
        }
      },
      onProcesses: (entries, updatedAt) => {
        if (processMapKey === null) {
          return;
        }
        lastProcessError = "";
        useLogcatStore.getState().completeProcessMapRefresh(
          processMapKey,
          entries,
          updatedAt,
        );
      },
      onProcessError: (error) => {
        if (processMapKey === null) {
          return;
        }
        const message = `读取设备进程表失败: ${String(error)}`;
        useLogcatStore.getState().failProcessMapRefresh(processMapKey, message);
        if (lastProcessError !== message) {
          lastProcessError = message;
          showToast("error", message);
        }
      },
    });
    activityControllerRef.current = controller;
    controller.run();
    return () => {
      controller.dispose();
      if (activityControllerRef.current === controller) {
        activityControllerRef.current = null;
      }
    };
  }, [logcatMounted, logcatRestartNonce, selectedDevice, setCurrentActivity, showToast]);

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
          <WifiConnectButton />
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
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-2 xl:grid-cols-4">
                <ScreenshotTool />
                <ScreenRecordTool />
                <ApkTool />
                <DeepLinkTool />
              </div>
              <div className="grid grid-cols-1 gap-3 xl:grid-cols-[minmax(280px,1fr)_minmax(0,2fr)]">
                <BugReportTool />
                <PortForwardTool />
              </div>
              <div className="grid grid-cols-1 gap-3 lg:grid-cols-[2fr_3fr]">
                <QuickKeysTool />
                <CurrentAppActionsTool />
              </div>
            </section>
          )}
          {(logcatMounted || logcatVisible) && (
            <div className={cn("h-full min-h-0", !logcatVisible && "hidden")}>
              <LogcatPanel visible={logcatVisible} />
            </div>
          )}
          {activeTab === "apps" && <PackageManagerPanel />}
          {activeTab === "files" && <DeviceFileManager />}
          {activeTab === "code" && <CodeGeneratorPage />}
        </div>
      </main>
      <ToastBar />
      <UpdateChecker />
    </div>
  );
}

export default App;
