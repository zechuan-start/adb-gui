import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from "react";
import {
  beginToolDrag,
  cancelToolDrag,
  commitToolDrag,
  edgeScrollVelocity,
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
  dragOffset: ToolDragPoint;
  /** Last module moved by keyboard, for the polite live region. */
  announcedId: ToolModuleId | null;
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
 * Connects measured module rectangles to the pure drag controller.
 *
 * Pointer moves are read from `window` rather than through `setPointerCapture`
 * as the log resize handle does. Applying a preview order makes React move the
 * dragged `<section>` between grid slots, and a captured element that is moved
 * in the DOM can lose its capture mid-gesture.
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
  const pointerIdRef = useRef<number | null>(null);
  const pointerRef = useRef<ToolDragPoint | null>(null);
  const velocityRef = useRef(0);
  const scrollFrameRef = useRef<number | null>(null);
  const applyPointerRef = useRef<(pointer: ToolDragPoint) => void>(() => {});
  const restoreFocusRef = useRef<ToolModuleId | null>(null);

  const modulesRef = useRef(new Map<ToolModuleId, HTMLElement>());
  const handlesRef = useRef(new Map<ToolModuleId, HTMLButtonElement>());
  const moduleRefCache = useRef(
    new Map<ToolModuleId, (element: HTMLElement | null) => void>(),
  );
  const handleRefCache = useRef(
    new Map<ToolModuleId, (element: HTMLButtonElement | null) => void>(),
  );

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
   * Reads the grid slots each module occupies.
   *
   * The dragged module carries a translate, and `getBoundingClientRect` reports
   * it. Subtracting the transform the last render painted gives back its slot
   * rectangle, so the module keeps a stable dead zone over its own cell instead
   * of following the pointer and winning every hit test.
   */
  const measure = useCallback((applied: ToolDragState | null): ToolDragRect[] => {
    const lifted = applied?.active === true ? applied : null;

    const rects: ToolDragRect[] = [];
    for (const [id, element] of modulesRef.current) {
      const box = element.getBoundingClientRect();
      const dragged = lifted?.moved === id;
      rects.push({
        id,
        x: box.left - (dragged ? lifted.offset.x : 0),
        y: box.top - (dragged ? lifted.offset.y : 0),
        width: box.width,
        height: box.height,
      });
    }
    return rects;
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
      const pointer = pointerRef.current;
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
    pointerRef.current = pointer;
    const next = updateToolDrag(current, pointer, measure(current));
    dragRef.current = next;
    setDrag(next);

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
  }, [measure, scrollRef, startEdgeScroll, stopEdgeScroll]);

  useEffect(() => {
    applyPointerRef.current = applyPointer;
  }, [applyPointer]);

  const finishDrag = useCallback((committed: boolean) => {
    const current = dragRef.current;
    dragRef.current = null;
    pointerIdRef.current = null;
    pointerRef.current = null;
    stopEdgeScroll();
    setDrag(null);
    if (!current) {
      return;
    }
    setToolOrder(
      committed && current.active ? commitToolDrag(current) : cancelToolDrag(current),
    );
  }, [setToolOrder, stopEdgeScroll]);

  const onHeaderPointerDown = useCallback((
    id: ToolModuleId,
    event: ReactPointerEvent<HTMLElement>,
  ) => {
    if (!active || event.button !== 0 || dragRef.current) {
      return;
    }
    const pointer = { x: event.clientX, y: event.clientY };
    const begun = beginToolDrag(
      id,
      pointer,
      useUiStore.getState().toolOrder,
      measure(null),
    );
    pointerIdRef.current = event.pointerId;
    pointerRef.current = pointer;
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
      finishDrag(false);
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
      finishDrag(true);
    }

    function onPointerCancel(): void {
      finishDrag(false);
    }

    function onKeyDown(event: KeyboardEvent): void {
      if (event.key !== "Escape") {
        return;
      }
      event.preventDefault();
      finishDrag(false);
    }

    window.addEventListener("pointermove", onPointerMove);
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
    window.addEventListener("keydown", onKeyDown);
    // A release outside the window never reports a pointerup.
    window.addEventListener("blur", onPointerCancel);

    return () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("blur", onPointerCancel);
    };
  }, [active, applyPointer, dragging, finishDrag]);

  useEffect(() => stopEdgeScroll, [stopEdgeScroll]);

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

  return {
    order: activeDrag && drag ? drag.previewOrder : toolOrder,
    draggingId: activeDrag && drag ? drag.moved : null,
    dragOffset: activeDrag && drag ? drag.offset : NO_OFFSET,
    announcedId,
    moduleRef,
    handleRef,
    onHeaderPointerDown,
    onHandleKeyDown,
  };
}
