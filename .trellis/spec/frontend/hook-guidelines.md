# Hook Guidelines

> Hook usage patterns.

---

## Overview

当前项目无自定义 hooks 文件. 共享状态通过 Zustand store hooks (`useDeviceStore`, `useFeedbackStore`) 实现. 组件内逻辑直接用 React 内置 hooks.

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

事件监听 (Tauri events):

```tsx
useEffect(() => {
  let unlisten: (() => void) | null = null;
  onSomeEvent((data) => setState(data)).then((fn) => { unlisten = fn; });
  return () => { unlisten?.(); };
}, []);
```

---

## Naming Conventions

- Zustand store hooks: `use<Domain>Store`
- 如果未来抽取自定义 hook: `use<Feature>` (如 `usePolling`, `useDeviceActivity`)

---

## Common Mistakes

- `useEffect` 中 async 函数需要包装: `void asyncFn()` 或 IIFE.
- 忘记在 useEffect 中返回 cleanup (尤其是 `listen` 和 `setInterval`).
- Zustand selector 应使用 `(s) => s.field` 而非 destructure 整个 store (避免不必要 re-render).
