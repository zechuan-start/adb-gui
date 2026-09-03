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

Rust commands and pure helpers use colocated `#[cfg(test)]` unit tests. Verification order:

1. `perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml`
2. `cargo fmt --manifest-path src-tauri/Cargo.toml --check`
3. `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
4. Run the scenario-specific real-device smoke checks below when behavior crosses the ADB boundary.

---

## Code Review Checklist

- command 是否正确返回 Result 而非 panic
- ADB 命令参数是否安全 (不拼接用户输入为 shell 命令)
- 跨平台: Windows/macOS/Linux 路径和进程处理是否兼容
- 新增依赖是否必要, 是否指定了版本

## Scenario: Hidden ADB Child Processes on Windows

### 1. Scope / Trigger

- Trigger: adding or changing any synchronous or asynchronous host process used for ADB discovery, polling, streaming, or device operations.
- Applies to release builds that use the Windows GUI subsystem and therefore have no parent console for child console applications to inherit.

### 2. Signatures

- `new_command(program: &str) -> std::process::Command`
- `prepare_command(app: &AppHandle, adb_path: &str) -> std::process::Command`
- `prepare_async_command(app: &AppHandle, adb_path: &str) -> tokio::process::Command`
- `which_adb() -> Result<String, String>` must create `where` / `which` through the shared synchronous constructor.

### 3. Contracts

- On Windows, every host console process created by the ADB infrastructure uses `CREATE_NO_WINDOW` (`0x08000000`).
- Both `std::process::Command` and `tokio::process::Command` paths have the same hidden-window behavior.
- On macOS and Linux, command creation remains unchanged.
- Process arguments, exit status, stdout, stderr, and existing `Result<T, String>` behavior are unchanged.

### 4. Validation & Error Matrix

- Windows GUI release + missing `CREATE_NO_WINDOW` -> each short ADB poll can flash a console window.
- Windows async ADB stream + missing `CREATE_NO_WINDOW` -> a console window can remain visible for the stream lifetime.
- Non-Windows build -> do not import `std::os::windows::process::CommandExt` or apply Windows creation flags.
- Hidden child exits with an error -> preserve stderr and status handling; hiding the window must not hide the error from the caller.

### 5. Good/Base/Bad Cases

- Good: the three-second `adb devices -l` poll runs repeatedly in a Windows release build without creating a visible console window.
- Base: `where adb` and `adb version` run once during startup through the same hidden synchronous constructor.
- Good: logcat uses the hidden async constructor and still exposes piped stdout.
- Bad: calling `Command::new("adb")` directly from a command module bypasses the Windows flag and can reintroduce flashing windows.

### 6. Tests Required

- Windows compile check: `cargo check --manifest-path src-tauri/Cargo.toml` must compile both creation-flag call sites.
- Regression suite: `cargo test --manifest-path src-tauri/Cargo.toml` and Clippy must pass.
- Release smoke: build with `pnpm tauri build --no-bundle`, connect an ADB device or emulator, run for at least two device-poll intervals, and assert that device/activity updates continue with no Console, Command Prompt, or Terminal window appearing.

### 7. Wrong vs Correct

#### Wrong

```rust
let command = Command::new(adb_path);
```

#### Correct

```rust
let mut command = Command::new(program);
#[cfg(windows)]
command.creation_flags(CREATE_NO_WINDOW);
```

## Scenario: Windows Reinstall with a Bundled ADB Server

### 1. Scope / Trigger

- Trigger: changing the embedded Platform Tools bundle, Windows NSIS installer/updater hooks, ADB path resolution, or application shutdown.
- The installed `windows/adb.exe` can fork a server that outlives `adb-gui.exe`. That server keeps `AdbWinApi.dll` and `AdbWinUsbApi.dll` loaded, so a reinstall can fail with `Error opening file for writing` even after the UI has closed.

### 2. Signatures

- Runtime cleanup helper: `shutdown_embedded_adb_server(app: &AppHandle) -> Result<(), String>`.
- NSIS lifecycle hooks: `!macro NSIS_HOOK_PREINSTALL` and `!macro NSIS_HOOK_PREUNINSTALL`, registered through `bundle.windows.nsis.installerHooks`.
- Graceful server command: `<installed resource dir>/windows/adb.exe kill-server`.

### 3. Contracts

- Treat the ADB server as a separately owned process, not as a child whose lifetime automatically follows `adb-gui.exe`.
- Runtime shutdown must run after direct ADB children such as Logcat have stopped and before the application process exits.
- Only stop a server whose resolved executable path is inside this application's installed resource directory. A server from Android Studio, an SDK, or `PATH` is external state and must not be terminated merely because its process name is `adb.exe`.
- The NSIS preinstall hook is authoritative for upgrades and reinstalls because an already released version may not contain runtime cleanup. It must inspect running process executable paths, stop an exact-path bundled server, wait for that process to exit, and only then allow file replacement.
- Apply the same ownership-aware cleanup before uninstalling so the resource directory can be removed completely.
- Do not use `adb server-status` only to test whether a server exists: with no server running, that command starts one and creates the lock being checked. On Windows, inspect the process table without launching ADB; `server-status` is diagnostic only after an existing server has been established.

### 4. Validation & Error Matrix

- No `adb.exe` from the install directory is running -> continue install/uninstall without launching ADB.
- Exact install-directory server is running -> request `kill-server`, wait for exit, then replace/remove both ADB DLLs.
- An `adb.exe` from another absolute path is running -> leave it untouched and continue; it does not own the bundled DLLs.
- Bundled server does not exit before the timeout -> abort before copying files and show an actionable close/retry error; never recommend Ignore because that produces a mixed-version Platform Tools directory.
- Runtime exit cleanup fails -> log the error and allow app exit; the installer hook remains the recovery boundary.
- Old `windows/adb.exe` is missing -> skip the graceful command and continue unless an exact-path process still owns the resource files.

### 5. Good/Base/Bad Cases

- Good: launch the installed app, let `adb devices -l` start the bundled server, close the app, and reinstall without a write error for either ADB DLL.
- Good: reinstall a legacy build while its bundled server is still running; the new installer's preinstall hook releases the old DLLs before extraction.
- Base: Android Studio has an SDK `adb.exe` server running from another directory; reinstall succeeds without stopping that external server.
- Bad: cleaning only `adb-gui.exe` or direct Logcat children leaves the forked server alive and the DLLs locked.
- Bad: unconditional `taskkill /IM adb.exe /F` disrupts unrelated development tools and violates executable-path ownership.
- Bad: relying only on the new application's exit handler cannot repair reinstallation from versions released before that handler existed.

### 6. Tests Required

- Rust unit tests must cover embedded-path matching, case-insensitive Windows path comparison, missing cached ADB state, and external SDK paths.
- Installer smoke: record the PID and `ExecutablePath` of the bundled server, run a same-version reinstall, and assert that the PID exits and the installed `AdbWinApi.dll` hash matches the package.
- Upgrade smoke: repeat from the last public installer to the candidate installer so the NSIS hook, not new runtime code, proves backward recovery.
- External-server smoke: start ADB from a different SDK directory, reinstall, and assert that exact PID is still running.
- Uninstall smoke: start the bundled server, uninstall, and assert that no install-directory process or ADB DLL remains.
- Diagnostic command on Windows:

```powershell
Get-CimInstance Win32_Process -Filter "Name = 'adb.exe'" |
  Select-Object ProcessId, ExecutablePath, CommandLine
