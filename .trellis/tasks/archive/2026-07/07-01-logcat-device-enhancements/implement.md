# 实现计划：Logcat 与设备连接增强

执行顺序按依赖关系排列：先做与现有 `Logcat.tsx` 相关的三项（互相共享 UI 区域，放一起改一次更省事），再做独立的 WiFi 面板，最后做独立的 Deep Link 卡片。每一步完成后跑一次 `npm run build`（`tsc && vite build`）确认没有类型错误。

## Step 1 — 后端：清空 logcat + pid 解析 + 导出

- [ ] `src-tauri/src/commands/logcat.rs` 新增 `clear_logcat(app, serial)`，调用 `run_adb_with_serial(&app, &serial, &["logcat", "-c"])`。
- [ ] 同文件新增 `get_package_pids(app, serial, pkg) -> Result<Vec<String>, String>`，内部把 `pidof` 的 `Err`（进程不存在）吞成 `Ok(vec![])`。
- [ ] 同文件新增 `ExportResult { path, revealed }` + `export_logcat(app, serial, content) -> Result<ExportResult, String>`，落盘目录用 `dirs::document_dir()`（取不到则回退 `/tmp/ADB GUI/logs`），文件名 `{safe_serial}-{timestamp}.log`；成功后调用 `app.opener().reveal_item_in_dir`。
- [ ] `commands/mod.rs` 不需要改动（`logcat` 模块已声明）。
- [ ] `src-tauri/src/lib.rs` 的 `generate_handler!` 里新增 `commands::logcat::clear_logcat`、`commands::logcat::get_package_pids`、`commands::logcat::export_logcat`。
- [ ] `cargo check`（或直接 `npm run build` 触发 `tauri build` 前的类型检查亦可，但更快的是在 `src-tauri` 目录跑 `cargo check`）确认编译通过。

## Step 2 — 前端：`lib/tauri.ts` 补充对应封装

- [ ] 新增 `clearLogcat(serial)`、`getPackagePids(serial, pkg)`、`exportLogcat(serial, content)`（对应 `ExportResult` 类型）三个 invoke 封装，紧挨着现有 `startLogcat` / `stopLogcat` 附近。

## Step 3 — 前端：`Logcat.tsx` 集成三项功能

- [ ] 引入 `useFeedbackStore`（目前 `Logcat.tsx` 未使用）。
- [ ] `handleClear` 改为 async：先清前端状态，再 `try/catch` 调 `clearLogcat`，失败只 toast 不回滚。
- [ ] 引入 `useDeviceStore` 的 `currentPackage`；新增 `appFilterMode` 状态（`"off" | "auto" | string`，字符串即手动选中的包名）。
- [ ] 新增一个 `<select>`（放在现有 Level 按钮组和搜索框之间，或搜索框右侧，视觉上不要挤爆现有工具栏——可以考虑把工具栏拆成两行，或者把不常用的按钮收进一个更紧凑的布局）：
  - `<option value="off">全部应用</option>`
  - `<option value="auto">当前前台应用{currentPackage ? \`（${currentPackage}）\` : ""}</option>`
  - 下拉展开（`onFocus` 或点击时）惰性调用 `listPackages(selectedDevice)` 填充手动选项列表；缓存结果避免重复请求。
- [ ] 新增 `appPids` 状态 + 一个 `useEffect`：当 `appFilterMode` 变化（且不是 `"off"`）或每 5s，调用 `getPackagePids(selectedDevice, targetPkg)` 刷新；`targetPkg` 在 `"auto"` 时取 `currentPackage`，否则取 `appFilterMode` 本身。
- [ ] `filteredLines` 增加 `appFilterMode !== "off"` 时按 `appPids.has(l.pid)` 过滤；`appPids` 为空时在工具栏展示「当前应用未运行」提示（可以复用现有 `{filtered.length}/{lines.length}` 旁边的文案区域）。
- [ ] 新增「导出」按钮（`Download` 图标），`handleExport` 用 `filtered.map(l => l.raw).join("\n")` 作为 `content` 调 `exportLogcat`；空列表时按钮 `disabled` 或点击提示。
- [ ] 手动检查：级别过滤 + 文本搜索 + App 过滤三者同时打开时结果符合预期（三者是“与”关系）。

