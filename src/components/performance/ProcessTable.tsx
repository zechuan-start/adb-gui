import { useMemo, useState } from "react";
import { ArrowDown, ArrowDownUp } from "lucide-react";
import { formatMemory, formatPercent } from "@/lib/deviceMetrics";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";
import { useLogcatStore } from "@/store/logcat";

type SortMode = "cpu" | "memory";

const CPU_COLUMN_HINT = "占整机总算力 · 每 5 秒重算";
const BAR_MIN_VISIBLE_PERCENT = 6;

export function ProcessTable() {
  const [sortMode, setSortMode] = useState<SortMode>("cpu");
  const processes = useDeviceMetricsStore((state) => state.processes);
  const processMap = useLogcatStore((state) => state.processMap);
  const currentPackage = useDeviceStore((state) => state.currentPackage);
  const table = useMemo(() => {
    if (processes === null) {
      return null;
    }
    const rows = Array.from(processes).sort((left, right) =>
      sortMode === "cpu"
        ? right.cpu_percent - left.cpu_percent || right.rss_kb - left.rss_kb
        : right.rss_kb - left.rss_kb || right.cpu_percent - left.cpu_percent,
    );
    // Bars are scaled against the visible maximum, not against 100%, otherwise an
    // idle device renders a table of invisible slivers.
    let maxCpu = 0;
    let maxRss = 0;
    for (const process of rows) {
      maxCpu = Math.max(maxCpu, process.cpu_percent);
      maxRss = Math.max(maxRss, process.rss_kb);
    }
    return { rows, maxCpu, maxRss };
  }, [processes, sortMode]);

  function barWidth(value: number, max: number): string {
    if (!Number.isFinite(value) || value <= 0 || max <= 0) {
      return "0%";
    }
    const ratio = Math.min(100, (value / max) * 100);
    // Below this the bar is a 1-2px shard next to the number and reads as a
    // rendering artefact rather than as data.
    return ratio < BAR_MIN_VISIBLE_PERCENT ? "0%" : `${ratio.toFixed(1)}%`;
  }

  return (
    // flex-1 takes the leftover height on tall windows; min-h keeps the table
    // usable on short ones, where the panel wrapper scrolls instead.
    <section className="flex min-h-[220px] flex-1 flex-col border border-rule bg-surface">
      <div className="flex min-h-10 shrink-0 flex-wrap items-center gap-2 border-b border-dashed border-rule px-3 py-1.5">
        <div>
          <h3 className="text-xs font-semibold text-ink">进程占用</h3>
          <p className="font-data text-[10px] text-ink3">TOP CPU + TOP RSS · 每 5 秒</p>
        </div>
        <span className="ml-auto font-data text-[10px] text-ink3">
          {table === null ? "--" : `${table.rows.length} 项`}
        </span>
        <div className="flex border border-rule" role="group" aria-label="进程排序">
          {(["cpu", "memory"] as const).map((mode) => {
            const selected = sortMode === mode;
            const Icon = selected ? ArrowDown : ArrowDownUp;
            return (
              <button
                key={mode}
                type="button"
                onClick={() => setSortMode(mode)}
                aria-pressed={selected}
                className={cn(
                  "flex h-7 items-center gap-1 border-r border-rule px-2.5 font-data text-[10px] text-ink2 last:border-r-0 hover:bg-hover",
                  selected && "bg-ink text-onink hover:bg-ink",
                )}
              >
                <Icon className="h-3 w-3" aria-hidden="true" />
                {mode === "cpu" ? "CPU" : "内存"}
              </button>
            );
          })}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {table === null ? (
          <div className="flex min-h-40 items-center justify-center font-data text-xs text-ink3">
            等待进程快照
          </div>
        ) : table.rows.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center font-data text-xs text-ink3">
            当前设备未提供进程统计
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-paper font-data text-[10px] uppercase text-ink3">
              <tr className="border-b border-rule">
                <th className="w-[60px] px-3 py-2 font-medium">PID</th>
                <th className="px-2 py-2 font-medium">进程</th>
                <th
                  className="w-[92px] px-2 py-2 text-right font-medium"
                  title={CPU_COLUMN_HINT}
                >
                  CPU
                </th>
                <th className="w-[110px] px-3 py-2 text-right font-medium">RSS</th>
              </tr>
            </thead>
            <tbody className="font-data text-[11px] text-ink2">
              {table.rows.map((process) => {
                const name = processMap.get(process.pid) ?? process.comm;
                const foreground =
                  currentPackage !== "" &&
                  (name === currentPackage || name.startsWith(`${currentPackage}:`));
                return (
                  <tr
                    key={process.pid}
                    className={cn(
                      "border-b border-rule2 last:border-b-0",
                      foreground
                        ? "bg-note/10 font-medium text-ink"
                        : "hover:bg-hover",
                    )}
                  >
                    <td className="px-3 py-1.5 text-ink3">{process.pid}</td>
                    <td className="truncate px-2 py-1.5" title={name}>
                      {name}
                      {process.is_new ? <span className="ml-2 text-[9px] text-note">NEW</span> : null}
                    </td>
                    <td className="relative px-2 py-1.5 text-right text-ink" title={CPU_COLUMN_HINT}>
                      <span
                        className="absolute inset-y-[3px] right-0 bg-note/25"
                        style={{ width: barWidth(process.cpu_percent, table.maxCpu) }}
                        aria-hidden="true"
                      />
                      <span className="relative">{formatPercent(process.cpu_percent)}</span>
                    </td>
                    <td className="relative px-3 py-1.5 text-right text-ink">
                      <span
                        className="absolute inset-y-[3px] right-0 bg-ok/20"
                        style={{ width: barWidth(process.rss_kb, table.maxRss) }}
                        aria-hidden="true"
                      />
                      <span className="relative">{formatMemory(process.rss_kb)}</span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>
    </section>
  );
}
