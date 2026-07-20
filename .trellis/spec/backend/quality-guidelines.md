# Quality Guidelines

> Rust backend quality standards.

---

## Overview

工具链: Rust stable, `cargo clippy`, `cargo fmt`. 构建: `cargo tauri build`.

---

## Forbidden Patterns

- `unwrap()` on fallible operations (除 Mutex lock).
- `panic!` in command handlers.
- 硬编码路径分隔符 (使用 `PathBuf::join`).
- 阻塞 main thread 的长时间操作 (使用 `tauri::async_runtime::spawn`).

---

## Required Patterns

- 所有 `#[tauri::command]` 函数返回 `Result<T, String>`.
- ADB 调用统一通过 `run_adb` / `run_adb_with_serial` helper.
- 跨平台兼容: 使用 `cfg!(target_os = "...")` 处理平台差异.
- 新 command 必须在 `lib.rs` 的 `generate_handler!` 中注册.

---

## Testing Requirements

当前无单元测试. 验证方式:
1. `cargo clippy --all-targets` 无 warning
2. `cargo build` 成功
3. `pnpm tauri dev` 手动验证功能

---

## Code Review Checklist

- command 是否正确返回 Result 而非 panic
- ADB 命令参数是否安全 (不拼接用户输入为 shell 命令)
- 跨平台: Windows/macOS/Linux 路径和进程处理是否兼容
- 新增依赖是否必要, 是否指定了版本

## Scenario: ADB Port Forward Commands

### 1. Scope / Trigger

- Trigger: adding or changing Tauri commands that wrap `adb forward` or `adb reverse`.
- Applies to device-scoped TCP forward/reverse management in the desktop tools tab.

### 2. Signatures

- `list_port_forwards(app: AppHandle, serial: String) -> Result<Vec<ForwardRule>, String>`
- `add_port_forward(app: AppHandle, serial: String, direction: String, local_port: String, remote_port: String) -> Result<String, String>`
- `remove_port_forward(app: AppHandle, serial: String, direction: String, port: String) -> Result<String, String>`

### 3. Contracts

- `serial`: selected online device serial; every ADB call must use `run_adb_with_serial`.
- `direction`: only `"forward"` or `"reverse"`.
- `local_port` / `remote_port` / `port`: decimal TCP port strings in `1..=65535`.
- `ForwardRule.direction`: `"forward"` or `"reverse"`.
- `ForwardRule.local_port`: host/local TCP port shown by the UI.
- `ForwardRule.remote_port`: device TCP port shown by the UI.
- `ForwardRule.raw`: original ADB list line for diagnostics.
- `forward` add maps to `adb -s <serial> forward tcp:<local> tcp:<remote>`.
- `reverse` add maps to `adb -s <serial> reverse tcp:<remote> tcp:<local>`.
- `reverse --remove` must remove `tcp:<remote>`, not `tcp:<local>`.

### 4. Validation & Error Matrix

- Empty, non-numeric, zero, or `>65535` port -> `Err("Port must be an integer between 1 and 65535.")`.
- Unknown `direction` -> `Err("Invalid direction. Expected forward or reverse.")`.
- ADB stderr failure -> return the `run_adb_with_serial` error to the frontend toast.
- Empty `forward --list` or `reverse --list` -> return an empty vector, not an error.

### 5. Good/Base/Bad Cases

- Good: `forward tcp:49381 tcp:49382` appears as `local_port=49381`, `remote_port=49382`.
- Good: `reverse tcp:49384 tcp:49383` appears as `local_port=49383`, `remote_port=49384`.
- Base: `adb reverse --list` may return `UsbFfs tcp:49384 tcp:49383`; the first column is a transport label, not necessarily the selected serial.
- Bad: filtering `reverse --list` rows by `parts[0] == serial` drops valid rules on real devices.

### 6. Tests Required

- Unit test forward parsing with `serial tcp:L tcp:R`.
- Unit test reverse parsing with both `serial tcp:R tcp:L` and transport-label lines such as `UsbFfs tcp:R tcp:L`.
- Unit test port validation for valid, zero, overflow, and non-numeric input.
- Build checks: `cargo check`, `cargo clippy --all-targets -- -D warnings`, `npm run build`.
- Manual device smoke: add/list/remove one forward rule and one reverse rule, then confirm both temporary rules are cleaned up.

### 7. Wrong vs Correct

#### Wrong

```rust
if parts[0] != serial {
    return None;
}
```

#### Correct

```rust
let tcp_parts: Vec<&str> = parts.iter().copied().filter(|part| part.starts_with("tcp:")).collect();
```

