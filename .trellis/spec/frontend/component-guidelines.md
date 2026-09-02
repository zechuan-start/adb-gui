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

### Derived Logcat Render Items

Crash folding is a presentation transform over the filtered sequence. Keep `filteredSeqs` and `filteredCount` as the query source of truth, then derive `LogcatRenderItem[]` for the virtualizer. Once folding is enabled, the virtualizer's `count`, `getItemKey`, row lookup, and anchor index must all use the render items; mixing a filtered index with a folded render index shifts anchors to the wrong row.

```tsx
const renderItems = groupCrashTraces({ buffer, filteredSeqs, autoFold, expandedCrashSeqs });

useVirtualizer({
  count: renderItems.length,
  getItemKey: (index) => renderItems[index].seq,
  estimateSize: () => rowHeight,
});
```

If a fixed cozy mode changes row height, pass the same `rowHeight` to `estimateSize`, the outer row style, the fixed item-offset resolver, and follow-scroll anchoring. The default non-wrapped path remains exactly 20 px.

### Native Logcat Selection

- Put `select-text` only on the message span and keep every metadata field `select-none`.
- On message `pointerdown`, detach follow immediately without `preventDefault` or pointer capture so browser-native cross-row selection can continue.
- On `pointerup`, inspect `window.getSelection()` before toggling `selectedSeq`; a non-empty native selection always wins.
- On Cmd/Ctrl+C, leave editable targets and native selections to the browser. Intercept only when a complete row identified by `selectedSeq` should be copied.

### Themed Option Menus

Use `BlueprintSelect` when an expanded option menu must match the Blueprint light and dark themes. A native `<select>` hands the expanded menu to macOS, so its blue selection, rounded corners, font, and shadow cannot follow application tokens.

```tsx
<BlueprintSelect
  value={separatorMode}
  options={SEPARATOR_OPTIONS}
  onValueChange={setSeparatorMode}
  ariaLabel="Separator"
/>
```

- Keep the current option in the trigger's accessible name.
- Keep the paper menu, hard shadow, dashed option separators, quiet selected band, and chevron behavior in `BlueprintSelect`. Consumers may change width and row density or render richer option content, but must not redefine the shared selection palette or menu shell.
- Pointer-opened menus keep focus on the trigger so the selected band matches the quiet prototype. Keyboard-opened menus move focus to the selected option and retain a visible `focus-visible` outline.
- Support Arrow keys, Home, End, Enter, Space, Escape, outside-click closing, and trigger focus restoration.
- Disable an empty selector instead of opening a menu with one non-actionable placeholder.
- Close an open dynamic selector when its option set changes so focus cannot remain on a removed item.

### Blueprint Floating Surfaces

Keep menus, dialogs, update prompts, and toasts visually separate from the grid and streaming content beneath them.

- Use an opaque `bg-paper` or `bg-log-bg` surface, `border-rule`, and the Blueprint hard shadow. Do not use translucent card backgrounds over Logcat or the blueprint grid because the underlying text and rules remain readable through the overlay.
- Keep floating surfaces square. A 2 px structural radius is reserved for `ToolModule`; floating menus and notices do not inherit legacy `rounded-*` card styles.
- Give triggers `aria-expanded` and `aria-controls`. Give the surface its actual role and accessible name.
- Close transient menus on outside pointer input and Escape. Restore focus to the trigger after Escape so keyboard users keep their position.
- At the 900 px minimum width, keep bottom notices inside the main workspace and prevent them from covering the 168 px index rail or another persistent notice.

```tsx
<button
  ref={triggerRef}
  type="button"
  aria-haspopup="dialog"
  aria-expanded={open}
  aria-controls="connection-panel"
>
  <Wifi />
</button>

{open && (
  <div
    id="connection-panel"
    role="dialog"
    aria-label="Connection"
    className="border border-rule bg-paper shadow-[3px_3px_0_var(--color-hard-shadow)]"
  >
    {/* controls */}
  </div>
)}
```

Browser smoke must cover light and dark rendering, the 900 px layout, Escape focus restoration, and a long toast message that wraps without covering index controls.

---

## Common Mistakes

- 不要在组件中直接 `import { invoke } from "@tauri-apps/api/core"`, 通过 `lib/tauri.ts` 调用.
- 不要用 `useEffect` 做数据获取后忘记 cleanup (事件监听必须返回 unlisten).
- `button` 必须带 `type="button"` 防止表单提交.
