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

- Trigger: adding or changing a pointer-driven reorder surface whose order persists, such as the tools grid, or animating elements that move when a layout changes.
- Applies to `lib/toolLayout.ts`, `lib/toolDragController.ts`, `lib/layoutFlip.ts`, `lib/motion.ts`, `hooks/useToolDrag.ts`, `hooks/useLayoutFlip.ts`, `components/ToolWorkbench.tsx`, and any future draggable list or grid.

### 2. Signatures

- `beginToolDrag(moved, pointer, order, rects) -> ToolDragState`
- `updateToolDrag(state, pointer, rects) -> ToolDragState`, sets `pending` when it swaps
- `settleToolDrag(state, rects) -> ToolDragState`, keeps or undoes `pending` against the new layout
- `commitToolDrag(state) -> readonly Id[]` returns `previewOrder`
- `cancelToolDrag(state) -> readonly Id[]` returns `originOrder`
- `edgeScrollVelocity(pointerY, top, bottom) -> number`, negative upward, `0` outside both edge bands
- `moveTool(order, moved, target) -> Id[]`, `shiftTool(order, moved, delta: 1 | -1) -> Id[]`
- `planLayoutFlip(first, last, heading) -> { id, from: Point | null }[]`
- `useLayoutFlip(container, elements) -> { capture(landing?), play(exclude), landingId }`
- `useToolDrag(scrollRef, active) -> { order, draggingId, liftedId, dragOffset, announcedId, gridRef, moduleRef, handleRef, onHeaderPointerDown, onHandleKeyDown }`

### 3. Contracts

- Every reordering decision lives in a pure function that takes measured rectangles. The project has no jsdom, so a hook that decides anything cannot be tested. The hook measures, listens, and forwards.
- Measure **slots** with `offsetLeft/offsetTop/offsetWidth/offsetHeight` plus the grid origin, with the grid `relative` so it is the offset parent. Those properties ignore transforms, so neither the dragged element's translate nor a running layout animation moves a hit target.
- A target is the rectangle that **contains** the pointer. Pull a pointer outside the grid onto its edge first, so edge auto-scroll, which leaves the pointer above the grid, still reaches the first slot. A pointer in a gap or in the hole a wide item leaves changes nothing.
- Nearest-centre resolution is wrong once items differ in size: the swap reflows the grid, another centre becomes nearest in the new layout, and the order flips on every pointer step. A one-target lock does not help, because the flip alternates between two targets.
- Every swap is tentative. Render it, then in a layout effect keep it only if the dragged item's new slot contains the (edge-pulled) pointer; otherwise restore the previous order. After an accepted swap the pointer is inside the dragged slot, so the next swap needs the pointer to leave it first, and alternation is impossible by construction. The lift offset is always computed from a measured slot, never predicted from the target's old one.
- Commit pointer updates with `flushSync`, so the tentative render and its settle finish before the next pointer event measures. Do not call `flushSync` from an effect; the hidden-pane cancel path updates normally.
- Take pointer moves from `window` listeners, not `setPointerCapture`. Applying a preview order makes React move the dragged element between slots, and a captured element moved in the DOM can lose its capture. `setPointerCapture` remains correct for a handle that never moves, such as the log resize separator.
- Gate those listeners on the pane's `active` flag and roll the gesture back when it clears, per **Persistent Hidden Panes**. A hidden pane measures as empty rectangles, so a surviving gesture would commit an order resolved against nothing.
- Cancel `selectstart` on `document` for as long as a drag is in progress, and only then. `user-select: none` on the drag surface is not enough in WebKit (the Tauri macOS webview): it still lets a selection start from that surface once the pointer moves, and highlights text in every element the pointer crosses. Chromium does not, so a Chromium-only smoke never shows the bug.
- Cache ref callbacks per id. A fresh callback each render makes React detach and reattach every element on every pointer move.
- Key rows by domain id and memoise their bodies by anything other than order, so a reorder moves the existing DOM subtree instead of remounting it and restarting timers or polls.
- A control whose visibility depends on the order must read the **committed** order, never the preview.
- Layout motion is FLIP with WAAPI, following the `animate` skill in emilkowalski/skills: `transform` only, `lib/motion.ts` curves and durations (displacement `EASE_IN_OUT` 200 ms, a dropped item landing `EASE_OUT` 200 ms), no motion library.
  - `capture` the painted positions (`getBoundingClientRect`, relative to the grid) before the DOM changes: before a tentative swap, before a drop or cancel, and from a synchronous `useUiStore.subscribe` listener for orders written elsewhere (the settings dialog). The first capture wins until `play` consumes it, so a drop's landing mark survives the store notification it causes.
  - `play` runs in the same layout effect after the settle, so the inverted frame is the first one painted. It skips an element already animating toward the same slot, and restarts or stops one whose slot changed, because its keyframes are relative to the slot it left.
  - Animations use `composite: "add"`, so an item grabbed again while it lands keeps its inline drag transform and glides onto the pointer.
  - Keep a landing item lifted (`z-10`, opaque) until its animation finishes or is cancelled.
  - Keyboard reordering stays instant: it can repeat many times a second. `prefers-reduced-motion: reduce` skips every layout animation, because they are all movement. The global CSS reduced-motion rule does not reach WAAPI, so the hook checks `matchMedia` itself.

