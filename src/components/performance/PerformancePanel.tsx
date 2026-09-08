import { batteryStatusLabel } from "@/lib/device";
import { errorText } from "@/i18n/errors";
import { useT } from "@/i18n";
import { useMemo, type ReactNode } from "react";
import { Activity, Battery, Settings, Cpu, MemoryStick, Pause, Play, RefreshCw } from "lucide-react";
import { MetricChart } from "@/components/performance/MetricChart";
import { ProcessTable } from "@/components/performance/ProcessTable";
import { useDeviceMetricsSession } from "@/hooks/useDeviceMetricsSession";
import {
  formatMemory,
  formatMemoryParts,
  formatPercent,
  formatPercentParts,
  formatTemperature,
  type FormattedValue,
} from "@/lib/deviceMetrics";
import { cn } from "@/lib/utils";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";
import { useUiStore } from "@/store/ui";

interface PerformancePanelProps {
  active: boolean;
}

interface MetricSummaryProps {
  icon: ReactNode;
  label: string;
  value: FormattedValue;
  detail: string;
}

function MetricSummary({ icon, label, value, detail }: MetricSummaryProps) {
  return (
    <div className="min-w-0 border border-rule bg-surface2 px-3 py-2.5">
      <div className="flex items-center gap-2 text-ink3">
        <span className="[&>svg]:h-3.5 [&>svg]:w-3.5">{icon}</span>
        <span className="font-data text-[10px] uppercase">{label}</span>
      </div>
      <strong className="mt-2 flex min-w-0 items-baseline gap-1 font-data text-xl font-medium text-ink">
        <span className="truncate">{value.value}</span>
        {value.unit ? (
          <span className="shrink-0 text-[11px] font-normal text-ink3">{value.unit}</span>
        ) : null}
      </strong>
      <span className="mt-1 block truncate font-data text-[10px] text-ink3">{detail}</span>
    </div>
  );
}

export function PerformancePanel({ active }: PerformancePanelProps) {
  const t = useT();
  useDeviceMetricsSession(active);
  const streamState = useDeviceMetricsStore((state) => state.streamState);
  const error = useDeviceMetricsStore((state) => state.error);
  const history = useDeviceMetricsStore((state) => state.history);
  const revision = useDeviceMetricsStore((state) => state.revision);
  const latestFrame = useDeviceMetricsStore((state) => state.latestFrame);
  const battery = useDeviceMetricsStore((state) => state.battery);
  const openSettings = useUiStore((state) => state.openSettings);
  const paused = useDeviceMetricsStore((state) => state.paused);
  const setPaused = useDeviceMetricsStore((state) => state.setPaused);
  const restart = useDeviceMetricsStore((state) => state.restart);
  const samples = useMemo(() => history.toArray(), [history, revision]);
  const statusLabel = paused
    ? t.performance.paused
    : t.performance.statuses[streamState];
  const batteryLabel = battery
    ? [
        battery.level ? `${battery.level}%` : "--",
        batteryStatusLabel(battery.status, t),
        formatTemperature(battery.temperature_c ?? null),
      ]
        .filter((part) => part && part !== "--")
        .join(" · ")
    : "--";

  return (
    <div className="flex h-full min-h-0 flex-col overflow-y-auto px-[18px] pb-4 pt-4">
      <div className="mx-auto flex min-h-0 w-full max-w-[1280px] flex-1 flex-col gap-3">
        <header className="flex min-h-10 shrink-0 flex-wrap items-center gap-3 border-b border-rule pb-3">
          <div className="flex items-center gap-2.5">
            <Activity className="h-4 w-4 text-ink3" aria-hidden="true" />
            <div>
              <h2 className="text-sm font-semibold text-ink">{t.performance.title}</h2>
              <p className="font-data text-[10px] text-ink3">{t.performance.subtitle}</p>
            </div>
          </div>
          <span
            className={cn(
              "border border-rule px-2 py-1 font-data text-[10px] text-ink3",
              !paused && streamState === "streaming" && "border-ok text-ok",
              !paused && streamState === "error" && "border-err text-err",
            )}
          >
            {statusLabel}
          </span>
          <div className="ml-auto flex flex-wrap items-center gap-2">
            <span className="flex items-center gap-1.5 font-data text-[10px] text-ink2">
              <Battery className="h-3.5 w-3.5 text-ink3" aria-hidden="true" />
              {t.performance.battery({ value: batteryLabel })}
            </span>
            <button
              type="button"
              onClick={() => openSettings("general")}
              aria-label={t.performance.settings}
              title={t.performance.settings}
              className="inline-flex h-7 w-7 items-center justify-center border border-rule text-ink2 hover:bg-hover hover:text-ink"
            >
              <Settings className="h-3.5 w-3.5" />
            </button>
            <button
              type="button"
              onClick={() => setPaused(!paused)}
              className="inline-flex h-7 items-center gap-1.5 border border-rule px-2 font-data text-[10px] text-ink2 hover:border-ink3 hover:bg-hover hover:text-ink"
            >
              {paused ? (
                <Play className="h-3 w-3" aria-hidden="true" />
              ) : (
                <Pause className="h-3 w-3" aria-hidden="true" />
              )}
              {paused ? t.performance.resume : t.performance.pause}
            </button>
            {streamState === "error" ? (
              <button
                type="button"
                onClick={restart}
                className="flex h-7 w-7 items-center justify-center border border-rule text-ink2 hover:bg-hover hover:text-ink"
                title={t.performance.restart}
                aria-label={t.performance.restart}
              >
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            ) : null}
          </div>
        </header>

        {error ? (
          <div
            role="alert"
            className="shrink-0 border border-err bg-err-band px-3 py-2 font-data text-xs text-err"
          >
            {errorText(error, t)}
          </div>
        ) : null}

        <div className="grid shrink-0 grid-cols-1 gap-2.5 sm:grid-cols-3">
          <MetricSummary
            icon={<Cpu />}
            label={t.performance.totalCpu}
            value={formatPercentParts(latestFrame?.cpu?.total_percent ?? null)}
            detail={t.performance.cores({ count: latestFrame?.cpu?.core_count ?? "--" })}
          />
          <MetricSummary
            icon={<MemoryStick />}
            label={t.performance.usedMemory}
            value={formatMemoryParts(latestFrame?.memory.used_kb ?? null)}
            detail={
              latestFrame
                ? t.performance.usedTotal({ percent: formatPercent((latestFrame.memory.used_kb * 100) / latestFrame.memory.total_kb), total: formatMemory(latestFrame.memory.total_kb) })
                : "--"
            }
          />
          <MetricSummary
            icon={<MemoryStick />}
            label={t.performance.availableMemory}
            value={formatMemoryParts(latestFrame?.memory.available_kb ?? null)}
            detail={
              latestFrame
                ? t.performance.percentage({ value: formatPercent((latestFrame.memory.available_kb * 100) / latestFrame.memory.total_kb) })
                : "--"
            }
          />
        </div>

        <div className="grid min-w-0 shrink-0 grid-cols-1 gap-3 lg:grid-cols-2">
          <MetricChart title={t.performance.cpuUsage} metric="cpu" samples={samples} revision={revision} />
          <MetricChart title={t.performance.usedMemory} metric="memory" samples={samples} revision={revision} />
        </div>

        <ProcessTable />
      </div>
    </div>
  );
}
