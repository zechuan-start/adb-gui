# Directory Structure

> React + TypeScript frontend layout.

---

## Overview

前端使用 React 19 + TypeScript + Vite 7 + TailwindCSS v4. 单页应用, 通过 Tab 切换视图, 无路由库.

---

## Directory Layout

```
src/
├── main.tsx              # ReactDOM 入口
├── App.tsx               # 根组件 (header, tab 切换, 布局)
├── index.css             # TailwindCSS 入口 + 全局样式
├── vite-env.d.ts         # Vite 类型声明
├── assets/               # 静态资源 (SVG 等)
├── components/           # UI 组件 (每个功能一个文件)
│   ├── DeviceSelector.tsx
│   ├── Screenshot.tsx
│   ├── AppManager.tsx
│   ├── LogcatViewer.tsx
│   ├── ActivityMonitor.tsx
│   ├── ToastBar.tsx
│   └── UpdateChecker.tsx
├── lib/                  # 工具函数和 Tauri bridge
│   ├── tauri.ts          # Tauri invoke/listen 封装 + 类型定义
│   ├── device.ts         # 设备相关纯函数
│   └── utils.ts          # 通用工具 (cn 等)
└── store/                # Zustand stores
    ├── device.ts         # 设备状态 (devices, selectedDevice, activity)
    ├── feedback.ts       # Toast 通知状态
    └── theme.ts          # 主题状态
```

---

## Module Organization

- **组件**: 扁平放在 `components/`, 每个功能模块一个文件. 不按 feature 分文件夹 (项目规模小).
- **Tauri bridge**: 所有 `invoke()` 和 `listen()` 调用集中在 `lib/tauri.ts`, 组件不直接 import `@tauri-apps/api`.
- **Store**: 按关注点分文件, 每个 store 一个文件.
- **纯逻辑函数**: 放 `lib/` 下, 按领域命名.

---

## Naming Conventions

- 组件文件: `PascalCase.tsx` (如 `Screenshot.tsx`)
- 非组件 TS 文件: `kebab-case.ts` 或 `camelCase.ts` (当前用 `camelCase`)
- 导出组件函数名: `PascalCase` (如 `export function ScreenshotTool()`)
- Store hook: `use<Domain>Store` (如 `useDeviceStore`)
- lib 函数: `camelCase`

---

## Path Alias

`@/` 映射到 `src/`, 配置在 `tsconfig.json` 和 `vite.config.ts` 中. 所有 import 使用 `@/` 前缀.
