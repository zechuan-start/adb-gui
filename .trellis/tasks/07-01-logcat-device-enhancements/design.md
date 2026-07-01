# 设计文档：Logcat 与设备连接增强

## 架构概览

沿用现有分层：

```
React 组件 (src/components/*)
  → src/lib/tauri.ts (invoke 封装)
    → Tauri #[command] (src-tauri/src/commands/*.rs)
      → run_adb / run_adb_with_serial (src-tauri/src/commands/device.rs)
        → std::process::Command 调 adb 可执行文件
```

5 个功能全部复用这条链路，不引入新的架构层。新增内容分两类：

1. **纯后端新命令**（清空 logcat 设备侧、pid 解析、WiFi 连接/断开/一键切换、Deep Link）。
2. **前端已有组件的增强**（`Logcat.tsx` 加过滤/导出，`App.tsx` header 加 WiFi 面板，工具 Tab 加 Deep Link 卡片）。

不新增 Zustand store；`useDeviceStore` 已有的 `currentPackage` 直接复用。

---

## 1. 清空 logcat（设备侧 + 前端）

### 后端

新增 `src-tauri/src/commands/logcat.rs::clear_logcat`：

```rust
#[tauri::command]
pub fn clear_logcat(app: AppHandle, serial: String) -> Result<(), String> {
    run_adb_with_serial(&app, &serial, &["logcat", "-c"]).map(|_| ())
}
```

复用 `super::device::run_adb_with_serial`（`logcat.rs` 目前用的是 `tokio::process::Command` 跑常驻进程，`clear_logcat` 是一次性短命令，用同步的 `run_adb_with_serial` 即可，两者互不冲突）。

### 前端

`src/lib/tauri.ts` 新增：

```ts
export async function clearLogcat(serial: string): Promise<void> {
  return invoke<void>("clear_logcat", { serial });
}
```

`Logcat.tsx::handleClear` 改为：

```ts
async function handleClear() {
  setLines([]);
  bufferRef.current = [];
  try {
    await clearLogcat(selectedDevice!);
  } catch (e) {
    showToast("error", `清空设备日志缓冲区失败: ${e}`);
  }
}
```

前端状态立即清空（乐观更新），设备侧调用失败只提示不回滚——避免用户感知“清屏没反应”。需要给 `Logcat.tsx` 引入 `useFeedbackStore`（目前未引入）。

---

## 2. 按当前 App 过滤日志

### 数据契约

新增后端命令解析 pid：

```rust
// src-tauri/src/commands/logcat.rs 或新文件 src-tauri/src/commands/process.rs
#[tauri::command]
pub fn get_package_pids(app: AppHandle, serial: String, pkg: String) -> Result<Vec<String>, String> {
    let output = run_adb_with_serial(&app, &serial, &["shell", "pidof", &pkg])?;
    Ok(output.split_whitespace().map(String::from).collect())
}
```

`pidof` 找不到进程时 adb 通常返回空字符串且退出码非 0 → `run_adb_with_serial` 会走 `Err` 分支。这里将「进程不存在」和「命令真正失败」都统一表现为空 `Vec`，所以 `get_package_pids` 内部要把 `Err` 也转成 `Ok(vec![])`（因为对前端来说，两者的处理都是「显示空列表 + 提示未运行」，没必要在 UI 层再区分错误类型）：

```rust
pub fn get_package_pids(app: AppHandle, serial: String, pkg: String) -> Result<Vec<String>, String> {
    let output = run_adb_with_serial(&app, &serial, &["shell", "pidof", &pkg]).unwrap_or_default();
    Ok(output.split_whitespace().map(String::from).collect())
}
```

### 前端状态机（`Logcat.tsx`）

```ts
type AppFilterMode = "off" | "auto" | { manual: string };
```

用一个 `<select>` 实现（值为 `"off"` / `"auto"` / `pkg名`），选项来源：

- `"off"` → 「全部应用」
- `"auto"` → 「当前前台应用（{currentPackage || "无"}）」
- 手动包名列表 → 首次展开下拉时惰性调用 `listPackages(selectedDevice)`（已存在，`packages.rs`），避免每次渲染都拉全量包列表。

解析出的目标包名（`auto` 时取 `currentPackage`，`manual` 时取用户选的包名）变化，或每 5s（复用 `App.tsx` 里 `currentActivity` 轮询同款 `setInterval` 节奏，在 `Logcat.tsx` 内部单独起一个 effect，不依赖 `App.tsx`）时，调用 `get_package_pids` 刷新 `appPids: Set<string>`。

`filteredLines` 增加一层过滤：

