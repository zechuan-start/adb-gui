import { useEffect } from "react";
import {
  AppWindow,
  Files,
  Monitor,
  Moon,
  PanelBottomClose,
  PanelBottomOpen,
  QrCode,
  ScanLine,
  Sun,
  Wrench,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";
import { useThemeStore } from "@/store/theme";
import {
  deriveLogcatUnreadCount,
  logcatReadBaseline,
  type PaneId,
  useUiStore,
} from "@/store/ui";

const PANES: readonly {
  id: PaneId;
  index: string;
  label: string;
  icon: typeof Wrench;
}[] = [
  { id: "tools", index: "01", label: "工具", icon: Wrench },
  { id: "apps", index: "02", label: "应用", icon: AppWindow },
  { id: "files", index: "03", label: "文件", icon: Files },
  { id: "codegen", index: "04", label: "生码", icon: QrCode },
  { id: "decoder", index: "05", label: "解码", icon: ScanLine },
];

const THEMES = [
  { id: "system" as const, label: "跟随系统", icon: Monitor },
  { id: "light" as const, label: "亮色", icon: Sun },
  { id: "dark" as const, label: "暗色", icon: Moon },
];

function LogcatWorkspaceToggle() {
  const activePane = useUiStore((state) => state.activePane);
  const logOpen = useUiStore((state) => state.logOpenByPane[activePane]);
  const readThroughSeq = useUiStore((state) => state.logReadThroughSeq);
  const setLogReadThroughSeq = useUiStore((state) => state.setLogReadThroughSeq);
  const toggleLogOpen = useUiStore((state) => state.toggleLogOpen);
  const totalCount = useLogcatStore((state) => state.totalCount);
  const nextSeq = useLogcatStore((state) => state.nextSeq);
  useLogcatStore((state) => state.revision);
  const buffer = useLogcatStore((state) => state.buffer);
  const latestSeq = totalCount > 0 ? buffer.at(totalCount - 1)?.seq ?? null : null;
  const baselineSeq = logcatReadBaseline(latestSeq, nextSeq);

  useEffect(() => {
    if ((logOpen || latestSeq === null) && readThroughSeq !== baselineSeq) {
      setLogReadThroughSeq(baselineSeq);
    }
  }, [baselineSeq, latestSeq, logOpen, readThroughSeq, setLogReadThroughSeq]);

  const unreadCount = deriveLogcatUnreadCount(
    logOpen,
    totalCount,
    latestSeq,
    readThroughSeq,
  );

  return (
    <button
      type="button"
      onClick={() => toggleLogOpen(activePane)}
      aria-pressed={logOpen}
      className={cn(
        "flex h-[34px] w-full items-center gap-2 border border-rule px-2.5 text-left font-data text-[11.5px] text-ink hover:border-ink3 hover:bg-hover",
        logOpen && "border-ink bg-ink text-onink hover:border-ink hover:bg-ink",
      )}
      title={logOpen ? "隐藏日志" : "显示日志"}
    >
      {logOpen ? (
        <PanelBottomClose className="h-4 w-4" aria-hidden="true" />
      ) : (
        <PanelBottomOpen className="h-4 w-4" aria-hidden="true" />
      )}
      <span>{logOpen ? "隐藏日志" : "显示日志"}</span>
      {unreadCount > 0 ? (
        <span className="ml-auto min-w-5 border border-current px-1 text-center text-[10px]">
          {unreadCount > 999 ? "999+" : unreadCount}
        </span>
      ) : (
        <kbd className="ml-auto border border-current px-1 text-[10px] opacity-60">⌘J</kbd>
      )}
    </button>
  );
}

export function IndexRail() {
  const activePane = useUiStore((state) => state.activePane);
  const setActivePane = useUiStore((state) => state.setActivePane);
  const theme = useThemeStore((state) => state.theme);
  const setTheme = useThemeStore((state) => state.setTheme);

  return (
    <aside className="flex w-[168px] shrink-0 flex-col border-r border-rule bg-surface pt-3.5">
      <div className="mb-2.5 border-b border-dashed border-rule px-3.5 pb-3">
        <strong className="block text-sm font-semibold text-ink">ADB GUI</strong>
        <span className="font-data text-[10.5px] text-ink3">BP-ADB / REV 01</span>
      </div>

      <nav aria-label="工作区索引" className="flex flex-col">
        {PANES.map((pane) => {
          const active = activePane === pane.id;
          const Icon = pane.icon;
          return (
            <button
              id={`pane-nav-${pane.id}`}
              key={pane.id}
              type="button"
              onClick={() => setActivePane(pane.id)}
              aria-current={active ? "page" : undefined}
              className={cn(
                "relative flex h-8 items-center gap-2.5 px-3.5 text-left font-data text-xs text-ink2 hover:bg-hover hover:text-ink",
                active &&
                  "bg-hover font-semibold text-ink before:absolute before:inset-y-1 before:left-0 before:w-0.5 before:bg-ink",
              )}
            >
              <Icon className="h-4 w-4" aria-hidden="true" />
              <span>{pane.label}</span>
              <span className="ml-auto text-[10.5px] text-ink3">{pane.index}</span>
            </button>
          );
        })}
      </nav>

      <div className="mt-auto flex flex-col gap-2 border-t border-dashed border-rule p-2">
        <LogcatWorkspaceToggle />

        <div className="flex border border-rule" role="group" aria-label="主题">
          {THEMES.map((item) => {
            const Icon = item.icon;
            const active = theme === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTheme(item.id)}
                aria-label={item.label}
                aria-pressed={active}
                title={item.label}
                className={cn(
                  "flex h-7 flex-1 items-center justify-center border-r border-rule text-ink3 last:border-r-0 hover:bg-hover hover:text-ink",
                  active && "bg-ink text-onink hover:bg-ink hover:text-onink",
                )}
              >
                <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    </aside>
  );
}
