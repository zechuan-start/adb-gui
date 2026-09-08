import { useT } from "@/i18n";
import { errorText, toAppError } from "@/i18n/errors";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { listPackages } from "@/lib/tauri";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import { useLogcatStore } from "@/store/logcat";

export interface LogcatPackageResolutionState {
  packageOptions: string[];
  processOptions: string[];
  loadingPackages: boolean;
  loadPackageOptions: () => Promise<void>;
  packageStatus: string;
  currentPackage: string;
}

export function useLogcatPackageResolution(): LogcatPackageResolutionState {
  const t = useT();
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const currentPackage = useDeviceStore((state) => state.currentPackage);
  const showToast = useFeedbackStore((state) => state.showToast);
  const packageRefs = useLogcatStore((state) => state.packageRefs);
  const processRefs = useLogcatStore((state) => state.processRefs);
  const processMap = useLogcatStore((state) => state.processMap);
  const processMapUpdatedAt = useLogcatStore((state) => state.processMapUpdatedAt);
  const processMapLoading = useLogcatStore((state) => state.processMapLoading);
  const processMapError = useLogcatStore((state) => state.processMapError);
  const [packageOptions, setPackageOptions] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const packagesLoadedForRef = useRef<string | null>(null);
  const packageListRequestRef = useRef(0);
  const packageListInFlightRef = useRef(false);

  useEffect(() => {
    useLogcatStore.getState().setCurrentPackage(currentPackage);
  }, [currentPackage]);

  useEffect(() => {
    packageListRequestRef.current += 1;
    packageListInFlightRef.current = false;
    packagesLoadedForRef.current = null;
    setPackageOptions([]);
    setLoadingPackages(false);
  }, [selectedDevice]);

  const loadPackageOptions = useCallback(async () => {
    if (
      !selectedDevice ||
      packageListInFlightRef.current ||
      packagesLoadedForRef.current === selectedDevice
    ) {
      return;
    }
    const request = packageListRequestRef.current + 1;
    packageListRequestRef.current = request;
    packageListInFlightRef.current = true;
    setLoadingPackages(true);
    try {
      const packages = await listPackages(selectedDevice);
      if (
        packageListRequestRef.current !== request ||
        useDeviceStore.getState().selectedDevice !== selectedDevice
      ) {
        return;
      }
      setPackageOptions([...packages].sort());
      packagesLoadedForRef.current = selectedDevice;
    } catch (error) {
      if (
        packageListRequestRef.current === request &&
        useDeviceStore.getState().selectedDevice === selectedDevice
      ) {
        showToast("error", { code: "logcat_packages", causes: [toAppError(error)] });
      }
    } finally {
      if (packageListRequestRef.current === request) {
        packageListInFlightRef.current = false;
        setLoadingPackages(false);
      }
    }
  }, [selectedDevice, showToast]);

  const processOptions = useMemo(
    () => Array.from(new Set(processMap.values())).filter(Boolean).sort(),
    [processMap],
  );

  const packageStatus = useMemo(() => {
    if (packageRefs.length === 0 && processRefs.length === 0) {
      return "";
    }
    if (!selectedDevice) {
      return t.logcat.unavailable;
    }
    if (packageRefs.includes("mine") && !currentPackage) {
      return t.logcat.noForeground;
    }
    if (processMapUpdatedAt === 0 && processMapLoading) {
      return t.logcat.loadingProcesses;
    }
    if (processMapUpdatedAt === 0 && processMapError) {
      return errorText(processMapError, t);
    }
    return "";
  }, [t, currentPackage, packageRefs, processMapError, processMapLoading, processMapUpdatedAt, processRefs, selectedDevice]);

  return {
    packageOptions,
    processOptions,
    loadingPackages,
    loadPackageOptions,
    packageStatus,
    currentPackage,
  };
}
