import { useEffect } from "react";
import { useLogcatStream } from "@/hooks/useLogcatStream";
import { useDeviceStore } from "@/store/device";
import { useLogcatStore } from "@/store/logcat";

export function LogcatRuntime() {
  const currentPackage = useDeviceStore((state) => state.currentPackage);
  useLogcatStream();

  useEffect(() => {
    useLogcatStore.getState().setCurrentPackage(currentPackage);
  }, [currentPackage]);

  return null;
}
