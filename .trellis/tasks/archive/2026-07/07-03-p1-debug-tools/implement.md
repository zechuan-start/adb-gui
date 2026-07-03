# 实现计划：P1 调试工具并行分工

## 执行模式

当前批次包含 3 个可独立验收的功能：端口转发、设备录屏、Bug 资料一键收集。允许并行开发核心模块，但共享入口必须串行集成。

## Agent 分配

| Agent | 子任务 | 可独立修改 | 暂缓修改 / 交给集成线 |
|-------|--------|------------|------------------------|
| Agent A | `07-03-port-forwarding` | `src-tauri/src/commands/port_forward.rs`, `src/components/PortForwardTool.tsx` | `src/App.tsx`, `src/lib/tauri.ts`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` |
| Agent B | `07-03-screen-recording` | `src-tauri/src/commands/screen_record.rs`, `src/components/ScreenRecordTool.tsx` | `src/App.tsx`, `src/lib/tauri.ts`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` |
| Agent C | `07-03-bug-report-collection` | `src-tauri/src/commands/bug_report.rs`, `src/components/BugReportTool.tsx` | `src/App.tsx`, `src/lib/tauri.ts`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs` |
| Integration | 父任务集成 | 统一合并前端 invoke 封装、Tauri command 注册、工具 Tab 布局、全量验证 | 不新增独立业务能力 |

## 串行集成顺序

1. [x] 合并 Agent A 的端口转发核心模块并注册命令。
2. [x] 合并 Agent B 的录屏核心模块并注册命令。
3. [x] 合并 Agent C 的 Bug 收集核心模块并注册命令。
4. [x] 统一整理 `src/lib/tauri.ts` 的类型和 invoke 方法顺序。
5. [x] 统一调整 `src/App.tsx` 工具 Tab grid，保证 3 张新增卡片不挤压现有截图、APK、Deep Link、快捷键和当前应用操作。
6. [x] 跑 `npm run build` 和 `cd src-tauri && cargo check`。
7. [x] 有真机时按子任务 acceptance criteria 做 smoke test。

## 共享入口规则

- 子任务线不要各自提交 `src/App.tsx` 布局变更，避免 grid 冲突。
- 子任务线不要各自提交 `src/lib/tauri.ts` 的最终整合版本，只在 brief 中声明需要的类型和方法。
- 子任务线不要各自提交 `src-tauri/src/lib.rs` 的最终 handler 列表，只在 brief 中声明需要注册的命令。
- 子任务线可以在本地临时注册命令用于自测，但交付前应把共享入口差异交给 Integration 统一处理。
- 所有 adb 调用继续沿用 `run_adb` / `run_adb_with_serial` 或 `adb::resolve_adb_path`，不新增第二套 adb 发现逻辑。

## 验证矩阵

| 子任务 | 最小构建验证 | 真机验证 |
|--------|--------------|----------|
| 端口转发 | `cd src-tauri && cargo check`, `npm run build` | forward/reverse 新增、列表、删除、切换设备刷新 |
| 录屏 | `cd src-tauri && cargo check`, `npm run build` | 录 5 秒、停止、pull 到本机、默认播放器打开、切换设备停止 |
| Bug 收集 | `cd src-tauri && cargo check`, `npm run build` | 快速收集生成 3 个文件；完整 bugreport 至少验证启动和 busy 态 |
| 集成 | `npm run build`, `cd src-tauri && cargo check` | 工具 Tab 布局、无设备 disabled、当前设备上下文正确 |

## Completion Notes

- 集成入口已统一落在 `src/lib/tauri.ts`, `src-tauri/src/commands/mod.rs`, `src-tauri/src/lib.rs`, `src/App.tsx`。
- 真机 serial: `z5rc4hobfelv9tvc`。
- 端口转发、录屏、Bug 快速收集、完整 bugreport 均完成本机 smoke；完整 bugreport 输出 zip 大小 10034093 bytes。
- 当前只有一台设备，双设备切换未做真机对照；相关 UI/状态代码路径已实现并通过构建检查。

## 启动前检查

- 每个子任务的 `prd.md`, `design.md`, `implement.md` 已存在。
- 当前父任务仍处于 planning；进入实现前需要运行对应 `task.py start`。
- 若使用真实子 agent，必须把本文件和对应子任务三份 artifact 一起交给 agent。
