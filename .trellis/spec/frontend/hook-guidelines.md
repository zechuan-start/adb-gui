# Hook Guidelines

> Hook usage patterns.

---

## Overview

Custom hooks live in `src/hooks/` when they own a reusable external lifecycle. Shared application state remains in Zustand stores; hooks orchestrate effects and do not become a second state owner.

---

## 常用 Hooks

- `useState` — 组件局部 UI 状态 (busy, lastPath 等)
- `useEffect` — 初始化数据获取, 事件监听, 定时器
- `useCallback` — 稳定引用 (配合 useEffect 依赖)
- `useMemo` — 派生计算 (如 adbLabel, selected device)

---

## Data Fetching

不使用 React Query / SWR. 数据获取模式:

```tsx
useEffect(() => {
  someCommand().then(setSomeState).catch(console.error);
}, []);
```

## Tauri Runtime Effects

Automatic Tauri commands, listeners, and polling effects must check `isTauriRuntime()` before starting. Plain Vite or Python-served previews do not inject Tauri IPC and must remain usable for visual review without raw `invoke` or `transformCallback` error toasts.

```tsx
useEffect(() => {
  if (!isTauriRuntime()) {
    return;
  }
  return startTauriLifecycle();
}, []);
```

This boundary applies only to automatic background work. Do not mock successful command results or add a fallback command source. User-triggered desktop operations keep their existing explicit error feedback.

When listener registration is asynchronous, runtime gating alone is insufficient. The event callback and registration error path must also read the current enabled state, and a registration that resolves after cleanup must immediately call its returned unlisten function. This prevents a partially registered Tauri listener from acting on a pane that became inactive while registration was pending.

## Streaming Lifecycles

`useLogcatStream` connects React device selection to the pure `logcatStreamController`. Keep event listeners, start/stop commands, animation-frame scheduling, and stale-session rejection in the controller so they can be tested in the Node Vitest environment without rendering React.

- Register `logcat-batch` and `logcat-exit` listeners before calling `startLogcat`; the initial `-T 5000` burst can otherwise be lost.
- Event callbacks only enqueue bounded data and request a frame. They must not call Zustand actions directly.
- Buffer events that arrive before `startLogcat` returns, then filter them by the returned `session_id`.
- Cleanup is idempotent. If cleanup occurs while start is pending, precisely stop the late `{ serial, session_id }` when it returns.
- Use a logical queue head plus occasional compaction for bounded hot-path queues; repeated `Array.shift()` is O(window).
- Inject listener, command, and frame functions into the pure controller and unit-test early events, disposal, A -> B -> A, capacity, and same-frame exit behavior.

## Animation-Driven UI Lifecycles

`useFollowScroll` keeps React refs and event adapters thin while `followScrollController` owns scroll intent, anchoring, and frame cancellation. Use this split when lifecycle behavior has timing races that can be tested without a browser renderer.

- Buffer high-frequency events and mutable DOM measurements in refs, then coalesce writes into `requestAnimationFrame`; do not write Zustand state for every event.
- When a detached view retains an `anchoredSeq`, compensate an index change synchronously from `useLayoutEffect` by calling `measureNow()`. A passive effect plus a later animation frame allows the FIFO-updated DOM to paint once at the stale `scrollTop`, which makes old and new rows flash on every batch.
- Keep the layout and animation-frame paths mutually exclusive: detached views with an anchor use the layout path; follow mode and detached views without an anchor keep the coalesced animation-frame path.
- Inject `requestFrame`, `cancelFrame`, and element access into the pure controller so frame ordering and stale callbacks are deterministic in Vitest.
- A controller created during render and retained in `useRef` must have repeatable cleanup. React StrictMode can run effect cleanup and setup again with the same controller, so cleanup cancels outstanding work but must not permanently disable later scheduling.
- Cancel every outstanding frame lease during cleanup, including delayed programmatic-scroll guards and user-intent windows. Hidden tabs can otherwise replay stale scroll writes when shown again.
- A FIFO anchor regression must assert both layers: the controller immediately shifts `scrollTop` after a 10,000-row head eviction, and the hook routes anchored revisions through the layout effect without scheduling the passive animation frame. Calling `measureNow()` directly in a controller-only test does not cover the paint-timing bug.

