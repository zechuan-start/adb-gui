import { AppError, toAppError, errorIdentity } from "@/i18n/errors";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { CodeDecoderPage } from "@/components/CodeDecoderPage";
import { CodeGeneratorPage } from "@/components/CodeGeneratorPage";
import { DeviceFileManager } from "@/components/DeviceFileManager";
import { AppShell } from "@/components/layout/AppShell";
import { StatusBanner } from "@/components/layout/StatusBanner";
import { TopBar } from "@/components/layout/TopBar";
import { LogcatPanel } from "@/components/logcat/LogcatPanel";
import { LogcatRuntime } from "@/components/logcat/LogcatRuntime";
import { PackageManagerPanel } from "@/components/PackageManager";
import { PerformancePanel } from "@/components/performance/PerformancePanel";
import { ToastBar } from "@/components/ToastBar";
import { ToolWorkbench } from "@/components/ToolWorkbench";
import { UpdateChecker } from "@/components/UpdateChecker";
import { SettingsDialog } from "@/components/settings/SettingsDialog";
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
          <ToolWorkbench
            active={activePane === "tools"}
            activityRefreshing={activityRefreshing}
            onRefreshActivity={refreshCurrentActivity}
          />
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
