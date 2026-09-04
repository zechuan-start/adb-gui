import { useMemo, useState } from "react";
import { ArrowDownUp } from "lucide-react";
import { formatMemory, formatPercent } from "@/lib/deviceMetrics";
import { cn } from "@/lib/utils";
import { useDeviceStore } from "@/store/device";
import { useDeviceMetricsStore } from "@/store/deviceMetrics";
import { useLogcatStore } from "@/store/logcat";

type SortMode = "cpu" | "memory";

export function ProcessTable() {
  const [sortMode, setSortMode] = useState<SortMode>("cpu");
  const processes = useDeviceMetricsStore((state) => state.processes);
  const processMap = useLogcatStore((state) => state.processMap);
  const currentPackage = useDeviceStore((state) => state.currentPackage);
  const rows = useMemo(() => {
    if (processes === null) {
      return null;
    }
    return Array.from(processes).sort((left, right) =>
      sortMode === "cpu"
        ? right.cpu_percent - left.cpu_percent || right.rss_kb - left.rss_kb
        : right.rss_kb - left.rss_kb || right.cpu_percent - left.cpu_percent,
    );
  }, [processes, sortMode]);

  return (
    <section className="flex min-h-[250px] flex-col border border-rule bg-surface">
      <div className="flex min-h-10 flex-wrap items-center gap-2 border-b border-dashed border-rule px-3 py-1.5">
        <div>
          <h3 className="text-xs font-semibold text-ink">进程占用</h3>
          <p className="font-data text-[10px] text-ink3">TOP CPU + TOP RSS</p>
        </div>
        <div className="ml-auto flex border border-rule" role="group" aria-label="进程排序">
          {(["cpu", "memory"] as const).map((mode) => (
            <button
              key={mode}
              type="button"
              onClick={() => setSortMode(mode)}
              aria-pressed={sortMode === mode}
              className={cn(
                "flex h-7 items-center gap-1 border-r border-rule px-2.5 font-data text-[10px] text-ink2 last:border-r-0 hover:bg-hover",
                sortMode === mode && "bg-ink text-onink hover:bg-ink",
              )}
            >
              <ArrowDownUp className="h-3 w-3" aria-hidden="true" />
              {mode === "cpu" ? "CPU" : "内存"}
            </button>
          ))}
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-auto">
        {rows === null ? (
          <div className="flex min-h-40 items-center justify-center font-data text-xs text-ink3">
            等待进程快照
          </div>
        ) : rows.length === 0 ? (
          <div className="flex min-h-40 items-center justify-center font-data text-xs text-ink3">
            当前设备未提供进程统计
          </div>
        ) : (
          <table className="w-full table-fixed border-collapse text-left">
            <thead className="sticky top-0 z-10 bg-paper font-data text-[10px] uppercase text-ink3">
              <tr className="border-b border-rule">
                <th className="w-[68px] px-3 py-2 font-medium">PID</th>
                <th className="px-2 py-2 font-medium">进程</th>
                <th className="w-[92px] px-2 py-2 text-right font-medium">CPU</th>
                <th className="w-[110px] px-3 py-2 text-right font-medium">RSS</th>
              </tr>
            </thead>
            <tbody className="font-data text-[11px] text-ink2">
              {rows.map((process) => {
                const name = processMap.get(process.pid) ?? process.comm;
                const foreground =
                  currentPackage !== "" &&
                  (name === currentPackage || name.startsWith(`${currentPackage}:`));
                return (
                  <tr
                    key={process.pid}
                    className={cn(
                      "border-b border-rule2 last:border-b-0",
                      foreground ? "bg-warn-band text-ink" : "hover:bg-hover",
                    )}
                  >
                    <td className="px-3 py-1.5 text-ink3">{process.pid}</td>
                    <td className="truncate px-2 py-1.5" title={name}>
                      {name}
                      {process.is_new ? <span className="ml-2 text-[9px] text-note">NEW</span> : null}
                    </td>
                    <td className="px-2 py-1.5 text-right text-ink">{formatPercent(process.cpu_percent)}</td>
                    <td className="px-3 py-1.5 text-right text-ink">{formatMemory(process.rss_kb)}</td>
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