### 4. Validation & Error Matrix

- Travel at or below `DRAG_ACTIVATION_DISTANCE` (4 px) -> stays a click; `active` false, `offset` zero, preview equals the original order.
- Pointer in a grid gap or a wide-item hole -> preview unchanged, no `pending`.
- Pointer over the dragged item's own slot -> preview unchanged.
- Pointer outside the grid -> pulled onto the nearest edge before hit testing.
- Swap whose new slot does not contain the pointer -> `settleToolDrag` restores `pending.order` and computes the offset from `pending.slot`.
- Escape, `pointercancel`, or window blur -> `cancelToolDrag`; a release outside the window never reports `pointerup`.
- Pane becomes inactive mid-gesture -> cancel and unbind, no capture.
- No rectangles measured -> preview unchanged rather than an arbitrary target.
- Element painted within 1 px of its slot with no running animation -> no animation.

### 5. Good/Base/Bad Cases

- Good: sweeping a narrow item across a two-column item in 20 px steps changes the order once per slot actually entered, and the lifted item stays within 2 px of the pointer on every frame.
- Base: pressing a header and releasing without moving writes nothing to the store, because the equal-order guard in the store short-circuits.
- Bad: measuring with `getBoundingClientRect()` makes running layout animations and the dragged translate move the hit targets.
- Bad: offsetting the lift by the target's pre-swap slot; with mixed sizes the item lands elsewhere and is painted a whole column away from the pointer.
- Bad: committing the preview order to the store on each pointer move persists intermediate states and makes Escape unable to roll back.

### 6. Tests Required

- Pure controller tests use a sparse grid auto-placement helper with a wide item and assert: the activation threshold, gap and hole no-ops, the self branch, edge pulling, pending contents, settle accept with a measured offset, settle refusal with the previous order and offset, and a full sweep across the wide item that changes order a bounded number of times without undoing a swap on pixel jitter.
- `planLayoutFlip` tests cover the 1 px threshold, an animation heading to the same slot left alone, a retarget from the painted position, a stop without a new animation, and elements not painted before.
- Order-algebra tests assert forward and backward drags, both ends, a no-op onto itself, and clamping at both ends of a keyboard shift.
- Everything DOM-coupled needs a browser smoke: no remount on reorder (typed local state survives), edge auto-scroll reaching the first slot, keyboard reordering with focus restoration and a live-region announcement, recovery from a corrupt stored order, a `selectstart` dispatched into a module body being cancelled during a drag and not at rest, the wide-item sweep sampled per frame, animations present with motion allowed and absent with reduced motion or a keyboard move, a landing item lifted then settled with no leftover transform, and both reset entries. `scripts/screenshots/toolDragSmoke.mjs` runs these after the main smoke in `pnpm test:browser`.

### 7. Wrong vs Correct

#### Wrong

```typescript
const target = nearestCentre(pointer, rects);
if (target !== state.moved && target !== state.lockedTarget) {
  return { ...state, previewOrder: moveTool(order, moved, target), lockedTarget: target };
}
```

#### Correct

```typescript
// Pointer update: propose.
const next = updateToolDrag(current, pointer, measureSlots());
if (next.pending) flip.capture();
flushSync(() => setDrag(next));

// Layout effect: confirm against the layout the proposal produced, then animate.
if (drag.pending) {
  setDrag(settleToolDrag(drag, measureSlots()));
  return;
}
flip.play(drag.active ? drag.moved : null);
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
