# Error Handling

## 1. Scope / Trigger

- Apply when changing a fallible Tauri command, nested runtime failure, native stream exit or structured result error field.
- Use [Bilingual UI and Error Presentation](../frontend/i18n.md) for frontend rendering, locale ownership and catalog organization. Keep process lifecycle and command-specific recovery rules in [Quality Guidelines](./quality-guidelines.md).

## 2. Signatures

- Return `Result<T, AppError>` from fallible IPC commands. Keep low-level IO errors in their native type only until a boundary adds the appropriate stable application code.
- `src-tauri/src/error.rs`: `AppError { code: &'static str, params: BTreeMap<String, ErrorParam>, detail: Option<String>, causes: Vec<AppError> }`.
- `ErrorParam` is an untagged JSON string or number. Construct failures with `AppError::new(code).param(key, value).detail(raw).cause(error)` or `.causes(errors)`.
- `src-tauri/src/error_codes.rs` declares stable code constants and `ALL`; keep their parameter schemas in `src/i18n/backendErrorContract.ts`.
- `LogcatExit` and `DeviceMetricsExit` retain `serial`, `session_id`, `reason` and `detail: Option<AppError>`. Recording status and cleanup-result errors likewise use `Option<AppError>`.

## 3. Contracts

- Keep the serialized payload locale-independent: `{ code, params?, detail?, causes? }`. Omit empty params, absent detail and empty causes. Preserve numeric parameters as JSON numbers, not formatted strings.
- Add every code and named parameter to the Rust constants, frontend schema, and both `messages/backend-zh-CN.ts` and `messages/backend-en.ts` in the same change. Match parameter names/types exactly; never add a code that cannot be rendered in both languages.
- Reserve `detail` for raw external diagnostics such as IO errors or bounded adb stderr/stdout. Put application context in the code and typed params. Keep an already-structured failure in `causes`; do not flatten it through `to_string()`.
- Preserve stderr when a command fails unless a narrower privacy contract, such as clipboard framing, prohibits returning raw contents. Keep paths and package names as data; never translate them in Rust.
- Use `AppError`'s `Display` implementation for logs only. It prints diagnostic codes/params and must not replace serialized IPC failures.
- Keep fallible operations on explicit `Result` paths. Do not panic or return `Ok(default)` to hide a failed action or parser. Preserve a documented optional-field/cache-miss default only where that command's contract already defines it.
- Keep stream `reason` values `error` and `eof` as lifecycle markers. Build the `detail` payload from the read/parse failure, attaching raw stderr with `.detail(...)`; an EOF with no read failure uses `LOGCAT_EOF` (`logcat.eof`) or `METRICS_EOF` (`metrics.eof`) even when stderr is empty.
- Frontend `lib/tauri.ts` normalizes native invoke rejection through `toAppError`. Callers retain the payload and translate at render time. Do not change command arguments or successful data merely to localize failures.

## 4. Validation & Error Matrix

| Condition | Required failure/result |
| --- | --- |
| adb spawn/execute failure | Application code plus raw OS diagnostic |
| adb nonzero exit | Coded failure with status parameter and relevant stdout/stderr |
| Nested command or cleanup failure | Outer context code with structured `causes`, preserving every failed operation |
| Stream EOF without stderr | `reason: "eof"`, `detail` containing the corresponding EOF code |
| Stream read/parse failure with stderr | `reason: "error"`, original code/params plus bounded raw diagnostic |
| Clipboard malformed envelope | Coded failure without leaking raw clipboard stdout/stderr |
| Optional metadata unavailable under its existing contract | Preserve the declared partial-data representation; never report a failed mutation as success |

## 5. Good/Base/Bad Cases

- Good: `AppError::new(codes::WIFI_TCPIP_FAILED).cause(error)` retains the underlying ADB failure for later translation.
- Base: `.detail(io_error.to_string())` preserves an external OS diagnostic without inventing translated text in Rust.
- Bad: `.detail(existing_app_error.to_string())` or `format!("Failed to save: {error}")` erases the nested payload contract.
- Bad: matching translated frontend text to decide whether an operation should retry.

## 6. Tests Required

