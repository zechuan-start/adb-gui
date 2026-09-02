import { useEffect, useRef, useState } from "react";
import { ListCollapse, WrapText } from "lucide-react";
import type { LogcatPackageResolutionState } from "@/hooks/useLogcatPackageResolution";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";
import { useUiStore } from "@/store/ui";
import { LogcatActions } from "@/components/logcat/LogcatActions";
import { LogcatLevelMenu } from "@/components/logcat/LogcatLevelMenu";
import { LogcatQueryInput } from "@/components/logcat/LogcatQueryInput";
import { LogcatViewMenu } from "@/components/logcat/LogcatViewMenu";

const COMPACT_TOOLBAR_WIDTH = 1_040;

interface LogcatToolbarProps {
  visible: boolean;
  serial: string | null;
  exportSerial: string | null;
  packageResolution: LogcatPackageResolutionState;
}

export function LogcatToolbar({
  visible,
  serial,
  exportSerial,
  packageResolution,
}: LogcatToolbarProps) {
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [compact, setCompact] = useState(false);
  const totalCount = useLogcatStore((state) => state.totalCount);
  const filteredCount = useLogcatStore((state) => state.filteredCount);
  const streamState = useLogcatStore((state) => state.streamState);
  const streamMode = useLogcatStore((state) => state.streamMode);
  const pausedBacklog = useLogcatStore((state) => state.pausedBacklog);
  const autoFold = useLogcatStore((state) => state.autoFold);
  const softWrap = useLogcatStore((state) => state.softWrap);
  const setAutoFold = useLogcatStore((state) => state.setAutoFold);
  const setSoftWrap = useLogcatStore((state) => state.setSoftWrap);
  const activePane = useUiStore((state) => state.activePane);
  const logMaximized = useUiStore((state) => state.logMaximized);
  const setLogMaximized = useUiStore((state) => state.setLogMaximized);
  const setLogOpen = useUiStore((state) => state.setLogOpen);
  const viewDisabled = !serial && totalCount === 0;

  useEffect(() => {
    const toolbar = toolbarRef.current;
    if (!toolbar) {
      return;
    }
    function updateCompact(width: number): void {
      setCompact(width < COMPACT_TOOLBAR_WIDTH);
    }
    updateCompact(toolbar.getBoundingClientRect().width);
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        updateCompact(entry.contentRect.width);
      }
    });
    observer.observe(toolbar);
    return () => observer.disconnect();
  }, []);

  const status = streamState === "disconnected"
    ? { label: "已断开", tone: "bg-err" }
    : streamState === "starting"
      ? { label: "连接中", tone: "bg-ink3" }
      : streamMode === "paused"
        ? {
            label: pausedBacklog > 0 ? `暂停 +${pausedBacklog}` : "已暂停",
            tone: "bg-warn",
          }
        : streamState === "live"
          ? { label: "实时", tone: "bg-ok" }
          : { label: "等待设备", tone: "bg-ink3" };

  return (
    <div
      ref={toolbarRef}
      className="flex h-10 shrink-0 flex-nowrap items-center gap-1.5 border-b border-rule bg-log-bg px-2"
      data-compact={compact ? "true" : "false"}
    >
      {!compact && (
        <span className="shrink-0 border-r border-rule pr-2 font-data text-[10px] font-semibold text-log-tag">
          LOGCAT
        </span>
      )}
      <LogcatQueryInput visible={visible} packageResolution={packageResolution} />
      <LogcatLevelMenu />
      <LogcatActions
        visible={visible}
        compact={compact}
        serial={serial}
        exportSerial={exportSerial}
        maximized={logMaximized}
        onToggleMaximized={() => setLogMaximized(!logMaximized)}
        onHide={() => setLogOpen(activePane, false)}
      />
      <div className="flex shrink-0 items-center gap-1 border-l border-rule pl-1.5">
        <button
          type="button"
          onClick={() => setAutoFold(!autoFold)}
          disabled={viewDisabled}
          aria-pressed={autoFold}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
            autoFold && "border-note bg-note/15 text-note",
          )}
          title={autoFold ? "关闭自动折叠堆栈" : "自动折叠堆栈"}
        >
          <ListCollapse className="h-3.5 w-3.5" />
        </button>
        <button
          type="button"
          onClick={() => setSoftWrap(!softWrap)}
          disabled={viewDisabled}
          aria-pressed={softWrap}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40",
            softWrap && "border-note bg-note/15 text-note",
          )}
          title={softWrap ? "关闭 Soft-Wrap" : "开启 Soft-Wrap"}
        >
          <WrapText className="h-3.5 w-3.5" />
        </button>
        <LogcatViewMenu disabled={viewDisabled} />
      </div>
      <div
        className={cn(
          "flex h-7 shrink-0 items-center justify-end gap-2 border-l border-rule pl-2 font-data text-[10px] text-log-dim",
          compact ? "w-[112px]" : "w-[150px]",
        )}
        title={`${filteredCount}/${totalCount}, ${status.label}`}
      >
        <span className="truncate tabular-nums">{filteredCount}/{totalCount}</span>
        <span className="inline-flex min-w-0 items-center gap-1.5">
          <span className={cn("h-1.5 w-1.5 shrink-0", status.tone)} aria-hidden="true" />
          <span className="truncate">{status.label}</span>
        </span>
      </div>
    </div>
  );
}
