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

- Trigger: changing the streaming logcat command, the `LogcatLine` payload, or `parse_logcat_line` in `src-tauri/src/commands/logcat.rs`.
- Does not apply to quick bug report collection, which intentionally uses a one-shot `-v brief` dump (see the bug report scenario above).

### 2. Signatures

- `start_logcat(app: AppHandle, serial: String) -> Result<(), String>` spawns `adb -s <serial> logcat -T 5000 -v threadtime` and emits `logcat-line` events.
- `LogcatLine { serial, time, level, tag, pid, tid, message, raw }` — all lowercase single-word field names so serde output matches the TS interface byte-for-byte.

### 3. Contracts

- Streaming logcat must use `-v threadtime` so every line carries a device-side `MM-DD HH:MM:SS.mmm` timestamp; `raw` keeps the original line so exports include timestamps for free.
- `LogcatLine` (Rust) and `LogcatLine` in `src/lib/tauri.ts` must stay field-for-field in sync; the event channel name is `logcat-line`.
- Parse regexes must be file-level `static LazyLock<Regex>`, never compiled inside the per-line function.
- Unparseable lines (e.g. `--------- beginning of main` separators) must fall back to level `I`, empty `time/tag/pid/tid`, and `message = raw` — never dropped.
- Tag/message split happens at the first `: ` separator; tags containing colons are truncated at the first colon (accepted limitation).

### 4. Validation & Error Matrix

- Regex mismatch -> fallback `LogcatLine`, no error surfaced.
- Empty message lines (with or without trailing separator space) must still parse.

### 5. Good/Base/Bad Cases

- Good: `07-26 14:23:45.123  1234  5678 E AndroidRuntime: FATAL EXCEPTION: main` keeps the colons inside `message`.
- Base: stack-trace continuation lines keep their leading indentation in `message`.
- Bad: switching the format or regex without updating the `#[cfg(test)]` regression tests in `logcat.rs`.
- Bad: adding a `LogcatLine` field in Rust without mirroring it in `src/lib/tauri.ts`.

### 6. Tests Required

- Any change to `parse_logcat_line` or the format flag must extend the unit tests in `logcat.rs` (`cargo test --lib`).
- Build checks: `cargo check`, `cargo clippy --all-targets -- -D warnings`, `pnpm build`.