- Run native error serialization and `every_native_error_code_has_a_frontend_schema_and_both_translations` tests in `error.rs`; assert numeric types, nested causes and omitted optional fields.
- Cover EOF/read-error/stderr combinations for Logcat and metrics, including EOF without stderr. Assert code/params and lifecycle identity rather than Chinese text.
- Run the changed command's existing failure and cleanup tests. Keep backend unit-test execution bounded by a 60-second hard timeout.
- Validate frontend error rendering with `src/i18n/errors.test.ts`, catalog parity/CJK guard, and retained-error language switching. Browser/device tests remain separate evidence.

## 7. Wrong vs Correct

```rust
// Wrong: converts a structured application failure into untranslated prose.
run_adb_with_serial(&app, &serial, &["tcpip", "5555"])
    .map_err(|error| format!("Failed to enable tcpip: {error}"))?;

// Correct: keeps both context and cause independent of the active language.
run_adb_with_serial(&app, &serial, &["tcpip", "5555"])
    .map_err(|error| AppError::new(codes::WIFI_TCPIP_FAILED).cause(error))?;
```

```tsx
try {
  await someCommand(serial);
} catch (error) {
  showToast("error", toAppError(error));
}
```

## Scenario: ADB Commands With Stdout-Level Failures

### 1. Scope / Trigger

- Trigger: new Tauri commands that wrap ADB operations where `adb` may return exit code 0 while reporting failure in stdout, such as `adb connect`.

### 2. Signatures

- `adb_connect(app: AppHandle, address: String) -> Result<String, AppError>`
- `adb_disconnect(app: AppHandle, address: String) -> Result<String, AppError>`
- `enable_wifi_debugging(app: AppHandle, serial: String) -> Result<String, AppError>`
- `run_adb_connect_with(addr, execute) -> Result<String, AppError>`

### 3. Contracts

- `address`: user-entered `ip[:port]`; trim whitespace and append `:5555` when the port is omitted.
- `serial`: selected online USB or network serial passed through `run_adb_with_serial`.
- Success response: trimmed ADB stdout or the connected `ip:5555` address, only after `adb -s <address> get-state` returns exactly `device`.
- Failure response: serialized `AppError` translated by the frontend toast at render time.
- A stdout-level connect success and an online transport are separate conditions. `connected to` and `already connected to` do not prove that the target is usable.

### 4. Validation & Error Matrix

- Empty `address` -> `WIFI_EMPTY_ADDRESS` (`wifi.emptyAddress`).
- `adb connect` stdout contains `failed`, `unable`, or `cannot` -> `WIFI_CONNECT_FAILED` with trimmed stdout in `detail`, even if process status is success. These checks parse the adb protocol output, not translated application text.
- `adb connect` reports success but `adb -s <address> get-state` is not `device` -> disconnect the stale address and retry connect once.
- The single reconnect attempt fails or still does not reach `device` -> return `Err(...)`; never emit a success response.
- Missing WiFi IP from `wlan0` -> `WIFI_NO_IP` (`wifi.noIp`).
- `adb tcpip 5555` failure -> `WIFI_TCPIP_FAILED` with the underlying `AppError` in `causes`.

### 5. Good/Base/Bad Cases

- Good: `adb_connect("192.168.1.10")` calls `adb connect 192.168.1.10:5555`.
- Base: `adb_connect("192.168.1.10:5556")` keeps the explicit port.
- Good: `already connected to 192.168.1.10:5555` plus `get-state=device` returns success without disrupting the healthy transport.
- Good: `already connected` plus `device offline` disconnects the stale address, reconnects once, and returns success only when the second `get-state` is `device`.
- Bad: treating `adb connect` exit status 0 as success without checking stdout can show a false success toast.
- Bad: treating `already connected` as success without checking transport state can leave the WiFi list empty because offline network devices are intentionally hidden.

### 6. Tests Required

- Unit-test direct online success, stdout-level failure, stale-offline recovery, and reconnect failure. Assert the exact ADB command sequence and that failure never returns `Ok`.
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
    return Err(AppError::new(codes::WIFI_CONNECT_FAILED).detail(output.trim()));
}
verify_device_online(addr, &mut execute)?;
Ok(output.trim().to_string())
```
