import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Download,
  Eraser,
  Maximize2,
  Minimize2,
  MoreHorizontal,
  PanelBottomClose,
  Pause,
  Play,
  RotateCcw,
} from "lucide-react";
import { clearLogcat, exportLogcat } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import { useFeedbackStore } from "@/store/feedback";
import { useLogcatStore } from "@/store/logcat";

interface LogcatActionsProps {
  visible: boolean;
  compact: boolean;
  serial: string | null;
  exportSerial: string | null;
  maximized: boolean;
  onToggleMaximized: () => void;
  onHide: () => void;
}

const ACTION_BUTTON =
  "inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40";
const MENU_ITEM =
  "flex h-8 w-full items-center gap-2 px-2.5 text-left text-xs text-ink hover:bg-hover disabled:cursor-not-allowed disabled:opacity-40";

export function LogcatActions({
  visible,
  compact,
  serial,
  exportSerial,
  maximized,
  onToggleMaximized,
  onHide,
}: LogcatActionsProps) {
  const showToast = useFeedbackStore((state) => state.showToast);
  const totalCount = useLogcatStore((state) => state.totalCount);
  const streamMode = useLogcatStore((state) => state.streamMode);
  const followMode = useLogcatStore((state) => state.followMode);
  const filteredCount = useLogcatStore((state) => state.filteredCount);
  const pause = useLogcatStore((state) => state.pause);
  const resume = useLogcatStore((state) => state.resume);
  const setFollowMode = useLogcatStore((state) => state.setFollowMode);
  const restart = useLogcatStore((state) => state.restart);
  const clearScreen = useLogcatStore((state) => state.clearScreen);
  const [menuOpen, setMenuOpen] = useState(false);
  const [confirmClearDevice, setConfirmClearDevice] = useState(false);
  const [clearingDevice, setClearingDevice] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstMenuItemRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmClearDevice(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) {
      return;
    }
    const focusFrame = window.requestAnimationFrame(() => firstMenuItemRef.current?.focus());
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) {
        closeMenu();
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      closeMenu();
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [closeMenu, menuOpen]);

  useEffect(() => {
    if (!visible) {
      closeMenu();
    }
  }, [closeMenu, visible]);

  async function handleExport(): Promise<void> {
    if (!exportSerial || filteredCount === 0) {
      return;
    }
    const store = useLogcatStore.getState();
    const rawLines: string[] = [];
    for (let index = 0; index < store.filteredCount; index += 1) {
      const seq = store.filteredSeqs[store.filteredHead + index];
      const entry = seq === undefined ? undefined : store.buffer.bySeq(seq);
      if (entry) {
        rawLines.push(entry.raw);
      }
    }
    try {
      const result = await exportLogcat(exportSerial, rawLines.join("\n"));
      showToast("success", `日志已导出到 ${result.path}`);
    } catch (error) {
      showToast("error", `导出日志失败: ${String(error)}`);
    } finally {
      closeMenu();
    }
  }

  async function handleClearDevice(): Promise<void> {
    if (!serial || clearingDevice) {
      return;
    }
    if (!confirmClearDevice) {
      setConfirmClearDevice(true);
      return;
    }
    setClearingDevice(true);
    try {
      await clearLogcat(serial);
      showToast("success", "设备日志缓冲区已清空");
    } catch (error) {
      showToast("error", `清空设备日志缓冲区失败: ${String(error)}`);
    } finally {
      setClearingDevice(false);
      closeMenu();
    }
  }

  function handleRestart(): void {
    restart();
    closeMenu();
  }

  function handleClearScreen(): void {
    clearScreen();
    closeMenu();
  }

  function handleToggleMaximized(): void {
    onToggleMaximized();
    closeMenu();
  }

  function handleHide(): void {
    closeMenu();
    onHide();
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button
        type="button"
        onClick={streamMode === "paused" ? resume : pause}
        disabled={!serial}
        className={cn(ACTION_BUTTON, streamMode === "paused" && "border-warn bg-warn-band text-warn")}
        title={streamMode === "paused" ? "恢复日志流" : "暂停日志流"}
      >
        {streamMode === "paused" ? (
          <Play className="h-3.5 w-3.5" />
        ) : (
          <Pause className="h-3.5 w-3.5" />
        )}
      </button>
      <button
        type="button"
        onClick={() => setFollowMode("follow")}
        disabled={followMode === "follow" || totalCount === 0}
        className={ACTION_BUTTON}
        title="回到底部并跟随"
      >
        <ArrowDownToLine className="h-3.5 w-3.5" />
      </button>

      {!compact && (
        <>
          <button type="button" onClick={restart} disabled={!serial} className={ACTION_BUTTON} title="清空并重连">
            <RotateCcw className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={() => void handleExport()}
            disabled={!exportSerial || filteredCount === 0}
            className={ACTION_BUTTON}
            title="导出当前过滤结果"
          >
            <Download className="h-3.5 w-3.5" />
          </button>
          <button type="button" onClick={clearScreen} disabled={totalCount === 0} className={ACTION_BUTTON} title="清屏">
            <Eraser className="h-3.5 w-3.5" />
          </button>
          <button
            type="button"
            onClick={onToggleMaximized}
            className={ACTION_BUTTON}
            title={maximized ? "还原日志面板" : "铺满日志面板"}
          >
            {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
          </button>
          <button type="button" onClick={onHide} className={ACTION_BUTTON} title="隐藏日志面板">
            <PanelBottomClose className="h-3.5 w-3.5" />
          </button>
        </>
      )}

      <div ref={menuRef} className="relative shrink-0">
        <button
          ref={triggerRef}
          type="button"
          aria-haspopup="menu"
          aria-expanded={menuOpen}
          aria-controls="logcat-more-menu"
          onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)}
          className={ACTION_BUTTON}
          title="更多操作"
        >
          <MoreHorizontal className="h-3.5 w-3.5" />
        </button>
        {menuOpen && (
          <div
            id="logcat-more-menu"
            role="menu"
            className="absolute right-0 top-full z-30 mt-1 min-w-56 max-w-[calc(100vw-2rem)] border border-rule bg-popover p-1 text-popover-foreground shadow-[3px_3px_0_var(--color-hard-shadow)]"
          >
            {compact && (
              <>
                <button ref={firstMenuItemRef} type="button" role="menuitem" disabled={!serial} onClick={handleRestart} className={MENU_ITEM}>
                  <RotateCcw className="h-3.5 w-3.5" /> 清空并重连
                </button>
                <button type="button" role="menuitem" disabled={!exportSerial || filteredCount === 0} onClick={() => void handleExport()} className={MENU_ITEM}>
                  <Download className="h-3.5 w-3.5" /> 导出过滤结果
                </button>
                <button type="button" role="menuitem" disabled={totalCount === 0} onClick={handleClearScreen} className={MENU_ITEM}>
                  <Eraser className="h-3.5 w-3.5" /> 清屏
                </button>
                <div className="my-1 border-t border-rule" />
                <button type="button" role="menuitem" onClick={handleToggleMaximized} className={MENU_ITEM}>
                  {maximized ? <Minimize2 className="h-3.5 w-3.5" /> : <Maximize2 className="h-3.5 w-3.5" />}
                  {maximized ? "还原日志面板" : "铺满日志面板"}
                </button>
                <button type="button" role="menuitem" onClick={handleHide} className={MENU_ITEM}>
                  <PanelBottomClose className="h-3.5 w-3.5" /> 隐藏日志面板
                </button>
                <div className="my-1 border-t border-rule" />
              </>
            )}
            <button
              ref={compact ? undefined : firstMenuItemRef}
              type="button"
              role="menuitem"
              disabled={!serial || clearingDevice}
              onClick={() => void handleClearDevice()}
              className={cn(MENU_ITEM, "text-err hover:bg-err-band")}
            >
              <Eraser className="h-3.5 w-3.5" />
              {clearingDevice
                ? "正在清空设备缓冲区..."
                : confirmClearDevice
                  ? "确认清空设备缓冲区?"
                  : "清空设备日志缓冲区"}
            </button>
            {confirmClearDevice && (
              <p className="px-2.5 pb-2 text-[10px] text-err">再次点击以执行, 该操作不可恢复.</p>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
