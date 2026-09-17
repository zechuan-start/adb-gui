import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import { flushSync } from "react-dom";
import { useLayoutFlip } from "@/hooks/useLayoutFlip";
import {
  beginToolDrag,
  cancelToolDrag,
  commitToolDrag,
  edgeScrollVelocity,
  settleToolDrag,
  updateToolDrag,
  type ToolDragPoint,
  type ToolDragRect,
  type ToolDragState,
} from "@/lib/toolDragController";
import { sameToolOrder, shiftTool, type ToolModuleId } from "@/lib/toolLayout";
import { useUiStore } from "@/store/ui";

export interface ToolDragApi {
  /** Live preview while dragging, otherwise the stored order. */
  order: readonly ToolModuleId[];
  draggingId: ToolModuleId | null;
  /** Dragged, or still landing after a drop: painted above the other modules. */
  liftedId: ToolModuleId | null;
  dragOffset: ToolDragPoint;
  /** Last module moved by keyboard, for the polite live region. */
  announcedId: ToolModuleId | null;
  /** The grid element: offset parent of every module and origin of all measurements. */
  gridRef: RefObject<HTMLDivElement | null>;
  moduleRef: (id: ToolModuleId) => (element: HTMLElement | null) => void;
  handleRef: (id: ToolModuleId) => (element: HTMLButtonElement | null) => void;
  onHeaderPointerDown: (id: ToolModuleId, event: ReactPointerEvent<HTMLElement>) => void;
  onHandleKeyDown: (
    id: ToolModuleId,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => void;
}

const NO_OFFSET: ToolDragPoint = { x: 0, y: 0 };

/**
 * Connects measured module slots to the pure drag controller.
 *
 * Pointer moves are read from `window` rather than through `setPointerCapture`
 * as the log resize handle does. Applying a preview order makes React move the
 * dragged `<section>` between grid slots, and a captured element that is moved
 * in the DOM can lose its capture mid-gesture.
 *
 * Every pointer update is rendered synchronously and settled in a layout
 * effect, so a swap the layout refuses is undone before it is painted and the
 * next pointer event always measures a settled layout.
 */
export function useToolDrag(
  scrollRef: RefObject<HTMLElement | null>,
  active: boolean,
): ToolDragApi {
  const toolOrder = useUiStore((state) => state.toolOrder);
  const setToolOrder = useUiStore((state) => state.setToolOrder);

  const [drag, setDrag] = useState<ToolDragState | null>(null);
  const [announcedId, setAnnouncedId] = useState<ToolModuleId | null>(null);

  const dragRef = useRef<ToolDragState | null>(null);
  const activeRef = useRef(active);
  const pointerIdRef = useRef<number | null>(null);
  const velocityRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const applyPointerRef = useRef<(pointer: ToolDragPoint) => void>(() => {});
  const restoreFocusRef = useRef<ToolModuleId | null>(null);
  const keyboardMoveRef = useRef(false);

  const gridRef = useRef<HTMLDivElement>(null);
  const modulesRef = useRef(new Map<ToolModuleId, HTMLElement>());
  const handlesRef = useRef(new Map<ToolModuleId, HTMLButtonElement>());
  const moduleRefCache = useRef(
    new Map<ToolModuleId, (element: HTMLElement | null) => void>(),
  );
  const handleRefCache = useRef(
    new Map<ToolModuleId, (element: HTMLButtonElement | null) => void>(),
  );

  const { capture, play, landingId } = useLayoutFlip(gridRef, modulesRef);

  useEffect(() => {
    activeRef.current = active;
  }, [active]);

  const moduleRef = useCallback((id: ToolModuleId) => {
    const cached = moduleRefCache.current.get(id);
    if (cached) {
      return cached;
    }
    // Ref callbacks must stay identical between renders, otherwise React
    // detaches and reattaches every module on each pointer move.
    const callback = (element: HTMLElement | null) => {
      if (element) {
        modulesRef.current.set(id, element);
      } else {
        modulesRef.current.delete(id);
      }
    };
    moduleRefCache.current.set(id, callback);
    return callback;
  }, []);

  const handleRef = useCallback((id: ToolModuleId) => {
    const cached = handleRefCache.current.get(id);
    if (cached) {
      return cached;
    }
    const callback = (element: HTMLButtonElement | null) => {
      if (element) {
        handlesRef.current.set(id, element);
      } else {
        handlesRef.current.delete(id);
      }
    };
    handleRefCache.current.set(id, callback);
    return callback;
  }, []);

  /**
   * Reads the grid slot each module occupies, in viewport coordinates.
   *
   * The offset properties ignore transforms, so neither the dragged module's
   * translate nor a running layout animation moves a slot.
   */
  const measure = useCallback((): ToolDragRect[] => {
    const origin = gridRef.current?.getBoundingClientRect();
    if (!origin) {
      return [];
    }
    return [...modulesRef.current].map(([id, element]) => ({
      id,
      x: origin.left + element.offsetLeft,
      y: origin.top + element.offsetTop,
      width: element.offsetWidth,
      height: element.offsetHeight,
    }));
  }, []);

  const commitPreview = useCallback((next: ToolDragState) => {
    dragRef.current = next;
    flushSync(() => setDrag(next));
  }, []);

  const stopEdgeScroll = useCallback(() => {
    velocityRef.current = 0;
    if (scrollFrameRef.current !== null) {
      window.cancelAnimationFrame(scrollFrameRef.current);
      scrollFrameRef.current = null;
    }
  }, []);

  const startEdgeScroll = useCallback(() => {
    function step(): void {
      const container = scrollRef.current;
      const velocity = velocityRef.current;
      const pointer = dragRef.current?.pointer;
      if (!container || velocity === 0 || !pointer) {
        scrollFrameRef.current = null;
        return;
      }
      container.scrollTop += velocity;
      // The grid slid under a stationary pointer, so the drop target changed.
      applyPointerRef.current(pointer);
      scrollFrameRef.current = window.requestAnimationFrame(step);
    }

    if (scrollFrameRef.current === null) {
      scrollFrameRef.current = window.requestAnimationFrame(step);
    }
  }, [scrollRef]);

  const applyPointer = useCallback((pointer: ToolDragPoint) => {
    const current = dragRef.current;
    if (!current) {
      return;
    }
    const next = updateToolDrag(current, pointer, measure());
    if (next.pending) {
      capture();
    }
    commitPreview(next);

    const container = scrollRef.current;
    if (!container || !next.active) {
      stopEdgeScroll();
      return;
    }
    const box = container.getBoundingClientRect();
    velocityRef.current = edgeScrollVelocity(pointer.y, box.top, box.bottom);
    if (velocityRef.current === 0) {
      stopEdgeScroll();
      return;
    }
    startEdgeScroll();
  }, [capture, commitPreview, measure, scrollRef, startEdgeScroll, stopEdgeScroll]);

  useEffect(() => {
    applyPointerRef.current = applyPointer;
  }, [applyPointer]);

  const finishDrag = useCallback((committed: boolean, synchronous: boolean) => {
    const current = dragRef.current;
    pointerIdRef.current = null;
    stopEdgeScroll();
    if (!current) {
      return;
    }
    if (current.active && activeRef.current) {
      capture(current.moved);
    }
    const finish = () => {
      dragRef.current = null;
      setDrag(null);
      setToolOrder(
        committed && current.active ? commitToolDrag(current) : cancelToolDrag(current),
      );
    };
    if (synchronous) {
      flushSync(finish);
    } else {
      finish();
    }
  }, [capture, setToolOrder, stopEdgeScroll]);

  const onHeaderPointerDown = useCallback((
    id: ToolModuleId,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!active || event.button !== 0 || dragRef.current) {
      return;
    }
    const begun = beginToolDrag(
      id,
      { x: event.clientX, y: event.clientY },
      useUiStore.getState().toolOrder,
      measure(),
    );
    pointerIdRef.current = event.pointerId;
    dragRef.current = begun;
    setDrag(begun);
  }, [active, measure]);