```

### 7. Wrong vs Correct

#### Wrong

```nsh
nsExec::ExecToLog 'taskkill /IM adb.exe /F'
```

#### Correct

```text
1. Enumerate running adb.exe processes without starting a new ADB server.
2. Match the normalized executable path against $INSTDIR\windows\adb.exe.
3. Ask that installed executable to run kill-server and wait for the matched PID to exit.
4. Abort before extraction if the exact-path process still owns the DLLs.
```

## Scenario: Batch Android Application Metadata Helper

### 1. Scope / Trigger

- Trigger: changing the `app_process` dex helper, either app-info Tauri command, its payload, or the application-manager fallback.
- Applies across `scripts/build-app-info-dex/`, `src-tauri/src/commands/app_info.rs`, `src/lib/tauri.ts`, and `PackageManager.tsx`.

### 2. Signatures

- Java entry point: `com.adbgui.appinfo.Main.main(String[] args)`.
- Rust command: `get_installed_apps(app: AppHandle, serial: String) -> Result<Vec<AppInfo>, String>`.
- Rust command: `get_installed_app_icons(app: AppHandle, serial: String, packages: Option<Vec<String>>) -> Result<Vec<AppIconEntry>, String>`.
- Frontend bridge: `getInstalledApps(serial: string) -> Promise<AppInfo[]>`.
- Frontend bridge: `getInstalledAppIcons(serial: string, packages?: string[]) -> Promise<AppIconEntry[]>`.
- `AppInfo { packageName, appName, versionName, versionCode, icon, firstInstallTime, lastUpdateTime, apkSize }`.
- `AppIconEntry { packageName, icon }`; extra fields from an old dex must be ignored.

### 3. Contracts

- `scripts/build-app-info-dex/build.sh` accepts `ANDROID_HOME` or `ANDROID_SDK_ROOT`, requires an API 29+ `android.jar`, `javac`, and `d8`, then writes `src-tauri/resources/app-info.dex`.
- The build script must run with macOS Bash 3.2; avoid Bash 4-only helpers such as `mapfile` and GNU-only `find`/`sort` flags.
- Resolve `ActivityThread` through reflection. Prefer `systemMain()` and fall back to a no-argument `ActivityThread` plus `getSystemContext()`; print both failed bootstrap stacks to stderr.
- Tauri maps `src-tauri/resources/` to the resource root, so Rust resolves `resource_dir().join("app-info.dex")`.
- Name the remote dex `/data/local/tmp/adb-gui-app-info-<fnv1a64>.dex`. Under one process-wide async mutex, skip `adb push` only when `ls -l` contains the expected byte length; use 30 seconds for inspect/push.
- Invoke metadata with `--no-icons` and a 45-second timeout. Invoke icons with `--icons-only [package...]`, 50 packages per frontend batch, and a 90-second timeout per batch.
- Java writes `--ADBGUI-APPINFO-V1--\n` followed by one UTF-8 JSON array through a buffered `FileDescriptor.out` stream. Rust parses after the last sentinel and accepts unsentinelled whole-array output from the old dex.
- Return only non-system applications. Icons are 96 x 96 PNG data URIs; APK size is the base APK only. A single field failure produces an empty/zero fallback for that field, while a helper/process/protocol failure rejects the complete command.
- Render metadata before background icon batches. A metadata failure falls back to unchanged `list_packages`, lazy `get_app_icon`, and a degraded-mode notice with details and retry.
- Every icon batch issue and state write is guarded by the current request ID. If an old dex returns packages outside the requested batch, cache all entries and stop batching. A batch error preserves prior batches and enables lazy icons.

### 4. Validation & Error Matrix

- Missing SDK root, API 29+ platform, `javac`, or `d8` -> the build script exits nonzero with the missing requirement named.
- Missing bundled dex or failed `adb push` -> contextual `Err`; do not start `app_process`.
- Nonempty icon filter whose names are all invalid after `[A-Za-z0-9_.]` validation -> `Err`; never turn it into an unfiltered request. Missing or empty filters mean all icons.
- Push failure -> force one retry. Nonzero helper exit or invalid payload after a skipped push -> force one push and retry. `adb exec-out` may report success while a corrupt remote dex prints `Aborted`, so host exit status alone is not proof that the helper ran. The same failure after a fresh push -> return a ROM/protocol error without another retry.
- Helper timeout -> kill on drop, set the next call to force-push, and return immediately with retry guidance; do not automatically repeat the timed-out helper.
- Empty or invalid JSON stdout after a fresh push -> `Err`; never return a partial Rust vector. After a skipped push, treat it as evidence that the cached dex may be corrupt and refresh once.
- One app label, icon, package-info, or file-size read fails -> keep that app with the field fallback and continue the array.
- Batch command error plus successful legacy list -> show package-only rows and degraded notice.
- Both batch and legacy list fail -> show the existing application-list error feedback.

### 5. Good/Base/Bad Cases

- Good: metadata arrives without icon rendering, then icons appear batch by batch while the list remains usable.
- Base: the checked-in old dex ignores mode/filter flags and emits no sentinel; the first icon batch returns a superset, which fills the cache and stops later batches.
- Base: an app whose icon cannot be drawn has an empty `icon`, but other apps and fields remain available.
- Good: an Android version/vendor incompatibility rejects the batch command and automatically renders the legacy list with a visible warning.
- Bad: per-serial locks allow USB and Wi-Fi serials for one device to overwrite the same remote dex concurrently.
- Bad: retrying a timeout in the same request doubles the wait; retrying every old-dex icon batch repeats full icon rendering.
- Bad: sending package text to `sh -c` without the strict whitelist creates command injection risk.

### 6. Tests Required

- Rust unit tests cover FNV/path stability, last-sentinel and legacy parsing, size matching, UTF-8-safe truncation, package validation/deduplication, batching, command assembly, and JSON contract failures.
- Frontend helper tests cover package chunk boundaries and requested-batch superset detection, in addition to fallback, sorting, and search.
- Run `bash -n scripts/build-app-info-dex/build.sh`, Rust test/fmt/Clippy gates, frontend tests, and `pnpm build`.
- On a JDK + Android SDK host, run the build script and assert a non-empty `src-tauri/resources/app-info.dex`.
- Real-device smoke on Android 10+ must compare count with `pm list packages -3`, verify metadata-first timing and gradual 96 x 96 icons, switch devices during icon batches, and exercise retry after a forced failure.
- Compatibility smoke must run the new Rust/frontend code with the checked-in old dex and assert that unsentinelled full output and the first-batch superset remain usable.

### 7. Wrong vs Correct

#### Wrong

```typescript
for (const batch of batches) {
  void getInstalledAppIcons(serial, batch);
}
```

#### Correct

```typescript
for (const batch of batches) {
  if (loadRequestRef.current !== requestId) return;
  const entries = await getInstalledAppIcons(serial, batch);
  if (loadRequestRef.current !== requestId) return;
  cacheEntries(entries);
  if (hasUnrequestedPackages(entries, batch)) break;
}
```

Sequential guarded batches bound lock occupancy and prevent stale device writes; the superset check preserves old-dex compatibility without repeating full icon work.

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

## Scenario: Device File Workspace Commands

### 1. Scope / Trigger

- Trigger: adding or changing device directory browsing, folder creation, upload, download, or image preview commands.
- Applies to `commands/device_files.rs`, the Tauri bridge payloads, and the top-level file workspace.
- APK installation remains in `commands/app.rs`; general file upload must not be added back to the APK tool.

### 2. Signatures

- `list_device_directory(app, serial, path: Option<String>) -> Result<DeviceDirectoryListing, String>`
- `create_device_directory(app, serial, parent_path, name) -> Result<DeviceFileEntry, String>`
- `upload_device_file(app, serial, local_path, remote_dir) -> Result<DeviceTransferResult, String>`
- `download_device_file(app, serial, remote_path, local_path) -> Result<DeviceTransferResult, String>`
- `preview_device_image(app, serial, remote_path) -> Result<DeviceImagePreview, String>`
- `DeviceFileEntry { name, path, kind, size, modified_at, previewable }`
- `DeviceDirectoryListing { path, parent, entries }`
- `DeviceTransferResult { name, remote_path, local_path }`
- `DeviceImagePreview { data_url, mime_type, size }`

### 3. Contracts

- Every ADB call is scoped with `-s <serial>` through the shared device command helpers.
- `path = None` means the backend-owned default `/sdcard/Download`; the frontend must not define another default-path constant.
- Remote paths are absolute, reject NUL, collapse repeated separators and `.`, and reject `..` that crosses root.
- Shell-bound paths use the shared POSIX single-quote encoder. Frontend strings never become raw shell fragments.
- Directory enumeration uses `adb exec-out` with a controlled device shell script and NUL-delimited `kind, size, modified_at, absolute_path` records. The parser may remove only trailing CR/LF after the binary payload; do not parse `ls` columns or route the protocol through `adb shell`.
- Listing order is stable: directories first, then non-directories; each group is sorted case-insensitively by name.
- `previewable` is a backend hint based on file kind and extension. Preview validity still depends on backend magic-byte verification.
- Upload accepts one local ordinary file per command. The frontend serializes multi-file batches and preserves per-item results.
- Frontend device operations capture an immutable `{ serial, revision }` context. Device changes and file-workspace unmounts increment `revision`; serial equality alone is not a freshness check because A -> B -> A reuses the same serial.
- Device changes clear operation and folder busy flags before paint. Every async `finally` may clear those flags only while its captured `{ serial, revision }` remains current, so an old ADB completion cannot unlock a newer device operation.
- Sequential uploads revalidate the captured operation context before and after every command. Once stale, they do not start another item, refresh the old directory, or emit completion feedback.
- Upload validates the target with `[ -d ]` and `[ -x ]`; it must not enumerate and discard the full directory listing. It never intentionally overwrites an existing device path and checks `name.ext`, `name (1).ext`, and so on immediately before `adb push`.
- Download writes to a sibling temporary file, verifies the byte count against device `stat`, then replaces the user-confirmed target. An existing target is backed up and restored if replacement fails.
- Preview supports PNG, JPEG, WEBP, and GIF magic bytes. After the size pre-check, device-side `head -c 20971521` caps stdout at `20 MiB + 1`; the extra byte detects concurrent growth without allowing unbounded host memory use.
- The file list shows loading while the selected online serial and reducer serial differ or before the first path succeeds. It shows an empty directory only when the current context matches and `state.path` is non-empty.
- A finished transfer with any failed items displays the success/failure counts; `status != "running"` is not equivalent to success.
- Blocking ADB and local file IO run through async commands plus `tauri::async_runtime::spawn_blocking`.

### 4. Validation & Error Matrix

- Relative, empty, NUL-containing, or above-root remote path -> contextual `Err` before ADB execution.
- New directory name is empty, `.`, `..`, contains `/`, or already exists -> `Err`; never switch to `mkdir -p`.
- Device directory does not exist, lacks permission, returns malformed records, or lacks required `stat -c` -> explicit listing error; no `ls` fallback.
- Upload local path is missing or not a regular file -> `Err("只支持上传普通文件, 不支持目录")` or contextual local IO error.
- No free upload name within the bounded attempts -> explicit auto-rename error; never overwrite as fallback.
- Download remote path is not a file -> explicit device file size/type error.
- Download target is relative, has no filename, has a missing parent directory, or is a directory -> explicit local target error.
- Pull failure or byte-count mismatch -> remove only the new temporary file and preserve the old target.
- Replacement failure -> restore the backup; if restore also fails, return the backup path in the error.
- Preview over 20 MiB, incomplete read, or unsupported magic bytes -> explicit preview error and no data URL.
- Background join failure -> operation-specific task error.

### 5. Good/Base/Bad Cases

- Good: listing `/sdcard/Download` returns hidden files, Chinese names, spaces, metadata, normalized paths, and stable ordering.
- Good: uploading `photo.jpg` twice creates `photo.jpg` then `photo (1).jpg` without changing the first file.
- Good: downloading over an existing local target replaces it only after the complete temporary pull succeeds.
- Good: selecting a renamed PNG still fails preview if the bytes are not a supported image.
- Base: a non-root device returns permission denied for `/data`; surface that error and keep the previous directory visible.
- Bad: concatenating `remoteDir + "/" + name` in React or passing an unescaped path to `adb shell` creates a second path authority and shell-injection risk.
- Bad: parsing `ls -l` with whitespace splitting corrupts names containing spaces and varies across Android versions.
- Bad: using `adb shell` for NUL-delimited records can append terminal line endings; accepting arbitrary trailing bytes hides protocol corruption.
- Bad: reading `adb exec-out cat` to completion and checking the vector length afterward does not enforce the 20 MiB memory limit.
- Bad: pulling directly into the final local target can destroy an existing file when ADB fails partway.
- Bad: restoring `push_file` in `commands/app.rs` recreates a competing upload entry point.

### 6. Tests Required

- Rust unit tests assert path normalization/root rejection, shell quoting, directory record integrity including trailing CR/LF, stable sorting, and hidden/UTF-8 names.
- Rust unit tests assert numbering before extensions, preview magic-byte recognition, and device-side `20 MiB + 1` output capping.
- Frontend reducer/helper tests assert device reset, current-context loading versus loaded empty state, latest-request wins for listings, stale-preview rejection, mixed transfer results, and failure-count summaries.
- Frontend operation-context tests assert stale snapshots are rejected after A -> B -> A and file-workspace unmount invalidation.
- Build checks: 60-second `cargo test`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `pnpm test`, and `pnpm build`.
- Browser smoke: file tab, no-device state, 1200x800 and 900x600 layout, light/dark themes, and no overlap.
- Real-device smoke: default listing, absolute path navigation, hidden/UTF-8 names, folder collision, auto-renamed multi-upload, save-dialog download, preview formats/limit, permission failure, and device switching.

### 7. Wrong vs Correct

#### Wrong

```typescript
await invoke("upload_device_file", {
  serial,
  localPath,
  remotePath: `${currentPath}/${localFileName}`,
});
```

#### Correct

```typescript
const result = await uploadDeviceFile(serial, localPath, currentDirectory.path);
// Use result.remote_path: the backend selected and validated the final name.
```

The backend owns normalized device paths, shell quoting, collision checks, final names, and preview validation. The frontend owns selection, rendering, sequential batch orchestration, and stale-response rejection.

## Scenario: Streaming Logcat Format and Parsing

### 1. Scope / Trigger

- Trigger: changing the streaming Logcat command, batching, session lifecycle, event payloads, or `parse_logcat_line` in `src-tauri/src/commands/logcat.rs`.
- Does not apply to quick bug report collection, which intentionally uses a one-shot `-v brief` dump (see the bug report scenario above).

### 2. Signatures

- `start_logcat(app: AppHandle, serial: String) -> Result<LogcatSessionInfo, String>`
- `stop_logcat(serial: String, session_id: u64) -> Result<(), String>`
- `shutdown_logcat_sessions() -> Result<(), String>`
- `decode_logcat_record(bytes: &[u8]) -> String`
- `read_logcat_record(reader, record_bytes) -> Result<Option<String>, std::io::Error>`
- `LogcatSessionInfo { serial, session_id }`
- `LogcatBatch { serial, session_id, lines: Vec<LogcatLine> }`
- `LogcatExit { serial, session_id, reason, detail }`
- `LogcatLine { time, level, tag, pid, tid, message, raw }`

### 3. Contracts

- Spawn through `adb::prepare_async_command` with `adb -s <serial> logcat -T 5000 -v threadtime`; never construct a parallel ADB process path.
- Keep one `LogcatSession` per serial. Allocate globally increasing `session_id` values, and serialize starts with a per-serial lock so different devices remain independent.
- A same-serial replacement must remove and fully stop/wait the registered child before spawning its successor. Wireless mDNS transports can tear down a just-opened stream when the older client exits, so overlapping old/new `adb logcat` clients are forbidden.
- If the previous child cannot be confirmed stopped, return that error and do not spawn a replacement.
- `stop_logcat` removes and kills a process only when both serial and `session_id` match. A serial-only stop is unsafe because A -> B -> A reuses the same serial.
- Never hold `LOGCAT_SESSIONS` across `child.kill().await` or another process wait.
- Spawn every streaming child with `kill_on_drop(true)` as abnormal-path protection. Normal application exit must set a shutdown gate, atomically drain every registered session under the mutex, release the mutex, then attempt `start_kill + wait` for every drained child while aggregating failures.
- Wire shutdown only to Tauri `RunEvent::Exit` and synchronously await it before the process exits. Do not use `ExitRequested`, because macOS close/hide and `Reopen` must keep the application lifecycle intact.
- Emit `logcat-batch` after 200 lines or 50 ms from the first buffered line, whichever occurs first. Do not reset the deadline after each line and do not emit empty batches.
- Emit `logcat-exit` for stdout EOF or read failure. Preserve an UTF-8-safe stderr tail of about 2 KiB, and provide a non-empty `detail` even when EOF has no stderr.
- Treat stdout as a byte stream. Frame records with `read_until(b'\n')`, remove only the final LF and optional preceding CR, then decode that record with `String::from_utf8_lossy`. Invalid byte sequences become U+FFFD in that record and must not terminate the stream.
- A 50 ms batch timeout may cancel an in-progress `read_until`; retain the same partial byte buffer for the next read so cancellation cannot drop the beginning of a record.
- Rust and TypeScript payloads must stay field-for-field aligned. `serial` belongs to `LogcatBatch` and `LogcatExit`, not to every `LogcatLine`.
- Streaming Logcat uses `-v threadtime`; `raw` keeps the complete device line so exports retain device timestamps.
- Parse regexes must be file-level `static LazyLock<Regex>`, never compiled inside the per-line function.
- Unparseable lines such as `--------- beginning of main` fall back to level `I`, empty `time/tag/pid/tid`, and `message = raw`; never drop them.
- Tag/message split happens at the first `: ` separator; tags containing colons are truncated at the first colon (accepted limitation).

### 4. Validation & Error Matrix

- ADB resolution, spawn, or pipe capture failure -> return contextual `Err`; kill a partially started child before returning.
- Concurrent same-serial starts -> serialize them; each replacement stops the currently registered child before spawning and registering its successor.
- Previous same-serial child stop/wait failure -> return `Err` without spawning a new child.
- Start races with application shutdown -> reject the candidate after spawn, kill and wait for it, and never insert it into the session map.
- Stop or reader cleanup has a non-matching `session_id` -> no-op for the map entry; never affect the current process.
- Application exit -> close the registration gate, drain the map without awaiting under the mutex, and attempt to stop every drained child. One failure must not skip later sessions; return one aggregated error after all attempts.
- Stdout EOF -> flush the final non-empty batch, remove only the matching session, and emit exit reason `eof` with non-empty detail.
- Stdout read failure -> flush the final non-empty batch and include both the read error and stderr tail when available.
- Invalid UTF-8 inside one stdout record -> replace only the invalid sequence with U+FFFD, emit the decoded record, and continue reading subsequent records without a disconnect event.
- Regex mismatch -> fallback `LogcatLine`, no command error.
- Empty message lines (with or without trailing separator space) must still parse.
- Event emission failure -> report with `eprintln!` while still completing process cleanup.

### 5. Good/Base/Bad Cases

- Good: a continuous stream of 40 ms-spaced lines flushes 50 ms after the first line rather than extending the batch window for seconds.
- Good: concurrent same-serial starts share one serial-scoped lock; the successor is spawned only after the registered predecessor has exited.
- Good: starts for two different serials use different locks and do not wait on each other.
- Good: a late `stop_logcat(serial, 10)` cannot kill active session 11.
- Good: `first <0xff> record\nsecond record\n` emits two records; only the invalid byte in the first becomes U+FFFD.
- Good: `07-26 14:23:45.123  1234  5678 E AndroidRuntime: FATAL EXCEPTION: main` keeps the colons inside `message`.
- Base: CRLF is removed while stack-trace indentation and trailing message spaces remain byte-for-byte after decoding.
- Bad: using a timeout around each `next_line()` call turns the 50 ms batch window into an idle timeout.
- Bad: `AsyncBufReadExt::lines()` treats one invalid UTF-8 byte as a fatal stream error and disconnects Logcat.
- Bad: awaiting `kill()` while holding the session mutex serializes unrelated devices and risks lock contention.
- Bad: adding or moving a payload field without updating `src/lib/tauri.ts` and frontend lifecycle tests.

### 6. Tests Required

- Unit-test the 200-line limit, fixed 50 ms trigger, exact session matching, per-serial start-lock identity, stop-before-start ordering, stop-failure spawn prevention, session-map drain, all-session stop error isolation, and all exit-detail combinations.
- Unit-test invalid UTF-8 followed by another valid record, CRLF removal, leading/trailing whitespace preservation, and continuation from a partially buffered record.
- Preserve parsing regressions for standard lines, message colons, tag colons, separators, empty messages, and stack-trace indentation.
- Run the 60-second Rust test gate, `cargo fmt --check`, and `cargo clippy --all-targets -- -D warnings`.
- Run frontend tests and build to verify the Rust/TypeScript payload contract.
- Device smoke must cover initial dump, low/high traffic, A -> B -> A switching, stream interruption, non-empty disconnect detail, and continued streaming on a device that previously produced invalid UTF-8.
- Wireless-device smoke must perform at least two consecutive same-serial Restarts and assert that each fresh session resumes nonzero rows; emulator-only Restart coverage cannot prove the mDNS ordering contract.
- Exit smoke must record the active application's direct `adb logcat` PID, send normal Cmd+Q, and assert that both the application and that exact child PID disappear without the child becoming PPID 1.

### 7. Wrong vs Correct

#### Wrong

```rust
let mut sessions = LOGCAT_SESSIONS.lock().await;
if let Some(mut session) = sessions.remove(&serial) {
    session.child.kill().await?;
}
```

#### Correct

```rust
let session = {
    let mut sessions = LOGCAT_SESSIONS.lock().await;
    session_matches(sessions.get(&serial).map(|item| item.session_id), session_id)
        .then(|| sessions.remove(&serial))
        .flatten()
};
if let Some(mut session) = session {
    let _ = session.child.kill().await;
}
```

Resolve exact ownership while locked, then release the mutex before awaiting process termination.

For same-serial replacement, never overlap the old and new adb clients:

```rust
// Wrong: closing `previous` can tear down the newly opened mDNS stream.
let child = adb::prepare_async_command(&app, &adb_path)
    .arg("-s")
    .arg(&serial)
    .arg("logcat")
    .spawn()?;