The command already used `-s <serial>`, so parse the scoped output by extracting TCP endpoints instead of trusting the display label in column one.

## Scenario: ADB Screen Recording Commands

### 1. Scope / Trigger

- Trigger: adding or changing Tauri commands that wrap `adb shell screenrecord`.
- Applies to single-device screen recording, local pull, and remote cleanup from the desktop tools tab.

### 2. Signatures

- `start_screen_record(app: AppHandle, serial: String) -> Result<ScreenRecordStatus, String>`
- `stop_screen_record(app: AppHandle) -> Result<ScreenRecordResult, String>`
- `get_screen_record_status() -> Result<ScreenRecordStatus, String>`

### 3. Contracts

- Only one recording session may exist globally.
- Start command spawns `adb -s <serial> shell screenrecord --bugreport --time-limit 180 /sdcard/adb_gui_<timestamp>.mp4`.
- Status returns `active`, `serial`, `elapsed_secs`, and `pending_pull`.
- Stop command must pull to `dirs::picture_dir()/ADB GUI/<safe_serial>-<timestamp>.mp4`.
- Stop command must best-effort delete the remote `/sdcard/adb_gui_*.mp4` file even when pull fails.
- Stop command should open the MP4 with `tauri_plugin_opener` after a successful non-empty pull.

### 4. Validation & Error Matrix

- Start while `active=true` -> `Err("已有录屏正在进行，请先停止当前录屏。")`.
- Start while prior process exited but not pulled -> `Err("已有录屏已结束但尚未保存，请先停止录屏完成保存。")`.
- Stop without active or pending session -> `Err("当前没有正在录制或待保存的录屏。")`.
- Pulled file size is zero -> delete local empty file and return `Err("录屏文件为空，可能录制时间过短或设备端写入失败。")`.
- Remote cleanup failure -> log with `eprintln!`, do not fail an otherwise successful pull.

### 5. Good/Base/Bad Cases

- Good: Natural `--time-limit` expiry leaves a pending session; frontend calls stop to pull and clean up.
- Good: Manual stop sends SIGINT to the device-side `screenrecord` process, then pulls a non-empty MP4.
- Base: Some devices print warnings such as `Could not open module param file ...` while still producing a valid MP4.
- Bad: Directly killing only the local adb child can interrupt the shell before `screenrecord` finalizes the MP4.
- Bad: Relying only on `pkill -2 screenrecord` is less reliable than `pidof screenrecord` followed by `kill -2 <pid>`.

### 6. Tests Required

- Unit test safe serial/path sanitization.
- Build checks: `cargo check`, `cargo clippy --all-targets -- -D warnings`, `npm run build`.
- Manual device smoke: record about 5 seconds, stop via `pidof` + `kill -2`, pull file, assert file size `> 0`, and confirm remote cleanup.
- Manual timeout smoke: run a short `--time-limit` recording, pull file, assert file size `> 0`.

### 7. Wrong vs Correct

#### Wrong

```rust
child.kill()?;
```

#### Correct

```rust
let pid_output = run_adb_with_serial(app, serial, &["shell", "pidof", "screenrecord"])?;
let mut args = vec!["shell", "kill", "-2"];
args.extend(pid_output.split_whitespace());
run_adb_with_serial(app, serial, &args)?;
```

Signal the device-side `screenrecord` process first so Android can finalize the MP4 before the local adb process exits.

## Scenario: ADB Bug Report Collection Commands

### 1. Scope / Trigger

- Trigger: adding or changing Tauri commands that collect bug evidence from a selected ADB device.
- Applies to quick evidence directories and full `adb bugreport` zip generation.

### 2. Signatures

- `collect_quick_bug_report(app: AppHandle, serial: String) -> Result<QuickReportResult, String>`
- `collect_full_bugreport(app: AppHandle, serial: String) -> Result<BugreportResult, String>`

### 3. Contracts

- Quick reports must write to `dirs::document_dir()/ADB GUI/reports/<safe_serial>-<timestamp>/`.
- Quick report output must include `screenshot.png`, `info.txt`, and `logcat.txt`.
- `info.txt` must include current activity plus model, Android version, SDK level, resolution, and battery level.
- Quick logcat collection must use `adb -s <serial> logcat -d -t 50 -v brief`; it must not depend on the frontend Logcat tab buffer.
- Full bugreport must write to `dirs::document_dir()/ADB GUI/reports/<safe_serial>-<timestamp>-bugreport.zip`.
- `adb bugreport [PATH]` accepts a file path; if `PATH` is a directory, adb chooses the filename itself.
- Full bugreport is a long task and must run through an async command plus `tauri::async_runtime::spawn_blocking`, not directly on the main execution path.
- Only one full bugreport worker may run at a time.

