# 实现计划：设备录屏

预计工作量：中（~1–2 会话）。建议在端口转发完成后开始。

## Agent Brief

- 分配给：Agent B。
- 目标：实现单设备录屏的开始、停止、状态查询、pull 到本机和默认播放器打开。
- 可修改：`src-tauri/src/commands/screen_record.rs`, `src/components/ScreenRecordTool.tsx`。
- 需要声明给 Integration 的共享入口：
  - `src-tauri/src/commands/mod.rs`：`pub mod screen_record;`
  - `src-tauri/src/lib.rs`：注册 `start_screen_record`, `stop_screen_record`, `get_screen_record_status`
  - `src/lib/tauri.ts`：新增录屏状态/结果类型和 `startScreenRecord`, `stopScreenRecord`, `getScreenRecordStatus`
  - `src/App.tsx`：工具 Tab 挂载 `<ScreenRecordTool />`
- 不处理：端口转发、Bug 收集、工具 Tab 最终 grid 排版。

## Step 1 — 后端 `screen_record.rs`

- [x] 新建 `src-tauri/src/commands/screen_record.rs`
- [x] `RecordingSession` + `static RECORDING: Mutex<Option<...>>`
- [x] `start_screen_record(app, serial)`：
  - 生成 `remote_path = /sdcard/adb_gui_{timestamp}.mp4`
  - `Command::new(adb).args(["-s", serial, "shell", "screenrecord", "--bugreport", "--time-limit", "180", remote_path]).spawn()`
- [x] `stop_screen_record(app)`：
  - take session → `pidof screenrecord` + `kill -2` → fallback kill → wait
  - `pull remote local_mp4`
  - `shell rm remote`
  - `opener.open_path(local_mp4)`
- [x] `get_screen_record_status()` → `{ active, serial, elapsed_secs }`
- [x] `commands/mod.rs` + `lib.rs` 注册
- [x] `cargo check`

## Step 2 — 前端封装

- [x] `src/lib/tauri.ts`：`startScreenRecord` / `stopScreenRecord` / `getScreenRecordStatus` + 类型

## Step 3 — UI 组件

- [x] 新建 `src/components/ScreenRecordTool.tsx`
- [x] 开始/停止按钮 + 计时（`useEffect` 1s interval 调 `getScreenRecordStatus`）
- [x] 检测到 `active=false` 且本地认为在录屏 → 自动 `stopScreenRecord` 完成 pull（处理超时）
- [x] `selectedDevice` 变化时若正在录屏 → stop + toast
- [x] `App.tsx` 工具 Tab 加入组件（建议紧邻 `ScreenshotTool`）

## Step 4 — 验证

- [x] `npm run build`
- [x] 真机：录约 6s → `pidof` + `kill -2` 停止 → pull 到本机，MP4 非空
- [x] 真机：自然 `--time-limit 5` 到时 → MP4 非空（验证超时基础路径）
- [x] 切换设备警告路径（代码路径已实现；当前只有一台设备，未做双设备 UI 实测）
- [x] `trellis-check`

## 风险 / 回滚

- **最高风险步骤**：Step 1 stop/pull；部分机型 kill 后 MP4 不完整 → UI 提示「文件可能损坏，请重试」。
- 若 pull 不稳定，可降级为仅保存到设备并提示用户手动 pull（不应作为 MVP，仅作 rollback 预案）。

## 验证命令

```bash
npm run build
cd src-tauri && cargo check
```