## Scenario: Pointer Drag Reordering

### 1. Scope / Trigger

- Trigger: adding or changing a pointer-driven reorder surface whose order persists, such as the tools grid.
- Applies to `lib/toolLayout.ts`, `lib/toolDragController.ts`, `hooks/useToolDrag.ts`, `components/ToolWorkbench.tsx`, and any future draggable list or grid.

### 2. Signatures

- `beginToolDrag(moved, pointer, order, rects) -> ToolDragState`
- `updateToolDrag(state, pointer, rects) -> ToolDragState`
- `commitToolDrag(state) -> readonly Id[]` returns `previewOrder`
- `cancelToolDrag(state) -> readonly Id[]` returns `originOrder`
- `edgeScrollVelocity(pointerY, top, bottom) -> number`, negative upward, `0` outside both edge bands
- `moveTool(order, moved, target) -> Id[]`, `shiftTool(order, moved, delta: 1 | -1) -> Id[]`
- `useToolDrag(scrollRef, active) -> { order, draggingId, dragOffset, announcedId, moduleRef, handleRef, onHeaderPointerDown, onHandleKeyDown }`

### 3. Contracts

- Every reordering decision lives in a pure function that takes measured rectangles. The project has no jsdom, so a hook that decides anything cannot be tested. The hook measures, listens, and forwards.
- Measure the dragged element's **slot**, not its painted box. `getBoundingClientRect()` includes the element's own translate, so subtract the offset the last render applied.
- Resolve the drop target by nearest rectangle centre, not by "rectangle contains pointer": grid gaps would otherwise produce pointer positions with no target.
- Read the insertion index in the pre-removal array, then remove, then insert at that index. Removal shifts later elements left by one, which yields "after the target" for a forward drag and "before the target" for a backward drag without a direction branch.
- Anchor the lift to the module's current slot (`pointer - slot - grab`), and to the target's slot on the frame that swaps. Anchoring to the press point makes the element jump away from the cursor after every swap.
- Take pointer moves from `window` listeners, not `setPointerCapture`. Applying a preview order makes React move the dragged element between slots, and a captured element moved in the DOM can lose its capture. `setPointerCapture` remains correct for a handle that never moves, such as the log resize separator.
- Gate those listeners on the pane's `active` flag and roll the gesture back when it clears, per **Persistent Hidden Panes**. A hidden pane measures as empty rectangles, so a surviving gesture would commit an order resolved against nothing.
- Cache ref callbacks per id. A fresh callback each render makes React detach and reattach every element on every pointer move.
- Key rows by domain id and memoise their bodies by anything other than order, so a reorder moves the existing DOM subtree instead of remounting it and restarting timers or polls.
- A control whose visibility depends on the order must read the **committed** order. Driving it from the preview makes it appear mid-gesture; if it sits in the scroll flow it then shifts every drop target under a stationary pointer.

### 4. Validation & Error Matrix

- Travel at or below `DRAG_ACTIVATION_DISTANCE` (4 px) -> stays a click; `active` false, `offset` zero, preview equals the original order.
- Pointer resting in a grid gap -> nearest centre still resolves a target.
- Nearest rectangle is the dragged module itself -> no swap, and the target lock releases so the previous target can win again on the way back.
- Nearest rectangle equals `lockedTarget` -> no second swap, which is what stops two modules oscillating under one stale measurement.
- Escape, `pointercancel`, or window blur -> `cancelToolDrag`; a release outside the window never reports `pointerup`.
- Pane becomes inactive mid-gesture -> cancel and unbind.
- No rectangles measured -> preview unchanged rather than an arbitrary target.

