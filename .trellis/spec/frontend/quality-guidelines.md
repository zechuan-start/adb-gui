# Quality Guidelines

> Frontend quality standards.

---

## Overview

工具链: TypeScript strict, Vitest, Vite (no ESLint configured yet). 类型检查由 `pnpm build` 中的 `tsc` 执行.

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

前端纯逻辑和 store 行为使用同目录 Vitest 单测. 验证顺序:

1. `corepack pnpm test` — 运行 `src/**/*.test.ts` 单测
2. `corepack pnpm build` — 执行严格 TypeScript 检查和 Vite production build
3. UI 行为使用 Browser 工具验证; 桌面集成路径使用 Tauri debug 应用验证

新增或修改解析、校验、状态转换时必须增加回归测试. Canvas、虚拟滚动、dialog 焦点和键盘交互等浏览器行为需要真实 UI 冒烟测试, 不能只以 build 通过替代.

---

## Code Review Checklist

- 新增组件是否遵循 component-guidelines 中的结构
- Tauri invoke 是否通过 `lib/tauri.ts`
- 是否有未处理的 Promise (需 catch 或 void)
- 响应式布局: 是否在窄屏下可用
- 暗色/亮色模式: 是否使用语义 token (不硬编码颜色)
