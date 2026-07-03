import { useEffect, useMemo, useRef, useState } from "react";
import { Download, ListFilter, Pause, Play, Search, Trash2 } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeviceStore } from "@/store/device";
import { useFeedbackStore } from "@/store/feedback";
import {
  clearLogcat,
  exportLogcat,
  getPackagePids,
  listPackages,
  onLogcatLine,
  startLogcat,
  stopLogcat,
} from "@/lib/tauri";
import type { LogcatLine } from "@/lib/tauri";
import { cn } from "@/lib/utils";

const MAX_LINES = 5000;
const LEVELS = ["V", "D", "I", "W", "E", "F"] as const;
type Level = (typeof LEVELS)[number];

const LEVEL_COLORS: Record<Level, string> = {
  V: "text-slate-400",
  D: "text-gray-400",
  I: "text-blue-400",
  W: "text-amber-400",
  E: "text-red-400",
  F: "text-red-500 font-bold",
};

const APP_FILTER_OFF = "off";
const APP_FILTER_AUTO = "auto";
const PACKAGE_FILTER_PREFIX = "pkg:";
type AppFilterValue =
  | typeof APP_FILTER_OFF
  | typeof APP_FILTER_AUTO
  | `${typeof PACKAGE_FILTER_PREFIX}${string}`;

interface LogcatEntry extends LogcatLine {
  id: number;
}

function appendLogEntries(prev: LogcatEntry[], entries: LogcatEntry[]): LogcatEntry[] {
  if (entries.length === 0) {
    return prev;
  }
  const combined = [...prev, ...entries];
  return combined.length > MAX_LINES ? combined.slice(-MAX_LINES) : combined;
}

