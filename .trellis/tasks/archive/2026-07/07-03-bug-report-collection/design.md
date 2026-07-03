# 设计文档：Bug 资料一键收集

## 架构

新增 `src-tauri/src/commands/bug_report.rs` 编排多步 adb；前端 `BugReportTool.tsx` 仅两个按钮 + busy/progress 态。

**关键决策**：快速收集在后端一次 `collect_quick_bug_report` 命令内完成，避免前端多次 invoke 导致部分成功部分失败。

```
BugReportTool.tsx
  → collect_quick_bug_report / collect_full_bugreport
    → bug_report.rs 内部调用：
        screencap (exec-out)
        get_current_activity 逻辑
        get_device_info 逻辑
        logcat -d -t 50
        写 info.txt / logcat.txt / screenshot.png
```

可 refactor：从 `screenshot.rs` / `device_info.rs` 提取 `pub(crate)` helper，或在 `bug_report.rs` 内 inline 相同 adb 调用（最小 diff 优先 inline + 注释 duplicate）。

## 目录约定

```rust
fn reports_dir() -> PathBuf {
    dirs::document_dir()
        .map(|d| d.join("ADB GUI").join("reports"))
        .unwrap_or_else(|| PathBuf::from("/tmp/ADB GUI/reports"))
}
```

快速收集子目录：`{reports_dir}/{safe_serial}-{timestamp}/`

## 命令

### `collect_quick_bug_report(app, serial) -> QuickReportResult`

```rust
pub struct QuickReportResult {
    pub dir: String,
    pub revealed: bool,
}
```

步骤：

1. `create_dir_all` 报告目录
2. `exec-out screencap -p` → `screenshot.png`
3. `shell dumpsys activity activities | grep mResumedActivity` 或复用 `get_current_activity` 实现
4. 组装 `info.txt`：

   ```
   collected_at: 2026-07-03 10:00:00
   device_serial: xxx
   current_activity: com.foo/.BarActivity

   [device]
   model: ...
   android_version: ...
   ...
   ```

5. `logcat -d -t 50 -v brief` → `logcat.txt`（失败时写空文件 + info.txt 注明 warn，整体仍 success）
6. `reveal_item_in_dir(dir)`

### `collect_full_bugreport(app, serial) -> BugreportResult`

```rust
pub struct BugreportResult {
    pub path: String,
    pub revealed: bool,
}
```

- 输出路径：`{reports_dir}/{safe_serial}-{timestamp}-bugreport.zip`（或 adb 默认 zip 名，以 adb 输出为准）
- 实现：Tauri command 为 async，内部用 `tauri::async_runtime::spawn_blocking` 包裹 `run_adb_with_serial(app, serial, &["bugreport", path_str])`，可能 1~5 分钟
- 前端：`busy` + 文案「正在生成 Bugreport，可能需要数分钟…」

并发：用 `static BUGREPORT_BUSY: Mutex<bool>` 拒绝重入。

## 前端

`BugReportTool.tsx` 卡片：

- 「快速收集」→ `collectQuickBugReport`
- 「完整 Bugreport」→ `collectFullBugreport`，独立 busy 态（两按钮互斥 disabled）

样式参考 `ScreenshotTool.tsx`。

## 与 Logcat Tab 关系

- 不使用前端 logcat buffer
- 不调用 `start_logcat` / `export_logcat`
- `logcat -d` 读设备当前缓冲区快照

## 兼容性 / 回滚

- 纯新增；不影响现有截图按钮行为。
- 完整 bugreport 体积大，需在 UI 文案提示磁盘空间。
