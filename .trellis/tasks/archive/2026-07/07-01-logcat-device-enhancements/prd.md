# Logcat 与设备连接增强

## Goal

在现有 adb-gui 三个 Tab（工具 / 日志 / 应用）基础上，补齐 5 个高频调试能力，减少用户切到命令行的次数：

1. 清空 logcat
2. 按当前 App 过滤日志
3. 导出日志
4. WiFi 连接设备
5. 打开 Deep Link / URL

## Confirmed Facts (from codebase inspection)

- `src/components/Logcat.tsx`：已有实时日志、级别过滤（V/D/I/W/E/F）、文本搜索（tag/message）、暂停、虚拟滚动列表。现有“清屏”按钮（`handleClear`）**只清空前端 `lines` / `bufferRef`，没有清空设备端 logcat 缓冲区**。
- `src-tauri/src/commands/logcat.rs`：`start_logcat` 用 `adb -s <serial> logcat -v brief` 常驻子进程，逐行解析成 `LogcatLine { level, tag, pid, message, raw }` 通过事件 `logcat-line` 推给前端。没有 `-c`（清空设备端缓冲区）调用。`raw` 字段保留了原始整行文本，可直接用于导出。
- `src/store/device.ts`：`useDeviceStore` 已经维护 `currentActivity` 和从中解析出的 **`currentPackage`**（`parsePackageFromActivity`），每 5s 由 `App.tsx` 轮询刷新。这是「当前 App」过滤天然可复用的数据源，**不需要新写解析逻辑**。
- `src/components/DeviceSelector.tsx`：设备来源是 `adb devices -l` + `devices-updated` 事件，**没有连接/断开操作入口**，也没有手动输入 IP 的地方。
- `src/components/DeviceInfoPanel.tsx`（`DeviceInfoButton`）：Header 里已有「按钮 + 绝对定位弹出面板」的现成模式（`useState open` + `absolute right-0 top-10 z-50` 面板 + 遮罩内的关闭按钮），新的 WiFi 连接面板可以直接复用这个结构。
- `src-tauri/src/commands/device.rs`：`run_adb` / `run_adb_with_serial` 是所有 adb 调用的统一入口，返回 `Result<String, String>`；新命令必须复用这两个 helper，不要重新拼 `Command::new`。
- `src/lib/device.ts`：`getDeviceBySerial` / `isOnlineDevice` 是判断“是否可对设备操作”的统一方式，新功能的按钮禁用逻辑要复用这两个函数。
- `src/components/Screenshot.tsx`：截图功能的“执行 → 落盘 → 自动打开 + 定位文件”模式（含 `busy` 态、`showToast` 反馈）是导出日志最接近的参考实现。
- `src-tauri/src/commands/packages.rs` 的 `list_packages`（`pm list packages -3`）已可用于“手动选择包名过滤日志”的下拉数据源。
- 项目中除 `useThemeStore` 外没有其他本地持久化；本任务范围内**不新增持久化**（Deep Link 不做历史记录）。
- `pidof <pkg>` 只能拿到主进程 pid，App 的多进程（如 `pkg:push` 这种独立进程名）不会被覆盖到——这是「按 App 过滤日志」的已知限制，接受为 MVP 范围内的权衡。

## Requirements

### 1. 清空 logcat
- 点击“清屏”按钮时：同时执行 `adb -s <serial> logcat -c`（清空设备端缓冲区）和清空前端 `lines` / `bufferRef`。
- 不影响当前生效的级别/文本/App 过滤条件，也不影响暂停状态。
- 设备端清空失败（如设备掉线）只提示错误 toast，前端显示仍然照常清空（避免因为一次 adb 调用失败导致用户以为清屏功能整体失效）。

### 2. 按当前 App 过滤日志
- 在日志工具栏新增一个“应用过滤”下拉选择，选项为：
  - 「全部应用」（默认，关闭过滤）
  - 「当前前台应用」（自动，绑定 `useDeviceStore.currentPackage`；显示当前包名）
  - 从 `list_packages` 拉取的已安装第三方包名列表（手动选择任意一个）
- 选中「当前前台应用」或某个手动包名后：
  - 通过新命令解析该包名对应的 pid（`pidof`），并按 `LogcatLine.pid` 过滤显示的日志行。
  - pid 需要周期性刷新（复用与 `currentActivity` 轮询相同的 5s 节奏），覆盖 App 重启导致 pid 变化的情况。
  - 若解析不到 pid（App 未运行/已退出），过滤结果为空，并给出提示文案（而不是报错）。
- 与现有的级别过滤、文本搜索可以同时生效（多个过滤条件是“与”的关系）。