  const dragging = drag !== null;

  useEffect(() => {
    if (!dragging) {
      return;
    }
    if (!active) {
      // A hidden pane must not keep window listeners, and its modules measure as
      // empty rectangles, so a gesture that outlives the pane rolls back instead
      // of committing an order resolved against nothing.
      finishDrag(false, false);
      return;
    }

    function onPointerMove(event: PointerEvent): void {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      applyPointer({ x: event.clientX, y: event.clientY });
    }

    function onPointerUp(event: PointerEvent): void {
      if (pointerIdRef.current !== event.pointerId) {
        return;
      }
      finishDrag(true, true);
    }

    function onPointerCancel(): void {
      finishDrag(false, true);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      finishDrag(false, true);
    }

    // WebKit still starts a text selection from a `user-select: none` header
    // once the pointer moves, highlighting text in every module it crosses.
    // It dispatches `selectstart` first, and a cancelled one stops it.
    function onSelectStart(event: Event): void {
      event.preventDefault();
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    // A release outside the window never reports a pointerup.
    window.addEventListener("blur", onPointerCancel);
    document.addEventListener("selectstart", onSelectStart);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onPointerCancel);
      document.removeEventListener("selectstart", onSelectStart);
    };
  }, [active, applyPointer, dragging, finishDrag]);

  useEffect(() => stopEdgeScroll, [stopEdgeScroll]);

  // An order written by someone else, such as the settings dialog, animates
  // too. The store notifies before React commits, so the
  // modules are still painted where they were.
  useEffect(() => useUiStore.subscribe((state, previous) => {
    if (state.toolOrder === previous.toolOrder) {
      return;
    }
    if (keyboardMoveRef.current) {
      keyboardMoveRef.current = false;
      return;
    }
    if (activeRef.current && !dragRef.current) {
      capture();
    }
  }), [capture]);

  useLayoutEffect(() => {
    const current = dragRef.current;
    if (current?.pending) {
      const settled = settleToolDrag(current, measure());
      dragRef.current = settled;
      setDrag(settled);
      return;
    }
    play(current?.active ? current.moved : null);
  }, [drag, measure, play, toolOrder]);

  const onHandleKeyDown = useCallback((
    id: ToolModuleId,
    event: ReactKeyboardEvent<HTMLButtonElement>,
  ) => {
    // Ctrl/Cmd keeps bare arrow keys available for normal header navigation.
    if (!(event.metaKey || event.ctrlKey) || event.altKey) {
      return;
    }
    const delta = event.key === "ArrowLeft" ? -1 : event.key === "ArrowRight" ? 1 : null;
    if (delta === null) {
      return;
    }
    event.preventDefault();

    const current = useUiStore.getState().toolOrder;
    const next = shiftTool(current, id, delta);
    if (sameToolOrder(current, next)) {
      return;
    }
    // A keyboard move can repeat many times a second; it stays instant.
    keyboardMoveRef.current = true;
    setToolOrder(next);
    setAnnouncedId(id);
    // Reordering moves the button's DOM node, which drops focus.
    restoreFocusRef.current = id;
  }, [setToolOrder]);

  useEffect(() => {
    const id = restoreFocusRef.current;
    if (!id) {
      return;
    }
    restoreFocusRef.current = null;
    handlesRef.current.get(id)?.focus();
  }, [toolOrder]);

  const activeDrag = drag?.active === true;
  const draggingId = activeDrag && drag ? drag.moved : null;

  return {
    order: activeDrag && drag ? drag.previewOrder : toolOrder,
    draggingId,
    liftedId: draggingId ?? landingId,
    dragOffset: activeDrag && drag ? drag.offset : NO_OFFSET,
    announcedId,
    gridRef,
    moduleRef,
    handleRef,
    onHeaderPointerDown,
    onHandleKeyDown,
  };
}
