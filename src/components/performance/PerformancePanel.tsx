import { useMemo, type ReactNode } from "react";
import { Activity, Battery, Cpu, MemoryStick, RefreshCw } from "lucide-react";
import { MetricChart } from "@/components/performance/MetricChart";
import { ProcessTable } from "@/components/performance/ProcessTable";
import { useDeviceMetricsSession } from "@/hooks/useDeviceMetricsSession";
import {
  formatMemory,
  formatPercent,
  formatTemperature,
} from "@/lib/deviceMetrics";
import { cn } from "@/lib/utils";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";

interface PerformancePanelProps {
  active: boolean;
}

interface MetricSummaryProps {
  icon: ReactNode;
  label: string;
  value: string;
  detail: string;
}

function MetricSummary({ icon, label, value, detail }: MetricSummaryProps) {
  return (
    <div className="min-w-0 border border-rule bg-surface px-3 py-2.5">
      <div className="flex items-center gap-2 text-ink3">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="font-data text-[10px] uppercase">{label}</span>
      </div>
      <strong className="mt-2 block truncate font-data text-xl font-medium text-ink">{value}</strong>
      <span className="mt-1 block truncate font-data text-[10px] text-ink3">{detail}</span>
    </div>
  );
}

export function PerformancePanel({ active }: PerformancePanelProps) {
  useDeviceMetricsSession(active);
  const streamState = useDeviceMetricsStore((state) => state.streamState);
  const error = useDeviceMetricsStore((state) => state.error);
  const history = useDeviceMetricsStore((state) => state.history);
  const revision = useDeviceMetricsStore((state) => state.revision);
  const latestFrame = useDeviceMetricsStore((state) => state.latestFrame);
  const battery = useDeviceMetricsStore((state) => state.battery);
  const backgroundEnabled = useDeviceMetricsStore((state) => state.backgroundEnabled);
  const setBackgroundEnabled = useDeviceMetricsStore((state) => state.setBackgroundEnabled);
  const restart = useDeviceMetricsStore((state) => state.restart);
  const samples = useMemo(() => history.toArray(), [history, revision]);
  const statusLabel = {
    idle: "未连接",
    starting: "启动中",
    streaming: "采集中",
    stopped: "已暂停",
    error: "已中断",
  }[streamState];

  return (
    <div className="h-full min-h-0 overflow-y-auto px-[18px] pb-6 pt-4">
      <div className="mx-auto flex w-full max-w-[1280px] flex-col gap-3.5">
        <header className="flex min-h-10 flex-wrap items-center gap-3 border-b border-rule pb-3">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-note" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-ink">设备性能</h2>
              <p className="font-data text-[10px] text-ink3">CPU / MEMORY / PROCESS</p>
            </div>
          </div>
          <span
            className={cn(
              "border border-rule px-2 py-1 font-data text-[10px] text-ink3",
              streamState === "streaming" && "border-ok text-ok",
              streamState === "error" && "border-err text-err",
            )}
          >
            {statusLabel}
          </span>
          <label className="ml-auto flex cursor-pointer items-center gap-2 font-data text-[10px] text-ink2">
            <input
              type="checkbox"
              checked={backgroundEnabled}
              onChange={(event) => setBackgroundEnabled(event.target.checked)}
              className="h-3.5 w-3.5 accent-ink"
            />
            切换面板时继续采集
          </label>
          {streamState === "error" ? (
            <button
              type="button"
              onClick={restart}
              className="flex h-7 w-7 items-center justify-center border border-rule text-ink2 hover:bg-hover hover:text-ink"
              title="重新采集"
              aria-label="重新采集"
            >
              <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
            </button>
          ) : null}
        </header>

        {error ? (
          <div role="alert" className="border border-err bg-err-band px-3 py-2 font-data text-xs text-err">
            {error}
          </div>
        ) : null}

        <div className="grid grid-cols-2 gap-2.5 lg:grid-cols-4">
          <MetricSummary
            icon={<Cpu />}
            label="整机 CPU"
            value={formatPercent(latestFrame?.cpu?.total_percent ?? null)}
            detail={`${latestFrame?.cpu?.core_count ?? "--"} 核心`}
          />
          <MetricSummary
            icon={<MemoryStick />}
            label="已用内存"
            value={formatMemory(latestFrame?.memory.used_kb ?? null)}
            detail={`总计 ${formatMemory(latestFrame?.memory.total_kb ?? null)}`}
          />
          <MetricSummary
            icon={<MemoryStick />}
            label="可用内存"
            value={formatMemory(latestFrame?.memory.available_kb ?? null)}
            detail={
              latestFrame
                ? formatPercent(
                    (latestFrame.memory.available_kb * 100) / latestFrame.memory.total_kb,
                  )
                : "--"
            }
          />
          <MetricSummary
            icon={<Battery />}
            label="电池"
            value={battery?.level ? `${battery.level}%` : "--"}
            detail={`${battery?.status || "--"} / ${formatTemperature(battery?.temperature_c ?? null)}`}
          />
        </div>

        <div className="grid min-w-0 grid-cols-1 gap-3.5 lg:grid-cols-2">
          <MetricChart title="CPU 使用率" metric="cpu" samples={samples} revision={revision} />
          <MetricChart title="内存使用率" metric="memory" samples={samples} revision={revision} />
        </div>

        <ProcessTable />
      </div>
    </div>
  );
}
