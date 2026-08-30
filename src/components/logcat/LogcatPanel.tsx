import { AlertTriangle } from "lucide-react";
import { useLogcatPackageResolution } from "@/hooks/useLogcatPackageResolution";
import { useLogcatStream } from "@/hooks/useLogcatStream";
import { useDeviceStore } from "@/store/device";
import { useLogcatStore } from "@/store/logcat";
import { LogcatList } from "@/components/logcat/LogcatList";
import { LogcatToolbar } from "@/components/logcat/LogcatToolbar";

interface LogcatPanelProps {
  visible: boolean;
}

export function LogcatPanel({ visible }: LogcatPanelProps) {
  const selectedDevice = useDeviceStore((state) => state.selectedDevice);
  const storedSerial = useLogcatStore((state) => state.serial);
  const totalCount = useLogcatStore((state) => state.totalCount);
  const streamState = useLogcatStore((state) => state.streamState);
  const disconnectDetail = useLogcatStore((state) => state.disconnectDetail);
  const restart = useLogcatStore((state) => state.restart);

  useLogcatStream();
  const packageResolution = useLogcatPackageResolution();

  const hasRetainedLogcat =
    storedSerial !== null || totalCount > 0 || streamState === "disconnected";
  if (!selectedDevice && !hasRetainedLogcat) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请先连接设备以查看 Logcat
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <LogcatToolbar
        visible={visible}
        serial={selectedDevice}
        exportSerial={storedSerial ?? selectedDevice}
        packageResolution={packageResolution}
      />
      {streamState === "disconnected" && (
        <div className="flex min-h-7 items-center gap-2 border-b border-destructive/30 bg-destructive/10 px-4 py-1 text-xs text-destructive">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={disconnectDetail || "日志流已断开"}>
            {disconnectDetail ? `日志流已断开: ${disconnectDetail}` : "日志流已断开"}
          </span>
          <button
            type="button"
            onClick={restart}
            disabled={!selectedDevice}
            className="shrink-0 rounded px-2 py-0.5 font-medium transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50"
          >
            重连
          </button>
        </div>
      )}
      <LogcatList
        visible={visible}
        loading={streamState === "starting" && totalCount === 0}
      />
    </div>
  );
}
