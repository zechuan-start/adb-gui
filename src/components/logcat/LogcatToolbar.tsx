import type { LogcatPackageResolutionState } from "@/hooks/useLogcatPackageResolution";
import { WrapText } from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";
import { LogcatActions } from "@/components/logcat/LogcatActions";
import { LogcatQueryInput } from "@/components/logcat/LogcatQueryInput";
import { LogcatViewMenu } from "@/components/logcat/LogcatViewMenu";

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
  const totalCount = useLogcatStore((state) => state.totalCount);
  const filteredCount = useLogcatStore((state) => state.filteredCount);
  const streamState = useLogcatStore((state) => state.streamState);
  const streamMode = useLogcatStore((state) => state.streamMode);
  const pausedBacklog = useLogcatStore((state) => state.pausedBacklog);
  const followMode = useLogcatStore((state) => state.followMode);
  const detachedNewCount = useLogcatStore((state) => state.detachedNewCount);
  const softWrap = useLogcatStore((state) => state.softWrap);
  const setSoftWrap = useLogcatStore((state) => state.setSoftWrap);

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-border bg-card px-4 py-2">
      <LogcatQueryInput packageResolution={packageResolution} />
      <LogcatActions visible={visible} serial={serial} exportSerial={exportSerial} />
      <div className="flex shrink-0 items-center gap-1">
        <button
          type="button"
          onClick={() => setSoftWrap(!softWrap)}
          disabled={!serial}
          aria-pressed={softWrap}
          className={cn(
            "inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors disabled:cursor-not-allowed disabled:opacity-40",
            softWrap
              ? "bg-accent text-accent-foreground ring-1 ring-inset ring-ring"
              : "bg-secondary text-muted-foreground hover:text-foreground",
          )}
          title={softWrap ? "关闭 Soft-Wrap" : "开启 Soft-Wrap"}
        >
          <WrapText className="h-3.5 w-3.5" />
        </button>
        <LogcatViewMenu disabled={!serial} />
      </div>
      <div className="ml-auto flex h-5 shrink-0 items-center gap-2 whitespace-nowrap text-xs text-muted-foreground">
        <span className="inline-block w-20 text-right tabular-nums">
          {filteredCount}/{totalCount}
        </span>
        <span className="inline-flex w-16 items-center gap-1">
          {streamState === "starting" && (
            <><span className="text-muted-foreground">●</span> 连接中</>
          )}
          {streamState === "live" && (
            <span className="text-success" title="日志流正常">●</span>
          )}
          {streamState === "disconnected" && (
            <><span className="text-destructive">●</span> 已断开</>
          )}
        </span>
        <span
          aria-hidden={streamMode !== "paused"}
          title={streamMode === "paused" ? `暂停, 积压 ${pausedBacklog} 行` : undefined}
          className={cn(
            "inline-block w-24 overflow-hidden text-ellipsis text-right tabular-nums text-warning",
            streamMode !== "paused" && "invisible",
          )}
        >
          暂停{pausedBacklog > 0 ? ` +${pausedBacklog}` : ""}
        </span>
        <span
          aria-hidden={followMode !== "detached"}
          title={followMode === "detached" ? `未跟随, 新增 ${detachedNewCount} 行` : undefined}
          className={cn(
            "inline-block w-28 overflow-hidden text-ellipsis text-right tabular-nums text-warning",
            followMode !== "detached" && "invisible",
          )}
        >
          未跟随{detachedNewCount > 0 ? ` +${detachedNewCount}` : ""}
        </span>
      </div>
    </div>
  );
}
