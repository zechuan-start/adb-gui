import { useCallback, useEffect, useRef, useState } from "react";
import { Columns3 } from "lucide-react";
import {
  columnsMatch,
  COMPACT_COLUMNS,
  LOGCAT_COLUMNS,
  STANDARD_COLUMNS,
  type ViewFormat,
} from "@/lib/logcatView";
import { cn } from "@/lib/utils";
import { useLogcatStore } from "@/store/logcat";

interface LogcatViewMenuProps {
  disabled: boolean;
}

export function LogcatViewMenu({ disabled }: LogcatViewMenuProps) {
  const columns = useLogcatStore((state) => state.columns);
  const softWrap = useLogcatStore((state) => state.softWrap);
  const autoFold = useLogcatStore((state) => state.autoFold);
  const cozyRows = useLogcatStore((state) => state.cozyRows);
  const setViewFormat = useLogcatStore((state) => state.setViewFormat);
  const setColumn = useLogcatStore((state) => state.setColumn);
  const setSoftWrap = useLogcatStore((state) => state.setSoftWrap);
  const setAutoFold = useLogcatStore((state) => state.setAutoFold);
  const setCozyRows = useLogcatStore((state) => state.setCozyRows);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstControlRef = useRef<HTMLButtonElement>(null);

  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) return;
    const focusFrame = window.requestAnimationFrame(() => firstControlRef.current?.focus());

    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        close();
      }
    }

    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") return;
      close();
      triggerRef.current?.focus();
    }

    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(focusFrame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  useEffect(() => {
    if (disabled) close();
  }, [close, disabled]);

  const standardActive = columnsMatch(columns, STANDARD_COLUMNS);
  const compactActive = columnsMatch(columns, COMPACT_COLUMNS);

  function chooseFormat(format: ViewFormat): void {
    setViewFormat(format);
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-controls="logcat-view-menu"
        disabled={disabled}
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink disabled:cursor-not-allowed disabled:opacity-40"
        title="调整 Logcat 视图"
      >
        <Columns3 className="h-3.5 w-3.5" />
      </button>

      {open && (
        <div
          id="logcat-view-menu"
          role="dialog"
          aria-label="Logcat 视图设置"
          className="absolute right-0 top-full z-30 mt-1 w-72 max-w-[calc(100vw-2rem)] border border-rule bg-popover p-3 text-popover-foreground shadow-[3px_3px_0_var(--color-hard-shadow)]"
        >
          <div className="text-[11px] font-medium text-muted-foreground">视图格式</div>
          <div className="mt-2 grid grid-cols-2 border border-rule bg-surface p-0.5">
            <button
              ref={firstControlRef}
              type="button"
              aria-pressed={standardActive}
              onClick={() => chooseFormat("standard")}
              className={cn(
                "h-7 px-2 text-xs",
                standardActive
                  ? "bg-ink text-onink"
                  : "text-ink2 hover:bg-hover hover:text-ink",
              )}
            >
              Standard
            </button>
            <button
              type="button"
              aria-pressed={compactActive}
              onClick={() => chooseFormat("compact")}
              className={cn(
                "h-7 px-2 text-xs",
                compactActive
                  ? "bg-ink text-onink"
                  : "text-ink2 hover:bg-hover hover:text-ink",
              )}
            >
              Compact
            </button>
          </div>

          <div className="mt-3 border-t border-border pt-3 text-[11px] font-medium text-muted-foreground">
            显示列
          </div>
          <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-2">
            {LOGCAT_COLUMNS.map(({ column, label }) => (
              <label
                key={column}
                className="flex min-w-0 cursor-pointer items-center gap-2 text-xs text-popover-foreground"
              >
                <input
                  type="checkbox"
                  checked={columns[column]}
                  onChange={(event) => setColumn(column, event.currentTarget.checked)}
                  className="h-3.5 w-3.5 accent-foreground"
                />
                <span className="truncate">{label}</span>
              </label>
            ))}
          </div>

          <div className="mt-3 grid gap-2 border-t border-rule pt-3">
            <label className="flex cursor-pointer items-center gap-2 text-xs text-popover-foreground">
              <input
                type="checkbox"
                checked={autoFold}
                onChange={(event) => setAutoFold(event.currentTarget.checked)}
                className="h-3.5 w-3.5 accent-foreground"
              />
              <span>自动折叠崩溃堆栈</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-popover-foreground">
              <input
                type="checkbox"
                checked={softWrap}
                onChange={(event) => setSoftWrap(event.currentTarget.checked)}
                className="h-3.5 w-3.5 accent-foreground"
              />
              <span>Soft-Wrap</span>
            </label>
            <label className="flex cursor-pointer items-center gap-2 text-xs text-popover-foreground">
              <input
                type="checkbox"
                checked={cozyRows}
                onChange={(event) => setCozyRows(event.currentTarget.checked)}
                className="h-3.5 w-3.5 accent-foreground"
              />
              <span>宽行距</span>
            </label>
          </div>
        </div>
      )}
    </div>
  );
}
