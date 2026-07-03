# Bug 资料一键收集

## Goal

测试/开发遇到问题时，一键收集 bug 上下文资料（截图 + Activity + 设备信息 + 最近 logcat），打包到本机固定目录；可选触发完整 `adb bugreport`（慢任务，需进度反馈）。

## Confirmed Facts

- `take_screenshot`、`get_current_activity`、`get_device_info` 均已注册并在前端可用（`src/lib/tauri.ts`）。
- 前端 Logcat Tab 的流式 logcat 与 Bug 收集无关；快速收集应使用 **`adb logcat -d -t 50`** 一次性 dump，不依赖用户是否打开日志 Tab。
- 截图目录：`dirs::picture_dir()/ADB GUI`（`screenshot.rs`）。
- 日志导出目录：`dirs::document_dir()/ADB GUI/logs`（`logcat.rs`）；Bug 报告应使用独立目录避免混淆。
- `export_logcat` 由前端拼 content；Bug 收集应在**后端编排**，保证一次点击原子完成。

## Requirements

### 快速收集

- 工具 Tab 新增「Bug 报告」卡片，主按钮「快速收集」。
- 对当前选中在线设备依次收集：
  1. PNG 截图（复用 screencap 逻辑）
  2. 当前 Activity 文本
  3. 设备基本信息（model / Android 版本 / SDK / 分辨率 / 电量等，复用 `DeviceDetail` 字段）
  4. 最近 50 行 logcat（`logcat -d -t 50 -v brief`）
- 输出为一个**目录**（非 zip MVP），结构：

  ```
  ~/Documents/ADB GUI/reports/{safe_serial}-{timestamp}/
    screenshot.png
    info.txt        # Activity + 设备信息，人类可读 key-value
    logcat.txt      # 最近 50 行原始文本
  ```

- 完成后 toast 提示路径，并 `reveal_item_in_dir` 打开所在目录。
- 收集中按钮 busy，禁止重复点击。

### 完整 Bugreport（可选第二按钮）

- 按钮「完整 Bugreport」，执行 `adb bugreport <output.zip>`（或平台默认输出路径）。
- 保存到 `~/Documents/ADB GUI/reports/`，文件名含设备 serial 与时间戳。
- UI 显示进行中状态（文案 + spinner）；预计 30s~数分钟，**不阻塞**其他 Tab 浏览，但同一设备上避免并发 bugreport。
- 完成后 reveal 文件；失败 toast 明确 adb  stderr。

### 设备上下文

- 无设备 / 非 online 时两按钮 disabled。
- 所有操作明确针对 `selectedDevice`。

## Acceptance Criteria

- [x] 点击「快速收集」后，本机生成包含 `screenshot.png`、`info.txt`、`logcat.txt` 的目录。
- [x] `info.txt` 含当前 Activity 与至少：型号、Android 版本、SDK、分辨率、电量。
- [x] `logcat.txt` 为设备端 dump 的最近日志（约 50 行），不依赖 Logcat Tab 是否打开。
- [x] 点击「完整 Bugreport」后 UI 有进行中反馈，完成后文件落盘并 reveal。
- [x] 无设备时按钮禁用；收集中不可重复触发。

## Verification Notes

- 真机 serial: `z5rc4hobfelv9tvc`。
- 快速收集 smoke: `/Users/qi/Documents/ADB GUI/reports/z5rc4hobfelv9tvc-codex-smoke-20260703-105943/`，三文件非空，`current_activity=com.miui.home/.launcher.Launcher`，`logcat.txt` 51 行。
- 完整 bugreport smoke: `/Users/qi/Documents/ADB GUI/reports/z5rc4hobfelv9tvc-codex-full-20260703-110048-bugreport.zip`，大小 10034093 bytes。

## Out of Scope

- zip 打包快速收集目录（后续增强）
- 自定义 logcat 行数 / 过滤级别
- 自动上传 Jira/飞书
- bugreport 进度百分比解析（adb 无标准进度 API，仅 indeterminate 状态）