```ts
if (appFilterMode !== "off") {
  result = result.filter((l) => appPids.has(l.pid));
}
```

空 `appPids` 时列表自然为空；在工具栏文案上加一句「当前应用未运行」区分于「没有匹配日志」，避免用户误以为过滤坏了。

### 边界

- `pidof` 只返回主进程 pid，多进程 App 的子进程日志不会被覆盖——已在 PRD Out of Scope 声明，不在本设计中解决。
- 手动选择的包名与「当前前台应用」互斥（下拉是单选），不支持同时按多个包过滤。

---

## 3. 导出日志

### 后端

复用截图的“落盘 + 自动打开目录”模式，新增：

```rust
// src-tauri/src/commands/logcat.rs
#[derive(serde::Serialize, Clone)]
pub struct ExportResult {
    pub path: String,
    pub revealed: bool,
}

#[tauri::command]
pub fn export_logcat(app: AppHandle, serial: String, content: String) -> Result<ExportResult, String> {
    let save_dir = logs_dir(); // dirs::document_dir().join("ADB GUI").join("logs")
    std::fs::create_dir_all(&save_dir).map_err(|e| format!("Failed to create dir: {e}"))?;

    let timestamp = chrono::Local::now().format("%Y%m%d-%H%M%S").to_string();
    let safe_serial = serial.replace(['/', ':', ' '], "_");
    let file_path = save_dir.join(format!("{safe_serial}-{timestamp}.log"));

    std::fs::write(&file_path, content).map_err(|e| format!("Failed to write file: {e}"))?;

    let path_str = file_path.to_string_lossy().to_string();
    let revealed = app.opener().reveal_item_in_dir(&path_str).is_ok();

    Ok(ExportResult { path: path_str, revealed })
}
```

`content` 由前端拼好传入（`filtered.map(l => l.raw).join("\n")`），后端只负责落盘 + 定位文件，不重新做过滤逻辑——过滤规则的唯一实现留在前端，避免前后端各维护一份过滤逻辑导致行为不一致。

目录选 `dirs::document_dir()` 而非截图用的 `picture_dir()`，因为导出的是文本日志，语义上更贴近“文档”。若 `document_dir()` 取不到（理论上极少数系统），回退到 `/tmp/ADB GUI/logs`，与截图 fallback 逻辑一致。

### 前端

`Logcat.tsx` 工具栏新增导出按钮（`Download` 图标），复用 `filteredLines()`：

```ts
async function handleExport() {
  if (filtered.length === 0) {
    showToast("error", "没有可导出的日志");
    return;
  }
  const content = filtered.map((l) => l.raw).join("\n");
  try {
    const result = await exportLogcat(selectedDevice!, content);
    showToast("success", `日志已导出到 ${result.path}`);
  } catch (e) {
    showToast("error", `导出失败: ${e}`);
  }
}
```

---

## 4. WiFi 连接设备

### 后端（新文件 `src-tauri/src/commands/wifi.rs`）

```rust
#[tauri::command]
pub fn adb_connect(app: AppHandle, address: String) -> Result<String, String> {
    let addr = normalize_address(&address); // 补默认端口 5555
    run_adb(&app, &["connect", &addr])
}

#[tauri::command]
pub fn adb_disconnect(app: AppHandle, address: String) -> Result<String, String> {
    run_adb(&app, &["disconnect", &address])
}

#[tauri::command]
pub fn enable_wifi_debugging(app: AppHandle, serial: String) -> Result<String, String> {
    let ip = get_device_wifi_ip(&app, &serial)?; // 解析失败直接返回 Err，提示用户检查 WiFi
    run_adb_with_serial(&app, &serial, &["tcpip", "5555"])?;
    std::thread::sleep(std::time::Duration::from_millis(1500)); // 等待 adbd 重启为 TCP 模式
    let addr = format!("{ip}:5555");
    run_adb(&app, &["connect", &addr])?;
    Ok(addr)
}

fn get_device_wifi_ip(app: &AppHandle, serial: &str) -> Result<String, String> {
    let output = run_adb_with_serial(app, serial, &["shell", "ip", "-f", "inet", "addr", "show", "wlan0"])?;
    parse_inet_addr(&output).ok_or_else(|| "未检测到 WiFi IP，请确认设备已连接 WiFi".to_string())
}

fn parse_inet_addr(output: &str) -> Option<String> {
    // 匹配形如 "inet 192.168.1.23/24 ..." 的行
    let re = regex::Regex::new(r"inet\s+(\d+\.\d+\.\d+\.\d+)/").unwrap();
    re.captures(output).map(|c| c[1].to_string())
}

fn normalize_address(address: &str) -> String {
    if address.contains(':') {
        address.to_string()
    } else {
        format!("{address}:5555")
    }
}
```