### 3. 导出日志
- 工具栏新增“导出”按钮：将**当前已生效过滤条件下（级别 + 文本 + App 过滤）看到的日志行**，按 `raw` 原始文本逐行导出为 `.log` 文本文件。
- 保存位置沿用截图功能的模式：固定目录（如 `~/Documents/ADB GUI/logs/`），文件名包含设备序列号与时间戳。
- 导出成功后自动打开文件所在目录（参考截图“在文件管理器中显示”行为），并通过 toast 提示保存路径。
- 若当前没有任何日志行（导出内容为空），按钮禁用或提示“没有可导出的日志”。

### 4. WiFi 连接设备
- Header 的 `DeviceSelector` 旁新增一个图标按钮，点击弹出面板（复用 `DeviceInfoButton` 的弹出面板样式），面板内包含：
  - **手动连接**：`ip[:port]` 输入框 + “连接”按钮（`adb connect`，未填端口默认按 `5555` 处理）。
  - **手动断开**：面板内列出当前 serial 里“看起来像网络地址”（包含 `:` 的 serial）的已连接设备，每条有“断开”按钮（`adb disconnect <address>`）。
  - **一键切换**：仅当当前选中设备在线（`isOnlineDevice`）时可用，一键完成「读取设备 WiFi IP → `adb tcpip 5555` → `adb connect <ip>:5555`」，成功后提示用户可以拔掉 USB 线。
- 任一操作成功后触发一次 `listDevices()` 刷新，让新的网络设备/断开结果立刻反映在 `DeviceSelector` 里。
- 失败场景（设备未连 WiFi、IP 解析失败、连接超时）均通过 toast 提示明确的错误原因，不静默失败。

### 5. 打开 Deep Link / URL
- 「工具」Tab 新增一个卡片（与截图/安装 APK 卡片同级），包含一个输入框（placeholder 如 `https://example.com 或 myapp://path`）和“打开”按钮。
- 点击后对选中设备执行 `adb shell am start -a android.intent.action.VIEW -d "<url>"`，结果通过 toast 反馈成功/失败。
- 不做历史记录（不持久化），每次都是空输入框开始；仅在设备在线时可操作。

## Acceptance Criteria

- [ ] 点击「清屏」后，设备端和前端日志都被清空；重新产生的新日志能正常追加显示。
- [ ] 选择「当前前台应用」后，日志列表只显示该包名对应 pid 的行；切换前台 App 后（等待一次轮询周期）过滤结果自动更新到新 App。
- [ ] 从下拉手动选择一个第三方包名后，日志列表按该包名的 pid 过滤；该 App 未运行时显示“未找到运行中的进程”一类提示而非报错或长时间空白。
- [ ] 应用过滤可以和现有级别过滤、文本搜索叠加使用，三者同时生效。
- [ ] 点击「导出」后，本地生成一个文本文件，内容与导出时刻屏幕上可见的（已过滤）日志行一致，且自动打开文件所在目录。
- [ ] 在 Header 里通过新图标按钮，能对一个手动输入的 `ip:port` 执行连接，成功后该设备出现在设备下拉列表中；能对已连接的网络设备执行断开，断开后从列表消失。
- [ ] 对一台在线的 USB 设备点击“一键切换到 WiFi”，成功后设备以 `ip:5555` 形式出现在设备列表中，且给出可以拔线的提示；设备没有 WiFi IP 时给出明确错误而不是卡死或无提示失败。
- [ ] 在「工具」Tab 输入一个 URL/Deep Link 并点击「打开」，对应设备上跳转到目标页面或应用；地址不合法或设备离线时给出错误 toast。

## Out of Scope

- 完整交互式 shell / 终端模拟。
- `adb bugreport`、`reboot`、`setprop` 等高风险或低频操作。
- 录屏、文件 push/pull、端口转发（本任务不含，后续可另开任务）。
- Deep Link 历史记录、WiFi 地址历史记录（本期不做本地持久化）。
- 多进程 App（服务进程与主进程 pid 不同）的完整日志覆盖——按当前 App 过滤仅覆盖 `pidof` 能解析到的主进程。

## Decisions Log

| 决策点 | 结论 |
|---|---|
| 任务组织方式 | 单一任务，一份 prd/design/implement 覆盖全部 5 个功能 |
| 按当前 App 过滤的包名来源 | 同时支持自动（`currentPackage`）与手动选择 |
| 导出日志范围 | 只导出内存中已缓冲且符合当前过滤条件的日志 |
| WiFi 连接范围 | 手动连接/断开 + 一键 USB 转 WiFi 都做 |
| Deep Link 历史记录 | 不做，保持输入框+执行按钮的最小范围 |
| WiFi 功能 UI 位置 | Header 内 `DeviceSelector` 旁新增图标按钮，弹出面板 |
