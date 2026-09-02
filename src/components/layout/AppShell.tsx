import {
  useEffect,
  useRef,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { IndexRail } from "@/components/layout/IndexRail";
import { cn } from "@/lib/utils";
import { useUiStore } from "@/store/ui";

interface AppShellProps {
  topBar: ReactNode;
  statusBanner?: ReactNode;
  children: ReactNode;
  logcat: ReactNode;
}

export function AppShell({
  topBar,
  statusBanner,
  children,
  logcat,
}: AppShellProps) {
  const dragRef = useRef<{ pointerId: number; startY: number; startHeight: number } | null>(
    null,
  );
  const activePane = useUiStore((state) => state.activePane);
  const logOpen = useUiStore((state) => state.logOpenByPane[activePane]);
  const logHeight = useUiStore((state) => state.logHeight);
  const logMaximized = useUiStore((state) => state.logMaximized);
  const toggleLogOpen = useUiStore((state) => state.toggleLogOpen);
  const setLogOpen = useUiStore((state) => state.setLogOpen);
  const setLogHeight = useUiStore((state) => state.setLogHeight);
  const requestLogQueryFocus = useUiStore((state) => state.requestLogQueryFocus);

  useEffect(() => {
    function clampToViewport() {
      setLogHeight(useUiStore.getState().logHeight, window.innerHeight);
    }

    clampToViewport();
    window.addEventListener("resize", clampToViewport);
    return () => window.removeEventListener("resize", clampToViewport);
  }, [setLogHeight]);

  useEffect(() => {
    function handleKeyDown(event: KeyboardEvent): void {
      if (!(event.metaKey || event.ctrlKey) || event.altKey) {
        return;
      }
      const key = event.key.toLowerCase();
      if (key === "j") {
        event.preventDefault();
        toggleLogOpen(useUiStore.getState().activePane);
        return;
      }
      if (key !== "f") {
        return;
      }
      event.preventDefault();
      const pane = useUiStore.getState().activePane;
      setLogOpen(pane, true);
      requestLogQueryFocus();
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [requestLogQueryFocus, setLogOpen, toggleLogOpen]);

  function handleResizePointerDown(event: ReactPointerEvent<HTMLDivElement>): void {
    if (event.button !== 0) {
      return;
    }
    event.currentTarget.setPointerCapture(event.pointerId);
    dragRef.current = {
      pointerId: event.pointerId,
      startY: event.clientY,
      startHeight: useUiStore.getState().logHeight,
    };
  }

  function handleResizePointerMove(event: ReactPointerEvent<HTMLDivElement>): void {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      return;
    }
    setLogHeight(drag.startHeight + drag.startY - event.clientY, window.innerHeight);
  }

  function finishResize(event: ReactPointerEvent<HTMLDivElement>): void {
    if (dragRef.current?.pointerId !== event.pointerId) {
      return;
    }
    dragRef.current = null;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
  }

  function handleResizeKeyDown(event: ReactKeyboardEvent<HTMLDivElement>): void {
    if (event.key !== "ArrowUp" && event.key !== "ArrowDown") {
      return;
    }
    event.preventDefault();
    const direction = event.key === "ArrowUp" ? 1 : -1;
    setLogHeight(logHeight + direction * 22, window.innerHeight);
  }

  return (
    <div className="blueprint-grid flex h-screen min-h-0 overflow-hidden bg-paper text-ink">
      <IndexRail />
      <div className="flex min-w-0 flex-1 flex-col">
        {topBar}
        {statusBanner}
        <main className="flex min-h-0 flex-1 flex-col overflow-hidden">
          <div className={cn("min-h-0 flex-1 overflow-hidden", logMaximized && "hidden")}>
            {children}
          </div>
          <div
            className={cn(
              "flex min-h-0 shrink-0 flex-col border-t border-rule bg-log-bg",
              !logOpen && "hidden",
              logMaximized && "flex-1",
            )}
            style={logMaximized ? undefined : { height: `${logHeight}px` }}
            aria-hidden={!logOpen}
          >
            {!logMaximized && (
              <div
                role="separator"
                aria-label="调整日志面板高度"
                aria-orientation="horizontal"
                tabIndex={0}
                onPointerDown={handleResizePointerDown}
                onPointerMove={handleResizePointerMove}
                onPointerUp={finishResize}
                onPointerCancel={finishResize}
                onLostPointerCapture={() => {
                  dragRef.current = null;
                }}
                onKeyDown={handleResizeKeyDown}
                className="group flex h-1.5 shrink-0 touch-none cursor-row-resize items-center justify-center bg-log-bg"
              >
                <span className="h-px w-11 bg-rule group-hover:bg-ink3" />
              </div>
            )}
            <div className="min-h-0 flex-1">{logOpen ? logcat : null}</div>
          </div>
        </main>
      </div>
    </div>
  );
}
