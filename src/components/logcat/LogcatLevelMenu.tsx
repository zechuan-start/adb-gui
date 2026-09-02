import { useCallback, useEffect, useRef, useState } from "react";
import { ListFilter } from "lucide-react";
import { useLogcatStore } from "@/store/logcat";

const LEVELS = [
  { value: "VERBOSE", label: "V · Verbose" },
  { value: "DEBUG", label: "D · Debug" },
  { value: "INFO", label: "I · Info" },
  { value: "WARN", label: "W · Warn" },
  { value: "ERROR", label: "E · Error" },
  { value: "ASSERT", label: "F · Assert" },
] as const;

export function LogcatLevelMenu() {
  const appendToQuery = useLogcatStore((state) => state.appendToQuery);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const firstItemRef = useRef<HTMLButtonElement>(null);
  const close = useCallback(() => setOpen(false), []);

  useEffect(() => {
    if (!open) {
      return;
    }
    const frame = window.requestAnimationFrame(() => firstItemRef.current?.focus());
    function handlePointerDown(event: PointerEvent): void {
      if (event.target instanceof Node && !rootRef.current?.contains(event.target)) {
        close();
      }
    }
    function handleKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      close();
      triggerRef.current?.focus();
    }
    document.addEventListener("pointerdown", handlePointerDown);
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("pointerdown", handlePointerDown);
      document.removeEventListener("keydown", handleKeyDown);
    };
  }, [close, open]);

  function chooseLevel(value: string): void {
    appendToQuery(`level:${value}`);
    close();
  }

  return (
    <div ref={rootRef} className="relative shrink-0">
      <button
        ref={triggerRef}
        type="button"
        aria-label="等级查询"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-controls="logcat-level-menu"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-7 w-7 items-center justify-center border border-rule text-log-dim hover:bg-hover hover:text-ink"
        title="追加日志等级查询"
      >
        <ListFilter className="h-3.5 w-3.5" />
      </button>
      {open && (
        <div
          id="logcat-level-menu"
          role="menu"
          className="absolute left-0 top-full z-30 mt-1 w-40 border border-rule bg-popover p-1 text-popover-foreground shadow-[3px_3px_0_var(--color-hard-shadow)]"
        >
          <p className="px-2 py-1 font-data text-[10px] text-ink3">等级阈值</p>
          {LEVELS.map((level, index) => (
            <button
              ref={index === 0 ? firstItemRef : undefined}
              key={level.value}
              type="button"
              role="menuitem"
              onClick={() => chooseLevel(level.value)}
              className="flex h-7 w-full items-center px-2 font-data text-[11px] text-ink hover:bg-hover"
            >
              {level.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
