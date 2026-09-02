import { AlertTriangle } from "lucide-react";
import { useLogcatPackageResolution } from "@/hooks/useLogcatPackageResolution";
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

  const packageResolution = useLogcatPackageResolution();

  const hasRetainedLogcat =
    storedSerial !== null || totalCount > 0 || streamState === "disconnected";
  const waitingForDevice = !selectedDevice && !hasRetainedLogcat;

  return (
    <div className="flex h-full min-h-0 flex-col bg-log-bg">
      <LogcatToolbar
        visible={visible}
        serial={selectedDevice}
        exportSerial={storedSerial ?? selectedDevice}
        packageResolution={packageResolution}
      />
      {streamState === "disconnected" && (
        <div className="flex min-h-7 shrink-0 items-center gap-2 border-b border-err/40 bg-log-bg px-3 py-1 font-data text-[11px] text-err">
          <AlertTriangle className="h-3.5 w-3.5 shrink-0" />
          <span className="min-w-0 flex-1 truncate" title={disconnectDetail || "日志流已断开"}>
            {disconnectDetail
              ? `日志流已断开: ${disconnectDetail}. 下方保留断开前日志`
              : "日志流已断开. 下方保留断开前日志"}
          </span>
          <button
            type="button"
            onClick={restart}
            disabled={!selectedDevice}
            className="h-5 shrink-0 border border-err/40 px-2 font-medium hover:bg-err-band disabled:cursor-not-allowed disabled:opacity-50"
          >
            重连
          </button>
        </div>
      )}
      {waitingForDevice ? (
        <div className="flex min-h-0 flex-1 items-center justify-center bg-log-bg font-data text-xs text-log-dim">
          请先连接设备以查看 Logcat
        </div>
      ) : (
        <LogcatList
          visible={visible}
          loading={streamState === "starting" && totalCount === 0}
        />
      )}
    </div>
  );
}
