# Quality Guidelines

> Frontend quality standards.

---

## Overview

工具链: TypeScript strict, Vite (no ESLint configured yet). 验证: `tsc --noEmit`.

---

## Forbidden Patterns

- `any` 类型
- 直接 import `@tauri-apps/api/core` (通过 `lib/tauri.ts` 封装)
- CSS-in-JS (统一用 Tailwind)
- `var` 声明
- class 组件
- `document.querySelector` 直接操作 DOM (用 React ref)

---

## Required Patterns

- `type="button"` on all `<button>` elements
- `cn()` for conditional classes
- `@/` path alias for all imports
- async operations wrapped in try/catch with user feedback (toast)
- cleanup in useEffect when using listeners or timers
- `export function` (named export) for components

---

## Testing Requirements

当前无前端测试. 验证方式:
1. `tsc --noEmit` 类型检查通过
2. `pnpm build` (Vite build) 成功
3. `pnpm tauri dev` 手动验证 UI

---

## Code Review Checklist

- 新增组件是否遵循 component-guidelines 中的结构
- Tauri invoke 是否通过 `lib/tauri.ts`
- 是否有未处理的 Promise (需 catch 或 void)
- 响应式布局: 是否在窄屏下可用
- 暗色/亮色模式: 是否使用语义 token (不硬编码颜色)
