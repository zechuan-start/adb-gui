# 实现计划：Bug 资料一键收集

预计工作量：中（~1–2 会话）。建议在录屏完成后开始（复用落盘/open 模式）；与端口转发无依赖。

## Agent Brief

- 分配给：Agent C。
- 目标：实现快速 Bug 资料目录收集和完整 `adb bugreport` 长任务。
- 可修改：`src-tauri/src/commands/bug_report.rs`, `src/components/BugReportTool.tsx`。
- 需要声明给 Integration 的共享入口：
  - `src-tauri/src/commands/mod.rs`：`pub mod bug_report;`
  - `src-tauri/src/lib.rs`：注册 `collect_quick_bug_report`, `collect_full_bugreport`
  - `src/lib/tauri.ts`：新增 `QuickReportResult`, `BugreportResult`, `collectQuickBugReport`, `collectFullBugreport`
  - `src/App.tsx`：工具 Tab 挂载 `<BugReportTool />`
- 不处理：端口转发、录屏、工具 Tab 最终 grid 排版。

## Step 1 — 后端 `bug_report.rs`

- [x] 新建 `src-tauri/src/commands/bug_report.rs`
- [x] `reports_dir()` helper
- [x] `collect_quick_bug_report(app, serial) -> QuickReportResult`：
  - [x] 创建 `{reports_dir}/{safe_serial}-{ts}/`
  - [x] screencap → `screenshot.png`
  - [x] activity → 写入 info
  - [x] getprop / wm size / dumpsys battery → 写入 info
  - [x] `logcat -d -t 50 -v brief` → `logcat.txt`
  - [x] reveal 目录
- [x] `collect_full_bugreport(app, serial) -> BugreportResult`：
  - [x] `BUGREPORT_BUSY` 互斥
  - [x] `adb bugreport <path>` 通过 async blocking worker 执行，避免长任务阻塞 Tauri 主执行面
  - [x] reveal zip
- [x] `commands/mod.rs` + `lib.rs` 注册
- [x] `cargo check`

## Step 2 — 前端封装

- [x] `src/lib/tauri.ts`：`collectQuickBugReport` / `collectFullBugreport` + 结果类型

## Step 3 — UI 组件

- [x] 新建 `src/components/BugReportTool.tsx`
- [x] 两按钮 + 独立 busy（互斥 disabled）
- [x] 完整 bugreport 进行中显示 spinner + 长任务提示
- [x] `App.tsx` 工具 Tab 加入（建议与截图/录屏同一 grid 行）

## Step 4 — 验证

- [x] `npm run build`
- [x] 真机快速收集：检查三文件内容与目录 reveal
- [x] 真机完整 bugreport：生成 `/Users/qi/Documents/ADB GUI/reports/z5rc4hobfelv9tvc-codex-full-20260703-110048-bugreport.zip`，大小 10034093 bytes
- [x] 无设备 disabled
- [x] `trellis-check`

## 风险 / 回滚

- `logcat -d` 在部分设备上慢或空 → 仍交付目录，logcat.txt 可为空 + info 备注。
- 完整 bugreport 太大/太慢 → 可单独 revert `collect_full_bugreport`，保留快速收集。

## 验证命令

```bash
npm run build
cd src-tauri && cargo check
```