`enable_wifi_debugging` 用 `std::thread::sleep` 阻塞等待 1.5s——因为这是同步 `#[tauri::command]`（非 `async fn`），Tauri 会把它丢到独立线程池执行，不会阻塞 UI 线程或其他命令；这与项目里其它同步命令（`install_apk` 等本身也是阻塞式 `Command::output()`）的执行模型一致，不需要额外引入 `tokio::time::sleep` + `async`。

若 1.5s 后 `adb connect` 仍失败（比如设备重启 TCP 模式比预期慢），直接把 `run_adb` 的 `Err` 透传给前端，不做重试——重试逻辑留到用户真的反馈这是高频问题时再加，避免过度设计。

### 前端

`src/lib/tauri.ts` 新增 `adbConnect` / `adbDisconnect` / `enableWifiDebugging` 三个 invoke 封装。

新组件 `src/components/WifiConnect.tsx`（结构直接照抄 `DeviceInfoButton` 的按钮+绝对定位面板模式）：

- 按钮图标用 `Wifi`（lucide-react），放在 `App.tsx` header 里 `<DeviceSelector />` 和 `<DeviceInfoButton />` 之间。
- 面板内容：
  1. 手动连接：`<input>`（ip[:port]）+「连接」按钮 → `adbConnect`。
  2. 已连接的网络设备列表：从 `useDeviceStore.devices` 里筛出 `serial.includes(':')` 的项，每项一个「断开」按钮 → `adbDisconnect(device.serial)`。
  3. 一键切换：仅在 `isOnlineDevice(getDeviceBySerial(devices, selectedDevice))` 为真时可点击的按钮 → `enableWifiDebugging(selectedDevice)`。
- 三个操作成功后都调用一次 `listDevices().then(setDevices)`（`DeviceSelector.tsx` 里 `refresh()` 的同款逻辑，这里直接内联复用而不是把 `refresh` 提到 store 里——范围小，没必要为此重构 `DeviceSelector`）。

---

## 5. 打开 Deep Link / URL

### 后端

新增 `src-tauri/src/commands/deeplink.rs`：

```rust
#[tauri::command]
pub fn open_deep_link(app: AppHandle, serial: String, url: String) -> Result<String, String> {
    run_adb_with_serial(
        &app,
        &serial,
        &["shell", "am", "start", "-a", "android.intent.action.VIEW", "-d", &url],
    )
}
```

参数通过 `Command` 的 `args` 数组传递（不经过 shell 解释），不存在 shell 注入风险，`url` 里的空格/特殊字符也不需要额外转义。

### 前端

新组件 `src/components/DeepLinkTool.tsx`，样式对齐 `ScreenshotTool.tsx`（`<section className="rounded-lg border border-border bg-card p-4">` 卡片），加入 `App.tsx` 工具 Tab 的 grid 里（现有两行 grid 之后新增一行，或并入现有 `lg:grid-cols-[2fr_3fr]` 那一行——具体摆放在实现阶段按视觉效果微调，不影响功能验收）。

输入框需要带上本次会话已经踩过的坑：`autoComplete="off" autoCorrect="off" autoCapitalize="off" spellCheck={false}`，避免 WebKit 自动大写把 `https://` 变成 `Https://`。

---

## 跨功能约定

- 所有新 Tauri 命令都通过 `run_adb` / `run_adb_with_serial` 执行，不直接 `Command::new(adb_path)`。
- 所有新前端调用都遵循「`try { await xxx(); showToast("success", ...) } catch (e) { showToast("error", ...) }`」的既有模式。
- 所有需要「设备必须在线」的操作，按钮 `disabled` 条件统一用 `!device || !isOnlineDevice(device)`。
- 不引入新的持久化、新的全局 store；`WifiConnect` 和 `DeepLinkTool` 的状态都是组件内 `useState`。

## 兼容性 / 回滚

- 所有改动都是新增命令 + 现有组件内的增量 UI，不修改现有命令的入参/出参结构，不影响已有功能（截图、安装、按键、应用管理）。
- 出问题时可以按功能单独回滚（例如只 revert `wifi.rs` + `WifiConnect.tsx`），互相之间没有耦合。
- 新增的 `src-tauri/src/commands/*.rs` 文件需要在 `commands/mod.rs` 声明 `pub mod`，并在 `src-tauri/src/lib.rs` 的 `tauri::generate_handler![...]` 列表里逐个注册——这是本项目现有的固定接线方式（参考 `lib.rs` 里 `commands::packages::list_packages`、`commands::app_icon::get_app_icon` 的接入方式）。
