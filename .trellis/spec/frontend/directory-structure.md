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
├── components/           # UI 组件 (单文件功能扁平, 多文件功能分目录)
│   ├── DeviceSelector.tsx
│   ├── Screenshot.tsx
│   ├── AppManager.tsx
│   ├── QuickKeys.tsx     # 快捷按键工具
│   ├── logcat/           # Logcat 多组件功能区
│   │   ├── LogcatPanel.tsx
│   │   ├── LogcatToolbar.tsx
│   │   ├── LogcatActions.tsx
│   │   ├── LogcatQueryInput.tsx
│   │   ├── LogcatQuerySuggestions.tsx
│   │   ├── LogcatList.tsx
│   │   ├── LogcatRow.tsx
│   │   └── LogcatViewMenu.tsx
│   ├── ActivityMonitor.tsx
│   ├── DeviceFileManager.tsx # Device directory, transfer, and image preview workspace
│   ├── CodeGeneratorPage.tsx # QR / Code 128 batch workspace
│   ├── GeneratedCodeCanvas.tsx # Local canvas encoder boundary
│   ├── ToastBar.tsx
│   └── UpdateChecker.tsx
├── hooks/                # 可复用外部生命周期与纯 controller
│   ├── activityPollingController.ts
│   ├── useLogcatStream.ts
│   ├── logcatStreamController.ts
│   ├── useFollowScroll.ts
│   ├── followScrollController.ts
│   ├── followScrollModel.ts
│   ├── useLogcatPackageResolution.ts
│   └── useLogcatQueryCompletions.ts
├── lib/                  # 工具函数和 Tauri bridge
│   ├── tauri.ts          # Tauri invoke/listen 封装 + 类型定义
│   ├── logcat.ts         # Logcat 行模型, ring buffer 与过滤索引
│   ├── logcatCrash.ts    # Logcat 崩溃/堆栈启发式分类
│   ├── logcatQuery.ts    # 查询 tokenize, AST 编译与求值
│   ├── logcatQueryCompletion.ts # 查询补全与文本替换纯逻辑
│   ├── logcatView.ts     # Standard/Compact, 字段开关与进程名到包名推导
│   ├── device.ts         # 设备相关纯函数
│   ├── deviceFiles.ts    # 文件工作台 reducer, operation context, and display helpers
│   ├── codeGenerator.ts  # 生码输入解析契约和共享类型
│   └── utils.ts          # 通用工具 (cn 等)
└── store/                # Zustand stores
    ├── codeGenerator.ts  # 生码草稿和最近一次结果快照 (仅会话内)
    ├── device.ts         # 设备状态 (devices, selectedDevice, activity)
    ├── feedback.ts       # Toast 通知状态
    ├── logcat.ts         # Logcat 会话, 数据窗口与交互状态
    └── theme.ts          # 主题状态
```

---

## Module Organization

- **组件**: 单文件功能保持在 `components/` 根目录. 一个功能拆成 3 个以上文件时, 建立小写 feature 子目录 (如 `components/logcat/`), 让协作文件聚合且不挤占全局组件命名空间.
- **Hooks**: 可复用的外部生命周期放在 `hooks/`; 复杂时把 React 绑定保留在 `use<Feature>.ts`, 把可测试状态机拆到同域 controller/model 文件.
- **Tauri bridge**: 所有 `invoke()` 和 `listen()` 调用集中在 `lib/tauri.ts`, 组件不直接 import `@tauri-apps/api`.
- **Store**: 按关注点分文件, 每个 store 一个文件.
- **纯逻辑函数**: 放 `lib/` 下, 按领域命名.
- **前端单测**: 与被测源文件同目录 (包括 `lib/`, `store/`, `hooks/`), 使用 `*.test.ts` 命名.

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