let previous = {
    let mut sessions = LOGCAT_SESSIONS.lock().await;
    sessions.insert(serial.clone(), LogcatSession { child, session_id })
};
if let Some(previous) = previous {
    stop_logcat_session(previous).await?;
}

// Correct: serialize by serial and confirm the predecessor exited first.
let start_lock = logcat_start_lock(&serial).await;
let _guard = start_lock.lock().await;
let previous = {
    let mut sessions = LOGCAT_SESSIONS.lock().await;
    sessions.remove(&serial)
};
let child = start_after_stopping(previous, stop_logcat_session, || {
    adb::prepare_async_command(&app, &adb_path)
        .arg("-s")
        .arg(&serial)
        .arg("logcat")
        .spawn()
        .map_err(|error| error.to_string())
})
.await?;
```

For stdout framing, do not use `lines()`:

```rust
// Wrong: one invalid byte terminates the complete stream.
let mut lines = BufReader::new(stdout).lines();
let line = lines.next_line().await?;

// Correct: preserve partial bytes across batch timeouts and decode per record.
let mut record_bytes = Vec::new();
let bytes_read = reader.read_until(b'\n', &mut record_bytes).await?;
let line = decode_logcat_record(&record_bytes);
record_bytes.clear();
```

## Scenario: Logcat Package PID Resolution

### 1. Scope / Trigger

- Trigger: changing `get_package_pids`, its ADB output handling, or a caller that still explicitly uses this compatibility command.
- Applies to the distinction between a package with no running process and an ADB/device failure.

### 2. Signatures

- `get_package_pids(app: AppHandle, serial: String, pkg: String) -> Result<Vec<String>, String>`
- `is_pidof_no_process(status_code: Option<i32>, stdout: &[u8], stderr: &[u8]) -> bool`
- Frontend bridge: `getPackagePids(serial: string, pkg: string) -> Promise<string[]>`

### 3. Contracts

- Execute `adb -s <serial> shell pidof <pkg>` through `run_adb_output_with_serial` so status, stdout, and stderr remain available.
- Exit success returns every whitespace-separated PID from stdout.
- Only exit code 1 with whitespace-only stdout and stderr means the package has no running process and returns `Ok([])`.
- Every other non-success result uses `adb_output_error` and returns `Err`; disconnected, offline, permission, transport, signal, and diagnostic failures are not empty PID sets.
- Callers must keep a command error distinguishable from a successful empty result.

### 4. Validation & Error Matrix

- Status 0 with PID text -> `Ok([pid...])`.
- Status 0 with empty output -> `Ok([])`.
- Status 1 with empty/whitespace-only stdout and stderr -> `Ok([])`.
- Status 1 with any stderr or stdout diagnostic -> `Err(adb_output_error(...))`.
- Missing exit code, another nonzero code, ADB spawn failure, or device transport failure -> `Err`; never map to no process.

### 5. Good/Base/Bad Cases

- Good: `pidof com.example.app` prints `123 456` and a compatibility caller receives both values.
- Base: a stopped package makes `pidof` exit 1 silently and resolves to an empty set.
- Bad: `unwrap_or_default()` converts `device offline` into an empty set and prevents the caller from distinguishing transport failure from a stopped package.

### 6. Tests Required

- Unit-test silent exit 1, whitespace-only output, exit 0 empty output, exit 1 with stderr, missing status code, and other nonzero statuses.
- Run the 60-second Rust test gate and Clippy after changing the command or helper.
- Emulator smoke must cover a running package, a stopped package, and a disconnected/offline error; assert that only the stopped package is reported as a successful empty result.

### 7. Wrong vs Correct

#### Wrong

```rust
run_adb_with_serial(&app, &serial, &["shell", "pidof", &pkg])
    .map(|stdout| stdout.split_whitespace().map(str::to_owned).collect())
    .or_else(|_| Ok(Vec::new()))