### 5. Good/Base/Bad Cases

- Good: dragging a module onto a neighbour's centre swaps exactly once, and holding the pointer still afterwards leaves the preview alone.
- Base: pressing a header and releasing without moving writes nothing to the store, because the equal-order guard in the store short-circuits.
- Bad: passing `getBoundingClientRect()` through unmodified makes the dragged element measure closest to the pointer at all times, its own dead zone swallows every target, and no drag ever reorders anything.
- Bad: committing the preview order to the store on each pointer move persists intermediate states and makes Escape unable to roll back.

### 6. Tests Required

- Pure controller tests drive constructed rectangles and assert the activation threshold, gap resolution, the self branch, lock behaviour, lift anchoring on the swap frame, commit/cancel return values, and edge-scroll velocity including the clamp beyond each edge.
- Order-algebra tests assert forward and backward drags, both ends, a no-op onto itself, and clamping at both ends of a keyboard shift.
- Everything DOM-coupled needs a browser smoke: transform compensation, no remount on reorder (assert typed local state survives), no layout shift mid-gesture, edge auto-scroll reaching the first slot, keyboard reordering with focus restoration and a live-region announcement, and recovery from a corrupt stored order. `scripts/screenshots/toolDragSmoke.mjs` runs these after the main smoke in `pnpm test:browser`.

### 7. Wrong vs Correct

#### Wrong

```typescript
const rects = elements.map((element, id) => {
  const box = element.getBoundingClientRect();
  return { id, x: box.left, y: box.top, width: box.width, height: box.height };
});
```

#### Correct

```typescript
const rects = elements.map((element, id) => {
  const box = element.getBoundingClientRect();
  const dragged = lifted?.moved === id;
  return {
    id,
    x: box.left - (dragged ? lifted.offset.x : 0),
    y: box.top - (dragged ? lifted.offset.y : 0),
    width: box.width,
    height: box.height,
  };
});
```

---

事件监听 (Tauri events):

```tsx
useEffect(() => {
  let disposed = false;
  let unlisten: (() => void) | null = null;
  void onSomeEvent((data) => setState(data))
    .then((nextUnlisten) => {
      if (disposed) {
        nextUnlisten();
        return;
      }
      unlisten = nextUnlisten;
    })
    .catch((error) => {
      if (!disposed) reportListenerError(error);
    });
  return () => {
    disposed = true;
    unlisten?.();
    unlisten = null;
  };
}, []);
```

---

## Naming Conventions

- Zustand store hooks: `use<Domain>Store`
- Custom lifecycle hooks: `use<Feature>` (如 `useLogcatStream`, `useFollowScroll`)

---

## Common Mistakes

- `useEffect` 中 async 函数需要包装: `void asyncFn()` 或 IIFE.
- 忘记在 useEffect 中返回 cleanup (尤其是 `listen` 和 `setInterval`).
- Zustand selector 应使用 `(s) => s.field` 而非 destructure 整个 store (避免不必要 re-render).
- Do not let a custom lifecycle hook keep another copy of domain state already owned by a store.

### Persistent Hidden Panes

Keeping page components mounted preserves local form and scroll state, but `display: none` does not suspend their effects. Every window-, document-, or Tauri-level listener must accept an `active` input and unregister when its pane is inactive. This is required for drag-drop, paste, and keyboard shortcuts so hidden panes cannot consume events intended for the visible pane.

```tsx
useEffect(() => {
  if (!active) {
    return;
  }
  return onGlobalEvent(handleEvent);
}, [active, handleEvent]);
```

Use a current ref when an asynchronous listener can emit between render and passive-effect cleanup. Both the callback and delayed rejection path must reject work while the pane is inactive. Automatic reads owned by a pane must also invalidate their request generation, or check the current active state and request id, before committing results or displaying errors.

Virtualized panes must re-measure when they become visible because measurements taken under `display: none` are invalid. Tests must cover state preservation with a real browser and verify that only the active pane responds to global input.