## Step 4 — 后端：WiFi 连接

- [ ] 新建 `src-tauri/src/commands/wifi.rs`，实现 `adb_connect`、`adb_disconnect`、`enable_wifi_debugging`（含 `get_device_wifi_ip` / `parse_inet_addr` / `normalize_address` 私有辅助函数）。
- [ ] `commands/mod.rs` 新增 `pub mod wifi;`。
- [ ] `lib.rs` 的 `generate_handler!` 里新增 `commands::wifi::adb_connect`、`commands::wifi::adb_disconnect`、`commands::wifi::enable_wifi_debugging`。
- [ ] `cargo check` 确认编译通过；有条件的话用一台真机验证一次「一键切换到 WiFi」全流程（USB 接入 → 点击 → 设备以 `ip:5555` 出现在列表 → 拔线后仍可用）。

## Step 5 — 前端：WiFi 面板组件

- [ ] `src/lib/tauri.ts` 新增 `adbConnect(address)`、`adbDisconnect(address)`、`enableWifiDebugging(serial)` 封装。
- [ ] 新建 `src/components/WifiConnect.tsx`，参考 `DeviceInfoPanel.tsx` 的按钮+弹出面板结构：
  - 手动连接输入框（`autoComplete="off"` 等一整套属性，同本次会话已修过的搜索框）+ 连接按钮。
  - 已连接网络设备列表（`serial.includes(':')` 筛选）+ 逐条断开按钮。
  - 一键切换按钮，`disabled` 条件为 `!isOnlineDevice(getDeviceBySerial(devices, selectedDevice))`。
  - 三种操作成功后都调用 `listDevices().then(setDevices)` 刷新设备列表。
- [ ] `src/App.tsx` 里 `<DeviceSelector />` 和 `<DeviceInfoButton />` 之间插入 `<WifiConnect />`。

## Step 6 — 后端 + 前端：Deep Link

- [ ] 新建 `src-tauri/src/commands/deeplink.rs`，实现 `open_deep_link(app, serial, url)`。
- [ ] `commands/mod.rs` 新增 `pub mod deeplink;`；`lib.rs` 注册 `commands::deeplink::open_deep_link`。
- [ ] `src/lib/tauri.ts` 新增 `openDeepLink(serial, url)` 封装。
- [ ] 新建 `src/components/DeepLinkTool.tsx`，样式参考 `ScreenshotTool.tsx` 的卡片结构；输入框带上 `autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}`。
- [ ] `src/App.tsx` 工具 Tab 的 grid 里加入 `<DeepLinkTool />`（具体摆放位置实现时按视觉效果调整）。

## Step 7 — 收尾验证

- [ ] `npm run build`（`tsc && vite build`）全量跑一遍，确认类型检查和构建都通过。
- [ ] 逐条对照 `prd.md` 的 Acceptance Criteria 手动验证（需要至少一台真机或模拟器，其中 WiFi 一键切换必须用真机验证，模拟器一般没有 `wlan0`）。
- [ ] 跑一次 `trellis-check` 技能做质量核对（spec 合规、lint、跨层数据流）。

## 风险点 / 回滚点

- Step 4（WiFi 一键切换）风险最高：涉及真实网络环境、设备重启 adbd，容易在不同机型上表现不一致。如果一键切换在测试中不稳定，可以先只交付「手动连接/断开」（Step 4/5 里去掉 `enable_wifi_debugging` 相关代码），单独砍掉这一小块不影响其余 4 个功能。
- Step 3（Logcat 改动集中在一个文件）改动面较大，建议先跑通「清空 + 导出」两个小改动、构建通过后再叠加「按 App 过滤」这个逻辑相对复杂的部分，方便定位问题。
- 每个 Step 之间没有强耦合，出问题可以按 Step 单独回滚对应的新增文件/新增命令注册行。

## 验证命令

```bash
# 前端类型检查 + 构建
npm run build

# 后端编译检查（更快，不产出前端资源）
cd src-tauri && cargo check
```
