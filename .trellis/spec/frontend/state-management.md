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

---

## 何时用全局 vs 局部

- **全局 (Zustand)**: 多个组件共享的数据 (设备列表, 选中状态, toast).
- **局部 (useState)**: 单组件 UI 状态 (loading/busy, 表单值, 展开/收起).

---

## 派生状态

通过 `useMemo` 在组件内计算, 或在 store 的 setter 中同步计算 (如 `setCurrentActivity` 同时解析 `currentPackage`).

---

## Common Mistakes

- 不要在 store 中存放可以从其他 store 字段直接派生的数据, 除非有性能原因.
- 使用 selector 订阅具体字段: `useDeviceStore((s) => s.selectedDevice)` 而非 `useDeviceStore()`.
