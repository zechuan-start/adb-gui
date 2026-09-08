import { AppError, toAppError, errorIdentity } from "@/i18n/errors";
import { useT } from "@/i18n";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import {
  AppWindow,
  ArrowLeftRight,
  Bug,
  Camera,
  Clipboard,
  Keyboard,
  Link2,
  PackageOpen,
  Video,
} from "lucide-react";
import { CurrentAppActionsTool } from "@/components/ActivityMonitor";
import { ApkTool } from "@/components/AppManager";
import { BugReportTool } from "@/components/BugReportTool";
import { CodeDecoderPage } from "@/components/CodeDecoderPage";
import { CodeGeneratorPage } from "@/components/CodeGeneratorPage";
import { DeepLinkTool } from "@/components/DeepLinkTool";
import { DeviceSpecStrip } from "@/components/DeviceSpecStrip";
import { DeviceFileManager } from "@/components/DeviceFileManager";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { TopBar } from "@/components/layout/TopBar";
import { LogcatPanel } from "@/components/logcat/LogcatPanel";
import { LogcatRuntime } from "@/components/logcat/LogcatRuntime";
import { PackageManagerPanel } from "@/components/PackageManager";
import { PerformancePanel } from "@/components/performance/PerformancePanel";
import { PortForwardTool } from "@/components/PortForwardTool";
import { QuickKeysTool } from "@/components/QuickKeys";
import { ScreenRecordTool } from "@/components/ScreenRecordTool";
import { ScreenshotTool } from "@/components/Screenshot";
import { ToastBar } from "@/components/ToastBar";
import { ToolModule } from "@/components/ToolModule";
import { UpdateChecker } from "@/components/UpdateChecker";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
import { ClipboardTool } from "@/components/ClipboardTool";
import {
  createActivityPollingController,
  type ActivityPollingController,
} from "@/hooks/activityPollingController";
import { getDeviceBySerial } from "@/lib/device";
import {
  getAdbInfo,
  getCurrentActivity,
  isTauriRuntime,
  listDeviceProcesses,
  listDevices,
  onDevicesUpdated,
} from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { useLogcatStore } from "@/store/logcat";
import { type PaneId, useUiStore } from "@/store/ui";

interface WorkspacePaneProps {
  id: PaneId;
  activePane: PaneId;
  children: ReactNode;
}

function WorkspacePane({ id, activePane, children }: WorkspacePaneProps) {
  const active = id === activePane;
  return (
    <section
      role="tabpanel"
      aria-labelledby={`pane-nav-${id}`}
      aria-hidden={!active}
      className={cn("h-full min-h-0", !active && "hidden")}
    >
      {children}
    </section>
  );
}

