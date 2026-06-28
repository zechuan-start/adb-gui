import { useCallback, useEffect, useRef, useState } from "react";
import { Pause, Play, Trash2, Search } from "lucide-react";
import { useVirtualizer } from "@tanstack/react-virtual";
import { useDeviceStore } from "@/store/device";
import { startLogcat, stopLogcat, onLogcatLine } from "@/lib/tauri";
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

export function LogcatPanel() {
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const [lines, setLines] = useState<LogcatLine[]>([]);
  const [paused, setPaused] = useState(false);
  const [filterLevel, setFilterLevel] = useState<Level | "">("");
  const [searchText, setSearchText] = useState("");
  const [active, setActive] = useState(false);
  const pausedRef = useRef(paused);
  const bufferRef = useRef<LogcatLine[]>([]);
  const parentRef = useRef<HTMLDivElement>(null);
  const autoScrollRef = useRef(true);

  pausedRef.current = paused;

  const filteredLines = useCallback(() => {
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
    return result;
  }, [lines, filterLevel, searchText]);

  const filtered = filteredLines();

  const virtualizer = useVirtualizer({
    count: filtered.length,
    getScrollElement: () => parentRef.current,
    estimateSize: () => 20,
    overscan: 30,
  });

  useEffect(() => {
    if (autoScrollRef.current && !paused && parentRef.current) {
      const el = parentRef.current;
      el.scrollTop = el.scrollHeight;
    }
  }, [filtered.length, paused]);

  useEffect(() => {
    if (!selectedDevice) {
      setActive(false);
      return;
    }

    let unlisten: (() => void) | null = null;
    let mounted = true;

    startLogcat(selectedDevice)
      .then(() => {
        if (mounted) setActive(true);
      })
      .catch(console.error);

    onLogcatLine((line) => {
      if (pausedRef.current) {
        bufferRef.current.push(line);
        if (bufferRef.current.length > MAX_LINES) {
          bufferRef.current = bufferRef.current.slice(-MAX_LINES);
        }
      } else {
        setLines((prev) => {
          const combined = [...prev, ...bufferRef.current, line];
          bufferRef.current = [];
          return combined.length > MAX_LINES
            ? combined.slice(-MAX_LINES)
            : combined;
        });
      }
    }).then((fn) => {
      unlisten = fn;
    });

    return () => {
      mounted = false;
      unlisten?.();
      void stopLogcat();
      setActive(false);
    };
  }, [selectedDevice]);

  function handlePauseToggle() {
    if (paused) {
      setLines((prev) => {
        const combined = [...prev, ...bufferRef.current];
        bufferRef.current = [];
        return combined.length > MAX_LINES
          ? combined.slice(-MAX_LINES)
          : combined;
      });
    }
    setPaused(!paused);
  }

  function handleClear() {
    setLines([]);
    bufferRef.current = [];
  }

  function handleScroll() {
    if (!parentRef.current) return;
    const el = parentRef.current;
    const atBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
    autoScrollRef.current = atBottom;
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
      <div className="flex items-center gap-2 border-b border-border bg-card px-4 py-2">
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

        <div className="relative ml-2 flex-1">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <input
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
            placeholder="搜索 tag 或 message..."
            className="w-full rounded-md border border-border bg-secondary py-1.5 pl-8 pr-3 text-xs outline-none focus:ring-1 focus:ring-ring"
          />
        </div>

        <button
          type="button"
          onClick={handlePauseToggle}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
            paused
              ? "bg-amber-500/20 text-amber-400"
              : "bg-secondary text-muted-foreground hover:text-foreground"
          )}
          title={paused ? "恢复" : "暂停"}
        >
          {paused ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
        </button>

        <button
          type="button"
          onClick={handleClear}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          title="清屏"
        >
          <Trash2 className="h-3.5 w-3.5" />
        </button>

        <div className="text-xs text-muted-foreground">
          {filtered.length}/{lines.length}
          {active && <span className="ml-1 text-emerald-400">●</span>}
          {paused && <span className="ml-1 text-amber-400">(暂停)</span>}
        </div>
      </div>

      <div
        ref={parentRef}
        className="min-h-0 flex-1 overflow-auto font-mono text-xs"
        onScroll={handleScroll}
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
                key={virtualItem.index}
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
                <span className={cn("w-3 shrink-0 text-center", levelColor)}>
                  {line.level}
                </span>
                <span className="w-14 shrink-0 truncate text-muted-foreground">
                  {line.tag}
                </span>
                <span className="w-12 shrink-0 text-muted-foreground">
                  {line.pid}
                </span>
                <span className={cn("min-w-0 flex-1 truncate", levelColor)}>
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
