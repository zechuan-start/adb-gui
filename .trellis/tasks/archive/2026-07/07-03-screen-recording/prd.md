# 设备录屏

## Goal

在工具 Tab 提供一键开始/停止录屏，保存 MP4 到本机截图同目录，停止后用系统默认播放器打开；支持最大 180 秒自动停止。

## Confirmed Facts

- 截图落盘目录：`dirs::picture_dir()/ADB GUI`（`screenshot.rs::screenshot_dir`）。
- PRD 原要求 `--bugreport` 参数（视频叠加时间戳）；实现简单，默认开启。
- 录屏不能阻塞 UI；需要在 Rust 侧管理 `screenrecord` 子进程生命周期。
- 切换设备时若正在录屏，应警告并停止当前录屏（PRD 验收项）。

## Requirements

### 录屏流程

- 工具 Tab 新增「录屏」卡片，与截图卡片同级。
- **开始**：`adb shell screenrecord --bugreport --time-limit 180 /sdcard/adb_gui_{timestamp}.mp4`（后台运行）。
- **停止**（用户点击 / 180s 到时）：
  1. 终止设备端 `screenrecord`（通过 kill 本地 adb 子进程或 `adb shell pkill -2 screenrecord`）
  2. `adb pull` 到 `~/Pictures/ADB GUI/{safe_serial}-{timestamp}.mp4`
  3. `adb shell rm` 删除设备临时文件
  4. 用系统默认播放器 `open_path` 打开
- 录屏中 UI：按钮变红「停止录屏」+ 已录制秒数计时（前端 `setInterval` 或后端返回 start time）。

### 边界

- 同一时刻只允许一个录屏会话（全局 mutex 或 AppState）。
- 设备 offline / 无设备：按钮 disabled。
- 切换 `selectedDevice` 时若正在录屏：toast 警告并自动 stop（或禁止切换——推荐 auto stop + toast）。
- pull 失败时仍尝试删除设备临时文件，并 toast 错误。

### MVP 不做

- 录屏分辨率/码率自定义（`screenrecord --size` 等）
- 录屏历史列表（P1-9 截图历史可后续统一）

## Acceptance Criteria

- [x] 点击开始后设备开始录屏，UI 显示计时，按钮变为停止。
- [x] 点击停止或 180s 超时后，MP4 pull 到本机并尝试用默认播放器打开。
- [x] 录屏进行中切换设备会停止当前录屏并提示。
- [x] 无设备时按钮禁用；不会遗留设备端 `/sdcard/adb_gui_*.mp4` 垃圾文件（best effort）。

## Verification Notes

- 真机 serial: `z5rc4hobfelv9tvc`。
- smoke: 手动停止路径通过，设备端 `pidof screenrecord` + `kill -2 <pid>` 后 pull 的 MP4 非空。
- smoke: 自然 `--time-limit 5` 到时路径通过，pull 的 MP4 非空。
- 当前只有一台设备；切换设备自动 stop + toast 为代码路径验证，未做双设备真机切换。

## Out of Scope

- 内置视频预览/编辑
- 同时多设备录屏
- `--verbose` 日志