### 4. Validation & Error Matrix

- Screenshot capture failure -> return `Err(...)`; quick report is not considered complete without `screenshot.png`.
- Current activity or device info failure -> write an empty value and include a warning in `info.txt`.
- Logcat failure -> write an empty `logcat.txt` and include a warning in `info.txt`.
- Full bugreport while busy -> `Err("完整 Bugreport 正在生成，请等待当前任务完成。")`.
- Full bugreport creates a zero-byte file -> delete it and return `Err("Bugreport 文件为空，请重试。")`.

### 5. Good/Base/Bad Cases

- Good: quick report generates three non-empty files on a real device, and `info.txt` includes `current_activity`.
- Good: full bugreport generates a non-empty zip and reveals it after completion.
- Base: some devices return no useful logcat lines; keep the report directory and preserve the warning.
- Bad: passing the reports directory to `adb bugreport` while the UI expects a deterministic zip filename.
- Bad: implementing quick report as multiple frontend invokes can leave partial success with no single report path.

### 6. Tests Required

- Unit test safe serial/path sanitization.
- Unit test `info.txt` rendering with required fields and warnings.
- Build checks: `cargo check`, `cargo clippy --all-targets -- -D warnings`, `npm run build`.
- Manual device smoke: quick collect, verify `screenshot.png`, `info.txt`, `logcat.txt`, required info fields, and around 50 logcat lines.
- Manual device smoke: full bugreport, verify the zip exists and size is greater than zero.

## Scenario: APK Push Commands

### 1. Scope / Trigger

- Trigger: adding or changing Tauri commands that copy a local APK to a selected ADB device without installing it.
- Applies to the APK tool's push mode and its frontend bridge contract.

### 2. Signatures

- `push_apk(app: AppHandle, serial: String, apk_path: String) -> Result<String, String>`
- `pushApk(serial: string, apkPath: string): Promise<string>`

### 3. Contracts

- `serial` is the selected online device serial; every ADB call must use `run_adb_with_serial`.
- `apk_path` is one local file whose extension is `.apk`, matched case-insensitively.
- The remote directory is owned by the backend and fixed to `/sdcard/Download`.
- The remote file keeps the local basename: `/sdcard/Download/<local-basename>`.
- The command must run `adb -s <serial> shell mkdir -p /sdcard/Download` before `adb -s <serial> push <apk_path> <remote_path>`.
- A successful response is the complete remote path, not raw `adb push` progress output.
- Pushing must not call `adb install`, package manager commands, or an Android package installer intent.
- Run the blocking ADB operations through an async command plus `tauri::async_runtime::spawn_blocking`.

### 4. Validation & Error Matrix

- Missing or non-APK extension -> `Err("仅支持 APK 文件")`.
- Missing or unreadable UTF-8 basename -> `Err("无法读取 APK 文件名")`.
- Remote directory creation failure -> contextual `Err("创建设备下载目录失败: ...")`.
- `adb push` failure -> propagate the ADB stderr returned by `run_adb_with_serial`.
- Background task join failure -> contextual `Err("推送任务执行失败: ...")`.

### 5. Good/Base/Bad Cases

- Good: `release build.APK` returns `/sdcard/Download/release build.APK` and preserves spaces and case.
- Base: an existing remote file with the same basename is overwritten by normal `adb push` behavior.
- Bad: accepting a frontend-provided remote path creates a second source of truth and allows the UI to drift from the backend contract.
- Bad: running `adb install` after a successful push violates push mode's no-install guarantee.

### 6. Tests Required

- Unit test case-insensitive APK extension handling and exact remote path generation.
- Unit test rejection of a non-APK extension.
- Build checks: `cargo test`, `cargo clippy --all-targets -- -D warnings`, and `pnpm build`.
- UI smoke: install mode remains the default; push mode updates the action label and `/sdcard/Download` hint.
- Manual device smoke: push one APK, verify the returned path exists with `adb -s <serial> shell ls -l <remote_path>`, and confirm the package was not installed.

### 7. Wrong vs Correct

#### Wrong

```typescript
await invoke("push_apk", {
  serial,
  apkPath,
  remotePath: `/sdcard/Download/${fileName}`,
});
```

#### Correct

```typescript
const remotePath = await invoke<string>("push_apk", { serial, apkPath });
```

The backend owns filename validation and remote path construction so all callers use the same destination contract.