function App() {
  const t = useT();
  const activityControllerRef = useRef<ActivityPollingController | null>(null);
  const processGenerationRef = useRef(0);
  const [activityRefreshing, setActivityRefreshing] = useState(false);
  const activePane = useUiStore((state) => state.activePane);
  const logcatVisible = useUiStore((state) => state.logOpenByPane[activePane]);
  const devices = useDeviceStore((state) => state.devices);
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const setAdbInfo = useDeviceStore((state) => state.setAdbInfo);
  const setDevices = useDeviceStore((state) => state.setDevices);
  const setCurrentActivity = useDeviceStore((state) => state.setCurrentActivity);
  const showToast = useFeedbackStore((state) => state.showToast);
  const logcatRestartNonce = useLogcatStore((state) => state.restartNonce);
  const selected = getDeviceBySerial(devices, selectedDevice);
  const onlineSerial = selected?.state === "device" ? selected.serial : null;

  useEffect(() => {
    if (!isTauriRuntime()) {
      return;
    }

    void getAdbInfo().then(setAdbInfo).catch((error) => {
      showToast("error", new AppError("shell.adbInfo", {}, { causes: [toAppError(error)] }).payload);
    });
    void listDevices().then(setDevices).catch((error) => {
      showToast("error", new AppError("shell.devices", {}, { causes: [toAppError(error)] }).payload);
    });

    let disposed = false;
    let unlistenDevices: (() => void) | null = null;
    void onDevicesUpdated((nextDevices) => setDevices(nextDevices))
      .then((nextUnlisten) => {
        if (disposed) {
          nextUnlisten();
          return;
        }
        unlistenDevices = nextUnlisten;
      })
      .catch((error) => {
        if (!disposed) {
          showToast("error", new AppError("shell.listenDevices", {}, { causes: [toAppError(error)] }).payload);
        }
      });

    return () => {
      disposed = true;
      unlistenDevices?.();
      unlistenDevices = null;
    };
  }, [setAdbInfo, setDevices, showToast]);

  const refreshCurrentActivity = useCallback(() => {
    const controller = activityControllerRef.current;
    if (!controller) {
      return;
    }
    setActivityRefreshing(true);
    void controller.refresh().then(() => setActivityRefreshing(false));
  }, []);

  useEffect(() => {
    if (!onlineSerial) {
      activityControllerRef.current = null;
      setCurrentActivity("");
      useLogcatStore.getState().clearProcessMap();
      return;
    }

    let lastError = "";
    let lastProcessError = "";
    processGenerationRef.current += 1;
    const processMapKey = `${onlineSerial}:${logcatRestartNonce}:${processGenerationRef.current}`;
    useLogcatStore.getState().beginProcessMapSession(processMapKey);
    const controller = createActivityPollingController(onlineSerial, {
      loadActivity: getCurrentActivity,
      loadProcesses: listDeviceProcesses,
      schedule: (callback, delayMs) => window.setTimeout(callback, delayMs),
      cancelSchedule: (handle) => window.clearTimeout(handle),
      now: () => Date.now(),
      onActivity: (activity) => {
        lastError = "";
        setCurrentActivity(activity);
      },
      onError: (error) => {
        const message = new AppError("shell.activity", {}, { causes: [toAppError(error)] }).payload;
        if (lastError !== errorIdentity(message)) {
          lastError = errorIdentity(message);
          showToast("error", message);
        }
      },
      onProcessRefreshing: () => {
        useLogcatStore.getState().beginProcessMapRefresh(processMapKey);
      },
      onProcesses: (entries, updatedAt) => {
        lastProcessError = "";
        useLogcatStore.getState().completeProcessMapRefresh(
          processMapKey,
          entries,
          updatedAt,
        );
      },
      onProcessError: (error) => {
        const message = new AppError("shell.processes", {}, { causes: [toAppError(error)] }).payload;
        useLogcatStore.getState().failProcessMapRefresh(processMapKey, message);
        if (lastProcessError !== errorIdentity(message)) {
          lastProcessError = errorIdentity(message);
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
  }, [logcatRestartNonce, onlineSerial, setCurrentActivity, showToast]);

  return (
    <>
      <LogcatRuntime />
      <AppShell
        topBar={<TopBar />}
        statusBanner={<StatusBanner />}
        logcat={<LogcatPanel visible={logcatVisible} />}
      >
        <WorkspacePane id="tools" activePane={activePane}>
          <div className="h-full min-h-0 overflow-y-auto px-[18px] pb-6 pt-4">
            <div className="space-y-4">
              <DeviceSpecStrip
                activityRefreshing={activityRefreshing}
                onRefreshActivity={refreshCurrentActivity}
              />
              <div className="grid grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3.5">
                <ToolModule icon={<Camera />} title={t.shell.modules.screenshot} reference="A-01">
                  <ScreenshotTool />
                </ToolModule>
                <ToolModule icon={<Video />} title={t.shell.modules.recording} reference="A-02">
                  <ScreenRecordTool active={activePane === "tools"} />
                </ToolModule>
                <ToolModule icon={<PackageOpen />} title={t.shell.modules.install} reference="A-03">
                  <ApkTool active={activePane === "tools"} />
                </ToolModule>
                <ToolModule icon={<Link2 />} title="Deep Link" reference="A-04">
                  <DeepLinkTool />
                </ToolModule>
                <ToolModule icon={<ArrowLeftRight />} title={t.shell.modules.ports} reference="A-05" wide>
                  <PortForwardTool active={activePane === "tools"} />
                </ToolModule>
                <ToolModule icon={<Keyboard />} title={t.shell.modules.keys} reference="A-06">
                  <QuickKeysTool />
                </ToolModule>
                <ToolModule icon={<Clipboard />} title={t.shell.modules.clipboard} reference="A-09">
                  <ClipboardTool />
                </ToolModule>
                <ToolModule icon={<AppWindow />} title={t.shell.modules.currentApp} reference="A-07">
                  <CurrentAppActionsTool />
                </ToolModule>
                <ToolModule icon={<Bug />} title={t.shell.modules.bugReport} reference="A-08">
                  <BugReportTool />
                </ToolModule>
              </div>
            </div>
          </div>
        </WorkspacePane>
        <WorkspacePane id="apps" activePane={activePane}>
          <PackageManagerPanel />
        </WorkspacePane>
        <WorkspacePane id="files" activePane={activePane}>
          <DeviceFileManager active={activePane === "files"} />
        </WorkspacePane>
        <WorkspacePane id="codegen" activePane={activePane}>
          <CodeGeneratorPage />
        </WorkspacePane>
        <WorkspacePane id="decoder" activePane={activePane}>
          <CodeDecoderPage active={activePane === "decoder"} />
        </WorkspacePane>
        <WorkspacePane id="perf" activePane={activePane}>
          <PerformancePanel active={activePane === "perf"} />
        </WorkspacePane>
      </AppShell>
      <ToastBar />
      <UpdateChecker />
      <SettingsDialog />
    </>
  );
}

export default App;
