import { useCallback, useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  Download,
  Eraser,
  MoreHorizontal,
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
  serial: string | null;
  exportSerial: string | null;
}

export function LogcatActions({ visible, serial, exportSerial }: LogcatActionsProps) {
  const showToast = useFeedbackStore((state) => state.showToast);
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
  const menuItemRef = useRef<HTMLButtonElement>(null);

  const closeMenu = useCallback(() => {
    setMenuOpen(false);
    setConfirmClearDevice(false);
  }, []);

  useEffect(() => {
    if (!menuOpen) return;
    const focusFrame = window.requestAnimationFrame(() => menuItemRef.current?.focus());
    function handlePointerDown(event: PointerEvent) {
      if (event.target instanceof Node && !menuRef.current?.contains(event.target)) closeMenu();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
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
    if (!visible || !serial) closeMenu();
  }, [closeMenu, serial, visible]);

  async function handleExport() {
    if (!exportSerial || filteredCount === 0) return;
    const store = useLogcatStore.getState();
    const rawLines: string[] = [];
    for (let index = 0; index < store.filteredCount; index += 1) {
      const seq = store.filteredSeqs[store.filteredHead + index];
      const entry = seq === undefined ? undefined : store.buffer.bySeq(seq);
      if (entry) rawLines.push(entry.raw);
    }
    try {
      const result = await exportLogcat(exportSerial, rawLines.join("\n"));
      showToast("success", `日志已导出到 ${result.path}`);
    } catch (error) {
      showToast("error", `导出日志失败: ${error}`);
    }
  }

  async function handleClearDevice() {
    if (!serial || clearingDevice) return;
    if (!confirmClearDevice) {
      setConfirmClearDevice(true);
      return;
    }
    setClearingDevice(true);
    try {
      await clearLogcat(serial);
      showToast("success", "设备日志缓冲区已清空");
    } catch (error) {
      showToast("error", `清空设备日志缓冲区失败: ${error}`);
    } finally {
      setClearingDevice(false);
      closeMenu();
    }
  }

  return (
    <div className="flex shrink-0 items-center gap-1">
      <button type="button" onClick={streamMode === "paused" ? resume : pause}
        className={cn("inline-flex h-7 w-7 items-center justify-center rounded-md transition-colors",
          streamMode === "paused" ? "bg-warning/20 text-warning" : "bg-secondary text-muted-foreground hover:text-foreground")}
        title={streamMode === "paused" ? "恢复日志流" : "暂停日志流"}>
        {streamMode === "paused" ? <Play className="h-3.5 w-3.5" /> : <Pause className="h-3.5 w-3.5" />}
      </button>
      <button type="button" onClick={() => setFollowMode("follow")} disabled={followMode === "follow"}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="回到底部并跟随"><ArrowDownToLine className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={restart} disabled={!serial}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="清空并重连"><RotateCcw className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={() => void handleExport()} disabled={!exportSerial || filteredCount === 0}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground disabled:cursor-not-allowed disabled:opacity-40"
        title="导出当前过滤结果"><Download className="h-3.5 w-3.5" /></button>
      <button type="button" onClick={clearScreen}
        className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
        title="清屏 (只清当前视图)"><Eraser className="h-3.5 w-3.5" /></button>

      <div ref={menuRef} className="relative shrink-0">
        <button ref={triggerRef} type="button" aria-haspopup="menu" aria-expanded={menuOpen}
          aria-controls="logcat-more-menu" onClick={() => menuOpen ? closeMenu() : setMenuOpen(true)}
          className="inline-flex h-7 w-7 items-center justify-center rounded-md bg-secondary text-muted-foreground transition-colors hover:text-foreground"
          title="更多操作"><MoreHorizontal className="h-3.5 w-3.5" /></button>
        {menuOpen && (
          <div id="logcat-more-menu" role="menu"
            className="absolute right-0 top-full z-20 mt-1 min-w-64 max-w-[calc(100vw-2rem)] rounded-md border border-border bg-popover p-1 text-popover-foreground shadow-lg">
            <button ref={menuItemRef} type="button" role="menuitem" disabled={!serial || clearingDevice}
              onClick={() => void handleClearDevice()}
              className="w-full rounded px-3 py-2 text-left text-xs text-destructive transition-colors hover:bg-destructive/10 disabled:cursor-not-allowed disabled:opacity-50">
              {clearingDevice ? "正在清空设备缓冲区..." : confirmClearDevice ? "确认清空设备缓冲区?" : "清空设备日志缓冲区"}
            </button>
            {confirmClearDevice && <p className="px-3 pb-2 text-[11px] text-destructive">再次点击以执行, 该操作不可恢复。</p>}
          </div>
        )}
      </div>
    </div>
  );
}