export function LogcatPanel() {
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const currentPackage = useDeviceStore((s) => s.currentPackage);
  const showToast = useFeedbackStore((s) => s.showToast);
  const [lines, setLines] = useState<LogcatEntry[]>([]);
  const [paused, setPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState<Level | "">("");
  const [searchText, setSearchText] = useState("");
  const [appFilter, setAppFilter] = useState<AppFilterValue>(APP_FILTER_OFF);
  const [packageOptions, setPackageOptions] = useState<string[]>([]);
  const [loadingPackages, setLoadingPackages] = useState(false);
  const [packagesLoadedFor, setPackagesLoadedFor] = useState<string | null>(null);
  const [appPids, setAppPids] = useState<string[]>([]);
  const [pidLoading, setPidLoading] = useState(false);
  const [pidStatus, setPidStatus] = useState("");
  const [active, setActive] = useState(false);
  const [following, setFollowing] = useState(true);
  const [pendingCount, setPendingCount] = useState(0);
  const pausedRef = useRef(paused);
  const bufferRef = useRef<LogcatEntry[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);
  const programmaticScrollRef = useRef(false);
  const lineIdRef = useRef(0);

  pausedRef.current = paused;

  const targetPackage = useMemo(() => {
    if (appFilter === APP_FILTER_AUTO) {
      return currentPackage;
    }
    if (appFilter.startsWith(PACKAGE_FILTER_PREFIX)) {
      return appFilter.slice(PACKAGE_FILTER_PREFIX.length);
    }
    return "";
  }, [appFilter, currentPackage]);

  const appPidSet = useMemo(() => new Set(appPids), [appPids]);
  const appFilterEnabled = appFilter !== APP_FILTER_OFF;

  const filtered = useMemo(() => {
    let result = lines;
    if (filterLevel) {
      const idx = LEVELS.indexOf(filterLevel);
      result = result.filter((l) => LEVELS.indexOf(l.level as Level) >= idx);
    }
    if (searchText) {
      const lower = searchText.toLowerCase();
      result = result.filter(
        (l) =>
          l.message.toLowerCase().includes(lower) ||
          l.tag.toLowerCase().includes(lower)
      );
    }
    if (appFilterEnabled) {
      result = result.filter((l) => appPidSet.has(l.pid));
    }
    return result;
  }, [appFilterEnabled, appPidSet, filterLevel, lines, searchText]);

  const filterSignature = useMemo(
    () =>
      [filterLevel, searchText, appFilter, appPids.join("\u0000")].join("\u0000"),
    [appFilter, appPids, filterLevel, searchText]
  );

  const lastFilteredLineId = filtered[filtered.length - 1]?.id ?? 0;

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    getItemKey: (index) => filtered[index]?.id ?? index,
    estimateSize: () => 20,
    overscan: 30,
  });

  useEffect(() => {
    const el = parentRef.current;
    if (!el) {
      return;
    }

    const frame = window.requestAnimationFrame(() => {
      const maxScrollTop = Math.max(0, el.scrollHeight - el.clientHeight);
      if (autoScrollRef.current && !paused) {
        programmaticScrollRef.current = true;
        el.scrollTop = el.scrollHeight;
        return;
      }
      if (el.scrollTop > maxScrollTop) {
        programmaticScrollRef.current = true;
        el.scrollTop = maxScrollTop;
      }
    });

    return () => window.cancelAnimationFrame(frame);
  }, [filterSignature, filtered.length, lastFilteredLineId, paused]);

  useEffect(() => {
    if (!selectedDevice) {
      setActive(false);
      return;
    }

    let unlisten: (() => void) | null = null;
    let mounted = true;
    let disposed = false;

    const logcatSerial = selectedDevice;

    // Register the event listener *before* starting logcat: the backend
    // starts emitting lines immediately (and with -T dumps thousands of
    // buffered lines within milliseconds), so starting the process first
    // can lose the entire initial burst if the listener isn't attached yet.
    onLogcatLine((line) => {
      if (disposed || line.serial !== logcatSerial) {
        return;
      }

      const entry = {
        ...line,
        id: lineIdRef.current,
      };
      lineIdRef.current += 1;

      // Explicit pause (via the pause button) freezes the list entirely so the
      // user can inspect a snapshot; new lines just queue up in the buffer.
      if (pausedRef.current) {
        bufferRef.current.push(entry);
        if (bufferRef.current.length > MAX_LINES) {
          bufferRef.current = bufferRef.current.slice(-MAX_LINES);
        }
        setPendingCount(bufferRef.current.length);
        return;
      }

      // Not paused: keep processing/appending lines live regardless of scroll
      // position. Scrolling away from the bottom should only stop the
      // viewport from auto-jumping to the newest line, not stop data flow.
      setLines((prev) => appendLogEntries(prev, [entry]));
      if (!autoScrollRef.current) {
        setPendingCount((count) => count + 1);
      }
    }).then((fn) => {
      if (disposed) {
        fn();
        return;
      }
      unlisten = fn;
      return startLogcat(selectedDevice).then(() => {
        if (mounted) setActive(true);
      });
    }).catch(console.error);

    return () => {
      mounted = false;
      disposed = true;
      unlisten?.();
      void stopLogcat();
      setActive(false);
    };
  }, [selectedDevice]);

  useEffect(() => {
    setAppFilter(APP_FILTER_OFF);
    setPackageOptions([]);
    setPackagesLoadedFor(null);
    setAppPids([]);
    setPidStatus("");
    setLines([]);
    bufferRef.current = [];
    setPendingCount(0);
    setAutoFollow(true);
    lineIdRef.current = 0;
  }, [selectedDevice]);

  useEffect(() => {
    let cancelled = false;

    async function refreshPackagePids() {
      if (!selectedDevice || !appFilterEnabled) {
        setAppPids([]);
        setPidStatus("");
        return;
      }

      if (!targetPackage) {
        setAppPids([]);
        setPidStatus(appFilter === APP_FILTER_AUTO ? "暂无前台应用" : "未选择应用");
        return;
      }

      setPidLoading(true);
      try {
        const pids = await getPackagePids(selectedDevice, targetPackage);
        if (cancelled) {
          return;
        }
        setAppPids(pids);
        setPidStatus(pids.length > 0 ? `PID ${pids.join(", ")}` : "未找到运行中的进程");
      } catch (error) {
        if (cancelled) {
          return;
        }
        setAppPids([]);
        setPidStatus("未找到运行中的进程");
      } finally {
        if (!cancelled) {
          setPidLoading(false);
        }
      }
    }

    void refreshPackagePids();

    if (!selectedDevice || !appFilterEnabled) {
      return () => {
        cancelled = true;
      };
    }

    const timer = window.setInterval(() => {
      void refreshPackagePids();
    }, 5000);

    return () => {
      cancelled = true;
      window.clearInterval(timer);
    };
  }, [appFilter, appFilterEnabled, selectedDevice, targetPackage]);

  async function loadPackageOptions() {
    if (!selectedDevice || loadingPackages || packagesLoadedFor === selectedDevice) {
      return;
    }

    setLoadingPackages(true);
    try {
      const packages = await listPackages(selectedDevice);
      setPackageOptions(packages);
      setPackagesLoadedFor(selectedDevice);
    } catch (error) {
      showToast("error", `加载应用列表失败: ${error}`);
    } finally {
      setLoadingPackages(false);
    }
  }

  function handlePauseToggle() {
    if (paused) {
      setPaused(false);
      flushBufferedLines();
      setAutoFollow(true);
      scrollToBottom();
      return;
    }

    if (!following) {
      // Data was never paused, only the viewport wasn't following -
      // the lines are already live, just resume tracking the bottom.
      setAutoFollow(true);
      setPendingCount(0);
      scrollToBottom();
      return;
    }

    setPaused(true);
  }

  async function handleClear() {
    setLines([]);
    bufferRef.current = [];
    setPendingCount(0);
    setAutoFollow(true);
    lineIdRef.current = 0;

    if (!selectedDevice) {
      return;
    }

    try {
      await clearLogcat(selectedDevice);
    } catch (error) {
      showToast("error", `清空设备日志缓冲区失败: ${error}`);
    }
  }

  async function handleExport() {
    if (!selectedDevice) {
      return;
    }

    if (filtered.length === 0) {
      showToast("error", "没有可导出的日志");
      return;
    }

    try {
      const content = filtered.map((line) => line.raw).join("\n");
      const result = await exportLogcat(selectedDevice, content);
      showToast("success", `日志已导出到 ${result.path}`);
    } catch (error) {
      showToast("error", `导出日志失败: ${error}`);
    }
  }

  function handleScroll() {
    if (!parentRef.current) return;
    if (programmaticScrollRef.current) {
      programmaticScrollRef.current = false;
      return;
    }
    const el = parentRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    setAutoFollow(atBottom);
    if (atBottom) {
      setPendingCount(0);
    }
  }

  function handleUserScrollIntent() {
    setAutoFollow(false);
  }

  function flushBufferedLines() {
    if (bufferRef.current.length === 0) {
      return;
    }

    setLines((prev) => {
      const combined = appendLogEntries(prev, bufferRef.current);
      bufferRef.current = [];
      setPendingCount(0);
      return combined;
    });
  }

  function scrollToBottom() {
    const el = parentRef.current;
    if (!el) {
      return;
    }

    window.requestAnimationFrame(() => {
      programmaticScrollRef.current = true;
      el.scrollTop = el.scrollHeight;
    });
  }

  function setAutoFollow(enabled: boolean) {
    autoScrollRef.current = enabled;
    setFollowing(enabled);
  }

  if (!selectedDevice) {
    return (
      <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
        请先连接设备以查看 Logcat
      </div>
    );
  }

  return (
    <div className="flex h-full flex-col">
      <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
        <div className="flex items-center gap-1">
          {LEVELS.map((level) => (
            <button
              key={level}
              type="button"
              onClick={() => setFilterLevel(filterLevel === level ? "" : level)}
              className={cn(
                "rounded px-2 py-0.5 text-xs font-mono transition-colors",
                filterLevel === level
                  ? "bg-primary text-primary-foreground"
                  : "bg-secondary text-muted-foreground hover:text-foreground"
              )}
            >
              {level}
            </button>
          ))}
        </div>

        <div className="relative min-w-[220px]">
          <ListFilter className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <select
            value={appFilter}
            onChange={(event) => setAppFilter(event.target.value as AppFilterValue)}
            onFocus={() => void loadPackageOptions()}
            className="h-7 w-full min-w-[220px] appearance-none rounded-md border border-border bg-secondary py-1 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          >
            <option value={APP_FILTER_OFF}>全部应用</option>
            <option value={APP_FILTER_AUTO}>
              {currentPackage ? `当前前台应用 (${currentPackage})` : "当前前台应用"}
            </option>
            {loadingPackages && <option disabled>加载应用列表中...</option>}
            {packageOptions.map((pkg) => (
              <option key={pkg} value={`${PACKAGE_FILTER_PREFIX}${pkg}`}>
                {pkg}
              </option>
            ))}
          </select>
        </div>

        <div className="relative min-w-[220px] flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索 tag 或 message..."
            autoComplete="off"
            autoCorrect="off"
            autoCapitalize="off"
            spellCheck={false}
            className="w-full rounded-md border border-border bg-secondary py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="button"
          onClick={handlePauseToggle}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            paused || !following
              ? "bg-amber-500/20 text-amber-400"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
          title={paused || !following ? "恢复跟随" : "暂停"}
        >
          {paused || !following ? (
            <Play className="h-3.5 w-3.5" />
          ) : (
            <Pause className="h-3.5 w-3.5" />
          )}
        </button>

        <button
          type="button"
          onClick={() => void handleExport()}
          disabled={filtered.length === 0}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50"
          title="导出当前日志"
        >
          <Download className="h-3.5 w-3.5" />
        </button>

        <button
          type="button"
          onClick={() => void handleClear()}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          title="清屏"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <div className="ml-auto whitespace-nowrap text-xs text-muted-foreground">
          {filtered.length}/{lines.length}
          {active && <span className="ml-1 text-emerald-400">●</span>}
          {paused && <span className="ml-1 text-amber-400">(暂停)</span>}
          {!paused && !following && pendingCount > 0 && (
            <span className="ml-1 text-amber-400">(+{pendingCount})</span>
          )}
          {appFilterEnabled && (
            <span className="ml-2 text-muted-foreground">
              {pidLoading ? "解析 PID..." : pidStatus}
            </span>
          )}
        </div>
      </div>

      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs"
        onScroll={handleScroll}
        onWheel={handleUserScrollIntent}
        onTouchMove={handleUserScrollIntent}
      >
        <div
          style={{ height: `${virtualizer.getTotalSize()}px`, position: "relative" }}
        >
          {virtualizer.getVirtualItems().map((virtualItem) => {
            const line = filtered[virtualItem.index];
            if (!line) return null;
            const levelColor = LEVEL_COLORS[(line.level as Level)] || "text-foreground";
            return (
              <div
                key={virtualItem.key}
                data-index={virtualItem.index}
                style={{
                  position: "absolute",
                  top: 0,
                  left: 0,
                  width: "100%",
                  height: `${virtualItem.size}px`,
                  transform: `translateY(${virtualItem.start}px)`,
                }}
                className="flex items-center gap-2 px-4 hover:bg-secondary/40"
              >
                <span className={cn("w-3 shrink-0 select-none text-center", levelColor)}>
                  {line.level}
                </span>
                <span
                  className="w-14 shrink-0 select-none truncate text-muted-foreground"
                  title={line.tag}
                >
                  {line.tag}
                </span>
                <span
                  className="w-12 shrink-0 select-none text-muted-foreground"
                  title={line.pid}
                >
                  {line.pid}
                </span>
                <span
                  className={cn(
                    "min-w-0 flex-1 select-text overflow-hidden text-ellipsis whitespace-pre",
                    levelColor
                  )}
                  title={line.message}
                >
                  {line.message}
                </span>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