```

#### Correct

```rust
let output = run_adb_output_with_serial(&app, &serial, &["shell", "pidof", &pkg])?;
if output.status.success() {
    return Ok(String::from_utf8_lossy(&output.stdout)
        .split_whitespace()
        .map(ToString::to_string)
        .collect());
}
if is_pidof_no_process(output.status.code(), &output.stdout, &output.stderr) {
    return Ok(Vec::new());
}
Err(adb_output_error(&output))
```

An empty process set is domain data; an ADB failure is an error and must remain one.

## Scenario: Logcat Device Process Snapshot

### 1. Scope / Trigger

- Trigger: changing `list_device_processes`, Android `ps` compatibility, the frontend process-map lifecycle, or Logcat process/package attribution.
- Applies across `src-tauri/src/commands/logcat.rs`, the Tauri bridge, the shared Activity polling controller, and `useLogcatStore`.

### 2. Signatures

- `list_device_processes(app: AppHandle, serial: String) -> Result<Vec<ProcessEntry>, String>`
- `ProcessEntry { pid: String, name: String }`
- `parse_process_table(output: &str) -> Result<Vec<ProcessEntry>, String>`
- `next_process_ps_attempt(attempt, status_code, stdout, stderr) -> Option<ProcessPsAttempt>`
- Frontend bridge: `listDeviceProcesses(serial: string) -> Promise<ProcessEntry[]>`
- Frontend row identity: `LogcatEntry { processName: string | null, packageName: string | null, ... }`

### 3. Contracts

- Every attempt executes through `run_adb_output_with_serial`, so the selected serial is passed as one `adb -s <serial>` argument and no device value is interpolated into a shell string.
- Try `shell ps -A -o PID,NAME` first. An explicit unsupported `-o` falls back to `shell ps -A`; an explicit unsupported `-A` from either the formatted or second attempt falls back directly to plain `shell ps`.
- Offline, unauthorized, missing-device, transport, protocol, and ambiguous-serial diagnostics are connection failures. Return them unchanged; never convert them into an option fallback.
- Parse PID and process name by locating `PID` plus `NAME`, `CMD`, or `COMMAND` in the table header. Accept only decimal non-empty PIDs, skip malformed rows, and fail the complete snapshot when no supported header exists.
- A successful frontend refresh replaces the complete PID map and timestamps it at completion. It must not merge with the previous map because Android can reuse a PID after process exit.
- The snapshot is trusted for new Logcat rows for at most the shared 5-second polling period. Refresh failure may retain the old map for diagnostics but must not renew its timestamp.
- Freeze `processName` and the validated application-style `packageName` when each row arrives, including rows queued while paused. Missing or expired identities remain `null` forever; a future snapshot must not backfill or reinterpret historical rows.
- Process loading shares the existing Activity poll. Activity and process results publish independently, while device changes and Restart create a new generation that rejects A -> B -> A late completions.
- The command must remain registered in Tauri `generate_handler!`, and Rust/TypeScript `ProcessEntry` fields must stay aligned.

### 4. Validation & Error Matrix

- Formatted command succeeds with a supported header -> parse and return the complete snapshot.
- Formatted command reports unsupported `-o` -> try `ps -A`.
- Formatted or `ps -A` command reports unsupported `-A` -> try plain `ps`.
- Any attempt reports a connection/transport/authorization/ambiguous-device failure -> return `Err(adb_output_error(...))` immediately.
- Successful output has no `PID` plus name header -> return a contextual parse error; do not guess columns.
- A row has missing columns, a non-decimal PID, or an empty name -> skip only that row.
- Frontend refresh fails before the prior timestamp expires -> prior map remains temporarily eligible until its original expiry; after expiry, new rows freeze identity as unknown.
- Device or Restart generation changes while a request is in flight -> ignore the late success and late failure.

### 5. Good/Base/Bad Cases

- Good: a table with `PID NAME` returns `123, com.example.app` and `124, com.example.app:remote`; both rows later derive package `com.example.app`.
- Base: an older table with `USER PID ... NAME` is parsed by header positions rather than fixed column numbers.
- Base: `[kworker/0:1]`, `system_server`, and native executable names remain valid process names but produce no application package.
- Bad: merging snapshots leaves an exited process in the map and can assign its reused PID to the wrong historical application.
- Bad: falling back after `more than one device with serial` hides the selected-device identity defect and repeats the same invalid transport.
- Bad: resolving a row against the current map during render changes old query results after PID reuse.

### 6. Tests Required

- Unit-test formatted, `ps -A`, and plain `ps` headers; reordered columns; blank/malformed rows; and missing supported headers.
- Unit-test fallback transitions for explicit unsupported `-o` and `-A`, plus no fallback for offline, unauthorized, transport, and ambiguous-serial diagnostics.
- Frontend store tests must cover complete-map replacement, 5-second expiry, failure without timestamp renewal, PID reuse, unknown historical rows, and paused-row identity freezing.
- Controller tests must cover one non-overlapping shared poll, independent Activity/process publication, queued refresh, disposal, and A -> B -> A generation rejection.
- Run the 60-second Rust test gate, `cargo fmt --check`, Clippy with warnings denied, frontend tests/build, and a real device or emulator smoke with a main process plus a `:remote` process.

### 7. Wrong vs Correct

#### Wrong

```rust
let output = run_adb_output_with_serial(&app, &serial, &["shell", "ps", "-A", "-o", "PID,NAME"])?;
if !output.status.success() {
    return run_adb_with_serial(&app, &serial, &["shell", "ps"]);
}
```

#### Correct

```rust
if let Some(next_attempt) = next_process_ps_attempt(
    attempt,
    output.status.code(),
    &output.stdout,
    &output.stderr,
) {
    attempt = next_attempt;
    continue;
}
return Err(adb_output_error(&output));
```

Compatibility fallback is valid only for a proven unsupported option. Device and transport failures must remain explicit errors.

## Scenario: ADB mDNS Device Alias Deduplication

### 1. Scope / Trigger

- Trigger: changing `list_devices`, parsing `adb devices -l`, or adding a device-selection entry point.
- Applies when ADB reports the same connectable mDNS service both as a bare DNS-SD serial and as a `:port` alias.

### 2. Signatures

- `list_devices(app: AppHandle) -> Result<Vec<DeviceInfo>, String>`
- `parse_devices_output(output: &str) -> Vec<DeviceInfo>`
- `mdns_port_alias_base(serial: &str) -> Option<&str>`
- `DeviceInfo { serial, state, model, transport, is_network, alias_identity }`

### 3. Contracts

- Parse every valid `adb devices -l` row before deduplication so matching is independent of row order.
- Rust parsing is the only owner of network classification and alias identity. Serialize `is_network` and `alias_identity` with every `DeviceInfo`; frontend code must consume those fields and must not parse serial strings again.
- Recognize only connect services ending in `._adb-tls-connect._tcp` or `._adb._tcp`. Do not fold `._adb-tls-pairing._tcp` or arbitrary serials.
- Parse a possible alias from the final `:<port>` segment. The port must be a decimal value in `1..=65535`, and the complete base before that segment must end with a supported connect-service suffix.
- When an alias base exactly equals another reported serial, remove only that bare serial. Keep every alias and every unrelated device in their original relative order.
- Device state does not change alias detection. If the bare row is online but its port alias is offline, the bare value is still unusable with `adb -s` because ADB prefix matching is ambiguous; preserve the offline alias so the frontend shows the real unusable state.
- Background device updates and explicit frontend refreshes must both consume the same filtered `list_devices` result.
- When a refresh replaces a selected bare serial or old port alias, the frontend may migrate only to an online device with the same backend-provided `alias_identity`. If that identity is absent, use the normal online-device selection order; never jump to an unrelated network device.

### 4. Validation & Error Matrix

- Supported bare service plus valid port alias -> omit the bare row and keep the alias.
- Supported bare service without an alias -> keep the bare row.
- Port `0`, overflow above `65535`, or a nonnumeric suffix -> do not treat the row as an alias.
- Pairing service or arbitrary serial with a port -> keep both rows.
- Multiple valid port aliases for one base -> remove the bare row and preserve every alias in input order.
- Selected bare/old alias plus a same-identity online alias -> migrate selection to that alias and clear stale foreground-activity state.
- Selected network device disappears with only an unrelated network alias remaining -> do not identity-migrate to the unrelated alias.
- `adb devices -l` execution failure -> return the existing contextual `Err`; do not publish a fabricated empty list.

### 5. Good/Base/Bad Cases

- Good: `phone._adb-tls-connect._tcp` plus `phone._adb-tls-connect._tcp:5555` returns only the `:5555` row, which is uniquely selectable with `adb -s`.
- Base: `phone._adb-tls-connect._tcp` without a port alias remains visible.
- Bad: keeping both rows lets the UI select the bare value and every scoped ADB command fail with `more than one device with serial`.
- Bad: matching any `._tcp:<port>` suffix can hide pairing or unrelated DNS-SD records.
- Bad: parsing `._adb-tls-connect._tcp` in TypeScript creates a second identity contract that can drift from backend deduplication.

### 6. Tests Required

- Unit-test TLS connect and legacy connect services, alias-before-bare ordering, multiple aliases, isolated bare services, and unchanged unrelated-device order.
- Unit-test ports `0`, `65535`, `65536`, and nonnumeric suffixes.
- Unit-test pairing exclusion, service-like text inside an instance name, and online-bare/offline-alias behavior.
- Unit-test serialized `is_network` / `alias_identity`, frontend bare-to-alias and old-alias-to-new-alias migration, offline bare rejection, and unrelated-network non-migration.
- Run the 60-second Rust test gate, target-file rustfmt, and Clippy.
- Real-device smoke must prove the raw bare serial fails with ADB ambiguity, the retained `:port` alias returns a foreground Activity, and the Tauri device selector contains no duplicate bare option.

### 7. Wrong vs Correct

#### Wrong

```rust
let marker = serial.find("._adb-tls-connect._tcp")?;
Some(&serial[..marker + "._adb-tls-connect._tcp".len()])
```

#### Correct

```rust
let (base, port) = serial.rsplit_once(':')?;
let port = port.parse::<u16>().ok()?;
(port != 0 && MDNS_CONNECT_SERVICE_SUFFIXES.iter().any(|suffix| base.ends_with(suffix)))
    .then_some(base)
```

Split from the end and validate the complete base so service-like text inside an instance name cannot change the identity.
