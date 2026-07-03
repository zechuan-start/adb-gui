# P1 调试工具：Bug 收集 / 录屏 / 端口转发

## 目标

在现有 adb-gui「工具 Tab + 顶部设备上下文」基础上，补齐原 PRD P1-2 / P1-3 / P1-6 三项能力，减少测试提 bug 和开发联调时切回命令行的次数。

## 用户价值

- **Bug 资料一键收集**：测试同学遇到问题时，一次点击拿到截图、Activity、设备信息、最近日志，可直接打包发给开发。
- **录屏**：复现步骤类 bug 时，比静态截图更有说服力。
- **端口转发**：本地后端 / Charles / WebView 调试等场景下的刚需，GUI 化 `forward` / `reverse`。

## 已确认事实（代码库）

- 技术栈：Tauri v2 + React + TypeScript 前端，Rust 后端通过 `run_adb` / `run_adb_with_serial` 调 adb。
- 已有可复用能力：
  - `take_screenshot`（`screenshot.rs`）→ 保存到 `~/Pictures/ADB GUI/`
  - `get_current_activity`（`device.rs`）
  - `get_device_info`（`device_info.rs`）
  - `export_logcat`（`logcat.rs`）→ 落盘到 `~/Documents/ADB GUI/logs/`
  - `ScreenshotTool.tsx` 卡片 UI 模式（busy 态、toast、设备在线判断）
- 产品形态：工具 Tab 内紧凑卡片，禁止左侧控制台导航；危险/低频操作不进首屏。
- 目标平台：macOS + Windows（Linux 不在范围）。

## 子任务地图

| 顺序 | 子任务 |  slug | 说明 |
|------|--------|-------|------|
| 1 | Bug 资料一键收集 | `07-03-bug-report-collection` | 组合已有 API + 一次性 logcat dump；可选完整 bugreport |
| 2 | 设备录屏 | `07-03-screen-recording` | `screenrecord` + pull；独立进程管理 |
| 3 | 端口转发 | `07-03-port-forwarding` | forward/reverse 列表与增删 |

> 建议实现顺序：**端口转发 → 录屏 → Bug 收集**。端口转发最简单、风险最低；录屏涉及后台进程；Bug 收集组合能力最多，放最后便于复用前两者的落盘/打开模式。

各子任务可独立验收、独立归档；父任务在所有子任务完成后做集成走查。

## 跨子任务验收（集成）

- [x] 工具 Tab 新增 3 张卡片（或合理 grid 布局），不与现有截图/APK/Deep Link 卡片互相遮挡。
- [x] 三项功能在无设备 / offline 时按钮均正确禁用。
- [x] 切换目标设备时：端口转发列表自动刷新；录屏进行中切换设备有警告；Bug 收集始终针对当前选中设备。
- [ ] macOS 与 Windows 均可 `npm run build` 通过。

## Verification Notes

- macOS 本机已通过 `npm run build`, `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`, `git diff --check`。
- 当前环境是 macOS Darwin arm64，未运行 Windows 构建。
- 当前只有一台在线设备 `z5rc4hobfelv9tvc`，双设备切换未做真机对照；相关行为通过 `selectedDevice` 代码路径和构建检查确认。

## Out of Scope（本批次）

- AAS / 设备端 Dex 扩展
- 交互式 adb shell
- 文件 push/pull 管理器
- WiFi pair（已在 07-01 任务部分完成 connect/disconnect）
- Deep Link 模板持久化
- Linux 支持

## 参考

- 原 PRD：`.trellis/tasks/archive/2026-07/06-26-adb-gui-app/prd.md` § P1-2 / P1-3 / P1-6
- 上一批实现范式：`.trellis/tasks/archive/2026-07/07-01-logcat-device-enhancements/`
