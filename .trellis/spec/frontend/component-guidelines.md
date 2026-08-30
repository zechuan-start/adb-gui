# Component Guidelines

> React functional component conventions.

---

## Overview

所有组件使用函数声明 (`export function ComponentName()`), 不使用 `React.FC`. 无 class 组件.

---

## Component Structure

典型组件结构:

```tsx
import { useState } from "react";
import { SomeIcon } from "lucide-react";
import { useDeviceStore } from "@/store/device";
import { someFunction } from "@/lib/tauri";
import { useFeedbackStore } from "@/store/feedback";
import { cn } from "@/lib/utils";

export function ToolName() {
  // 1. Store hooks
  const selectedDevice = useDeviceStore((s) => s.selectedDevice);
  const showToast = useFeedbackStore((s) => s.showToast);

  // 2. Local state
  const [busy, setBusy] = useState(false);

  // 3. Handlers
  async function handleAction() {
    if (!selectedDevice || busy) return;
    setBusy(true);
    try {
      await someFunction(selectedDevice);
      showToast("success", "完成");
    } catch (error) {
      showToast("error", `失败: ${error}`);
    } finally {
      setBusy(false);
    }
  }

  // 4. JSX
  return (
    <section className="rounded-lg border border-border bg-card p-4">
      {/* ... */}
    </section>
  );
}
```

---

## Props Conventions

- 当前组件多为无 props 的顶层工具面板, 通过 store 获取数据.
- 如需 props, 使用 inline interface 或 type:

```tsx
interface Props {
  serial: string;
  onDone?: () => void;
}
export function SomeComponent({ serial, onDone }: Props) { ... }
```

---

## Styling Patterns

- **TailwindCSS v4** (通过 `@tailwindcss/vite` 插件).
- 条件 class 使用 `cn()` (clsx + tailwind-merge):

```tsx
<button className={cn("base-classes", active && "active-classes")} />
```

- 语义 token: `bg-background`, `text-foreground`, `bg-card`, `border-border`, `text-muted-foreground` 等.
- 不使用 CSS Modules 或 styled-components.
- 响应式: `lg:grid-cols-[55fr_45fr]` 等 Tailwind 断点.

---

## 图标

使用 `lucide-react`, 统一 `className="h-4 w-4"` 尺寸.

---

## Virtualized Streaming Lists

- Virtualized row components must be wrapped in `memo` and receive only row-local props. A row must not subscribe to stream-wide counters such as `pausedBacklog`, `totalCount`, or `revision`, because those values would repaint every visible row during high-frequency input.
- Keep row identity stable with the domain sequence key, not the current array index. Parent callbacks and column objects passed to memoized rows must remain referentially stable unless their behavior actually changes.
- Dynamic measurement must have an explicit feature gate. For Logcat, `softWrap=false` is the fixed 20 px fast path: do not attach `measureElement`, call `measure()`, or schedule measurement compensation.
- When dynamic measurement is enabled, provide the virtualizer's required `data-index`, measure after mount/layout, and batch scroll compensation through one animation frame. Re-measure after a hidden persistent panel becomes visible, because `display: none` invalidates layout measurements.

```tsx
const LogcatRow = memo(LogcatRowView);

<div
  ref={softWrap ? virtualizer.measureElement : undefined}
  data-index={virtualItem.index}
  style={{ height: softWrap ? undefined : `${LOGCAT_ROW_HEIGHT}px` }}
/>
```

The fixed and measured paths must stay visibly separate. Adding a measurement fallback to the fixed path reintroduces layout work and scroll instability even when wrapping is disabled.

---

## Common Mistakes

- 不要在组件中直接 `import { invoke } from "@tauri-apps/api/core"`, 通过 `lib/tauri.ts` 调用.
- 不要用 `useEffect` 做数据获取后忘记 cleanup (事件监听必须返回 unlisten).
- `button` 必须带 `type="button"` 防止表单提交.
