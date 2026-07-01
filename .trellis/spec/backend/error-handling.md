# Error Handling

> Tauri command error conventions.

---

## Overview

所有 Tauri command 返回 `Result<T, String>`. 错误通过 `String` 类型传递给前端, 前端通过 `try/catch` 捕获并展示给用户.

---

## Error Types

当前项目不使用自定义 error enum, 统一使用 `Result<T, String>`:

```rust
#[tauri::command]
pub fn some_command(app: AppHandle, serial: String) -> Result<String, String> {
    let output = run_adb_with_serial(&app, &serial, &["shell", "..."])
        .map_err(|e| format!("Failed to ...: {e}"))?;
    Ok(output)
}
```

---

## Error Handling Patterns

- **ADB 进程调用**: `.map_err(|e| format!("描述: {e}"))` 转换为可读 String.
- **文件 IO**: 同上, 使用 `.map_err(|e| e.to_string())` 或带上下文的 format.
- **状态解析失败**: 返回 `Ok(默认值)` (如空字符串), 不视为 hard error.
- **不使用 `unwrap()`**: 除非是不可能失败的情况 (如 Mutex lock).

---

## 前端错误展示

前端通过 `useFeedbackStore.showToast("error", msg)` 显示错误:

```typescript
try {
  await someCommand(serial);
  showToast("success", "操作成功");
} catch (error) {
  showToast("error", `操作失败: ${error}`);
}
```

---

## Common Mistakes

- 不要在 command 中 panic; 所有可能失败的路径都用 `?` 或 `map_err`.
- 不要吞掉 stderr 输出; ADB 命令失败时应将 stderr 内容返回给前端.

## Scenario: ADB Commands With Stdout-Level Failures

### 1. Scope / Trigger

- Trigger: new Tauri commands that wrap ADB operations where `adb` may return exit code 0 while reporting failure in stdout, such as `adb connect`.

### 2. Signatures

- `adb_connect(app: AppHandle, address: String) -> Result<String, String>`
- `adb_disconnect(app: AppHandle, address: String) -> Result<String, String>`
- `enable_wifi_debugging(app: AppHandle, serial: String) -> Result<String, String>`

### 3. Contracts

- `address`: user-entered `ip[:port]`; trim whitespace and append `:5555` when the port is omitted.
- `serial`: selected online USB or network serial passed through `run_adb_with_serial`.
- Success response: trimmed ADB stdout or the connected `ip:5555` address.
- Failure response: user-readable `String` shown by frontend toast.

### 4. Validation & Error Matrix

- Empty `address` -> `Err("请输入设备 IP 或 ip:port")`.
- `adb connect` stdout contains `failed`, `unable`, or `cannot` -> return `Err(stdout.trim())` even if process status is success.
- Missing WiFi IP from `wlan0` -> `Err("未检测到 WiFi IP, 请确认设备已连接 WiFi")`.
- `adb tcpip 5555` failure -> return contextual `Err("Failed to enable tcpip mode: ...")`.

### 5. Good/Base/Bad Cases

- Good: `adb_connect("192.168.1.10")` calls `adb connect 192.168.1.10:5555`.
- Base: `adb_connect("192.168.1.10:5556")` keeps the explicit port.
- Bad: treating `adb connect` exit status 0 as success without checking stdout can show a false success toast.

### 6. Tests Required

- Build/type check: `cargo check` and `npm run build`.
- Lint: `cargo clippy --all-targets -- -D warnings`.
- Manual device smoke: run `adb tcpip 5555`, `adb connect <ip>:5555`, `adb disconnect <ip>:5555`, then restore with `adb -s <network-serial> usb` before confirming USB serial returns.

### 7. Wrong vs Correct

#### Wrong

```rust
run_adb(app, &["connect", addr])
```

#### Correct

```rust
let output = run_adb(app, &["connect", addr])?;
let lower = output.trim().to_lowercase();
if lower.contains("failed") || lower.contains("unable") || lower.contains("cannot") {
    Err(output.trim().to_string())
} else {
    Ok(output.trim().to_string())
}
```
