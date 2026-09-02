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
