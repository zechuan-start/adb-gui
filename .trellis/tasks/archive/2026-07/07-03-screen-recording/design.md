# 设计文档：设备录屏

## 架构

新增 `src-tauri/src/commands/screen_record.rs` 管理录屏会话 + `src/components/ScreenRecordTool.tsx`。

录屏是有状态长任务，与 logcat 类似需要在 Rust 侧持有 `Child` 进程，但用**同步 Command + Mutex** 即可（与 logcat 的 tokio 不同，`screenrecord` 阻塞直到结束或被 kill）。

## 状态机

```
Idle ──start──► Recording ──stop/timeout──► Pulling ──► Idle
                  │
                  └── device offline / switch device ──► force stop ──► Idle
```

### AppState 扩展（推荐放在 `screen_record.rs` 静态 Mutex）

```rust
struct RecordingSession {
    serial: String,
    remote_path: String,
    child: std::process::Child,
    started_at: std::time::Instant,
}

static RECORDING: LazyLock<Mutex<Option<RecordingSession>>> = ...;
```

## 命令

| 命令 | 行为 |
|------|------|
| `start_screen_record(app, serial)` | 若已有 session → Err；否则 spawn `adb -s S shell screenrecord --bugreport --time-limit 180 /sdcard/adb_gui_{ts}.mp4`，存 session |
| `stop_screen_record(app)` | kill child → pull → rm remote → open mp4 → 返回 `ScreenRecordResult { path, opened }` |
| `get_screen_record_status()` | 返回 `{ active: bool, serial?, elapsed_secs }` 供前端轮询 |

**停止策略**：

1. 优先 `adb shell pidof screenrecord` 后 `kill -2 <pid>` 给设备端 `screenrecord` 发 SIGINT；找不到 pid 时才 fallback 到 `pkill -2 screenrecord`
2. 若 pull 文件大小为 0，返回明确错误「录屏过短或无数据」
3. `run_adb_with_serial(..., ["shell", "rm", remote_path])` best-effort 清理

**超时**：依赖 `--time-limit 180`；child 自然退出后 session 仍在，前端轮询到 `active=false` 时自动触发 `stop_screen_record` 做 pull，或 `start` 时用 `std::thread::spawn` wait 后 emit event `screen-record-finished`。

推荐：**前端每 1s 轮询 `get_screen_record_status`**；当 `active` 从 true 变 false 且非用户点击 stop，自动 invoke `stop_screen_record` 完成 pull（处理 180s 超时）。

## 落盘

复用 `screenshot_dir()` — 可提取到 `src-tauri/src/paths.rs` 或 `screen_record.rs` 内 duplicate 一小段 `picture_dir/ADB GUI`。

文件名：`{safe_serial}-{timestamp}.mp4`

## 前端

- `ScreenRecordTool.tsx`：开始/停止按钮、计时显示、busy 态。
- `useEffect` 监听 `selectedDevice` 变化：若 `recording && serial !== selected` → 调用 `stopScreenRecord()` + toast 警告。
- 组件 unmount 不自动 stop（用户可能切 Tab）；仅设备切换时 stop。

## 兼容性 / 回滚

- 与 logcat 子进程独立，无共享 Mutex。
- 回滚：移除模块 + 前端卡片。
