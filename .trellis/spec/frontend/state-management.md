# State Management

> Zustand v5 as global state; React useState for local.

---

## Overview

- **全局状态**: Zustand v5 (`create<StoreInterface>()`)
- **局部状态**: React `useState`
- 无 Context, 无 Redux, 无 server state cache (React Query 等)

---

## Stores

| Store | 文件 | 职责 |
|-------|------|------|
| `useDeviceStore` | `store/device.ts` | 设备列表, 选中设备, 当前 Activity/Package |
| `useFeedbackStore` | `store/feedback.ts` | Toast 通知 (kind + message) |
| `useThemeStore` | `store/theme.ts` | 明/暗主题切换 |
| `useCodeGeneratorStore` | `store/codeGenerator.ts` | 生码草稿、修订版本和最近一次生成快照 (无持久化) |
| `useLogcatStore` | `store/logcat.ts` | Logcat session identity, ring buffer, incremental filter index, and stream state |

---

## Store 模式

```typescript
import { create } from "zustand";

interface SomeStore {
  value: string;
  setValue: (v: string) => void;
}

export const useSomeStore = create<SomeStore>((set) => ({
  value: "",
  setValue: (v) => set({ value: v }),
}));
```

### High-Frequency Mutable Buffers

`useLogcatStore` is the exception to the usual immutable-object pattern. Its fixed-capacity `LogcatRingBuffer` and sorted `filteredSeqs` index mutate in place so each Logcat batch remains O(batch size), not O(window size). Every mutation that affects rendered rows must increment `revision`; consumers subscribe to `revision` and counters, then resolve rows by `seq`.

```typescript
set((state) => {
  appendEntries(state, entries);
  return {
    totalCount: state.buffer.count,
    filteredCount: state.filteredSeqs.length - state.filteredHead,
    revision: state.revision + 1,
  };
});
```

The stream controller calls `flushFrame(lines, sessionId, disconnectDetail)` once per animation frame. That action validates `sessionId` and commits final lines plus a same-frame disconnect in one Zustand `set`. Paused rows remain raw backend lines and receive contiguous `seq` values only when resumed. While paused, incoming frames may update only the bounded pending queue and backlog count; they must preserve the visible buffer, filtered index, `revision`, `nextSeq`, follow mode, and anchor.

### Logcat Sequence Identity

`nextSeq` is the only allocator for `LogcatEntry.seq`. Sequence values are monotonically increasing for the lifetime of the frontend store and are never reused because `seq` is both the virtual-list key and the filter-index address.

- `clearScreen()`, `restart()`, and `reset()` clear their scoped data but preserve `nextSeq`.
- `LogcatRingBuffer.clear()` may reset its internal `baseSeq`; the first subsequent `push()` adopts the entry's globally allocated `seq`.
- Tests must append before and after clear, restart, and device reset, then assert that the resulting sequence values remain strictly increasing.

```typescript
// Wrong: reuses keys from an earlier window.
return { buffer: new LogcatRingBuffer(), nextSeq: 0 };

// Correct: Zustand merges this reset while preserving nextSeq.
return { buffer: new LogcatRingBuffer() };
```

---

## 何时用全局 vs 局部

- **全局 (Zustand)**: 多个组件共享的数据 (设备列表, 选中状态, toast).
- **会话级 (Zustand, no persistence middleware)**: 顶层页签卸载后仍需保留, 但应用重启后应清空的数据.
- **局部 (useState)**: 单组件 UI 状态 (loading/busy, 表单值, 展开/收起).

---

## 派生状态

通过 `useMemo` 在组件内计算, 或在 store 的 setter 中同步计算 (如 `setCurrentActivity` 同时解析 `currentPackage`).

---

## Common Mistakes

- 不要在 store 中存放可以从其他 store 字段直接派生的数据, 除非有性能原因.
- 使用 selector 订阅具体字段: `useDeviceStore((s) => s.selectedDevice)` 而非 `useDeviceStore()`.
- 草稿驱动昂贵批处理时, 将可编辑草稿与已提交结果快照分开. Setter 只更新草稿和 revision, 显式 action 才替换结果快照.
- Do not replace the Logcat ring or filter index with copied arrays on each batch; that restores O(window) work on the hot path.
- Do not mutate Logcat render data without incrementing `revision`.
- Do not increment `revision` or mutate visible Logcat data for paused incoming frames; a selected viewport must remain a stable snapshot until resume.
- Do not derive session freshness from serial alone; every batch, exit, and stop must use the current `sessionId`.
- Do not reset `nextSeq` when clearing the Logcat window or replacing a session/device.
