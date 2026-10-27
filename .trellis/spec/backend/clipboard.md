# Manual Clipboard Contract

## 1. Scope / Trigger

- Apply when changing clipboard Java, DEX, Rust commands, framing or helper deployment.
- Use [Error Handling](./error-handling.md) for native `AppError` payloads; preserve this protocol's stricter diagnostic privacy rules.
- Keep Java sources and the checked-in DEX synchronized. Read the shared DEX section in `quality-guidelines.md`.

## 2. Signatures

- `get_device_clipboard(app, serial) -> Result<ClipboardResult, AppError>`.
- `set_device_clipboard(app, serial, text) -> Result<(), AppError>`.
- Both commands run `run(app, serial, text)` = `encode_request(text)` -> `prepare(app, serial)` -> `submit(helper, request, writing)`. `prepare` publishes the DEX and assembles the adb command without starting it; `submit` spawns the helper before its first await, then exchanges, parses and maps write failures. A caller that must check its context before a write (auto push) does so between the two with no await in between.
- Java entry: `com.adbgui.clipboard.Main`; preserve `com.adbgui.appinfo.Main`.

## 3. Contracts

- Send UTF-8 JSON `{version:1,operation:"get"}` or `{version:1,operation:"set",text}` through stdin and close input. Never use text in argv, environment, temporary files or diagnostics.
- Frame stdout with the complete line `--ADBGUI-CLIPBOARD-V1--`, then one JSON object. Require version 1, boolean `ok`, and exactly one valid `result` or `error`. Match whole marker lines; markers inside JSON text are ordinary content.
- Results: `{kind:"text",text}`, `{kind:"no_text"}`, `{kind:"written"}`. Require normal process exit and operation-appropriate result. Do not accept legacy app-info arrays for clipboard.
- Preserve whitespace, CRLF, Unicode and shell-looking text. Limit text to 256 KiB UTF-8 and wire bytes to `6 * 256 KiB + 4096`. Reject excess without truncation or clearing the destination.
- Run `adb -s SERIAL shell -T -e none` with a generated fixed command containing `toybox timeout -s KILL 8 app_process`. Bound host input/output/wait to 10 seconds; consume all pipes concurrently with bounded buffers and reap terminated host children.
- Use shell UID 2000, package/opPackage `com.android.shell`, and matching AttributionSource on API 31+. Instantiate ClipboardManager with the shell wrapper context; delegated `getSystemService` would retain system attribution.
- Reject locked devices and non-primary users. Read only `ClipData.Item.getText`; do not resolve URIs. Require set readback equality. Never retry an already-submitted set, even after response loss.
- `DeviceLockState.isLocked()` queries the system Binder interfaces directly: `ITrustManager.isDeviceLocked(0, 0)` (physical device / primary user), falling back to `isDeviceLocked(0)` only when the newer method is absent, and `IWindowManager.isKeyguardLocked()`. Either locked result rejects access. Do not construct `KeyguardManager`: Android 17 API 37 r08 initializes a UI-process `ApplicationSharedMemory` dependency that is unavailable in this shell helper. Do not fabricate that shared memory or bypass either lock check.
- Missing services/methods, malformed return values and Binder failures fail closed. Unwrap invocation exceptions so an underlying `SecurityException` remains `permission`; never treat a failed lock query as unlocked. The primary-user check still runs before querying lock state.
- Read back even when `setPrimaryClip` throws, because some ROMs store the clip and then throw. Matching text is success; a mismatch rethrows the submit error; a readback that itself throws reports `readback` (`clipboard.readbackFailed`).
- Preserve the original app-info parser and read-only retry behavior. Share deployment, not its long-running query lock.

## 4. Validation & Error Matrix

- Empty/no-text -> preserve destination and show explicit feedback.
- Locked/permission/identity/non-primary user -> reject; never change permissions or unlock automatically.
- Unknown/invalid version, wrong result kind, missing/duplicate marker, trailing JSON or nonzero successful envelope -> fail without echoing raw stdout/stderr.
- Lost set response, `unverified` or `readback` -> report unconfirmed result (`clipboard.writeUnconfirmed` with the cause); do not promise rollback or resubmit.
- Explicit helper rejection on set (locked, user, permission/identity, no_text, too_large, request/version, unsupported) -> return that code directly; it proves the text was not stored, so it is not "unconfirmed".
- Missing remote DEX -> publish through the shared deployment service; deployment failure -> no helper execution.

## 5. Good/Base/Bad Cases

- Good: text containing a newline and the literal marker round-trips unchanged.
- Base: image-only clipboard returns no usable text and leaves the destination intact.
- Bad: reporting API return as success without readback, or holding the icon query lock during clipboard access.

## 6. Tests Required

- Cover framing, malformed envelopes, version/type mismatch, exit status, Unicode byte limits and maximum JSON escaping.
- Cover large bidirectional pipes, output limits, bounded timeout and process cleanup.
- Cover atomic deployment staging/failure cleanup and the shared alias lock.
- On a real device, check set/get/readback, lockscreen rejection, concurrent app-info, and device timeout cleanup. Record tested Android versions separately from compile compatibility.
- Verify real Tauri native clipboard permissions and paste results; browser-only checks do not prove native I/O.
- Run `bash scripts/build-app-info-dex/test.sh` for legacy/modern lock interfaces, unlocked/device-locked/keyguard states, permission failures and unavailable services. Rebuild the shared DEX after Java changes. Device regression must cover unlocked get/set and a rejected locked set whose original contents survive unlock; API 36 and API 37 runtime results are distinct evidence.

## 7. Wrong vs Correct

Wrong: `adb shell input text <clipboard>` or extracting after the last marker substring.

Correct: serialize stdin JSON, find one complete marker line, strictly deserialize its envelope, and validate process exit and readback.

## Scenario: Clipboard Auto Push

### 1. Scope / Trigger

- Apply when changing `commands/clipboard_auto_push.rs`, the `clipboard-auto-push` event, the host change-count readers, or how auto push reuses `prepare` / `submit`.
- The frontend binding (setting, target derivation, generation filter, status line) lives in [Settings and Clipboard](../frontend/settings-clipboard.md).

### 2. Signatures

- `set_clipboard_auto_push(app, state: State<AutoPushState>, target: Option<Target>) -> Result<u64, AppError>`; `Target = { serial }` with `deny_unknown_fields`. Every call increments the generation and returns it; `Some` also records the baseline and spawns the watcher for that generation.
- `get_clipboard_auto_push_support() -> bool`: `cfg!(any(target_os = "macos", windows))`.
- Event `clipboard-auto-push`: `{ generation: u64, at: i64 /* epoch ms */, kind: "watching" | "pushing" | "pushed" | "skipped" | "failed", reason?: "no_text" | "too_large", error?: AppError }`.
- `watcher::run<I: Io>(io, baseline: Option<i64>)` is the whole loop. `Io` injects `is_current`, `change_count`, `wait`, `read_text -> Result<Option<String>, AppError>`, `prepare`, `submit`, `emit`; `NativeIo` is the only production implementation.

### 3. Contracts

- Poll only the change count every 500 ms: macOS `NSPasteboard::generalPasteboard().changeCount()` inside an `autoreleasepool` (NSPasteboard is not main-thread-only in objc2-app-kit 0.3), Windows `GetClipboardSequenceNumber()` (`0` = no clipboard access -> `None`, read nothing). Linux compiles neither; `set_clipboard_auto_push(Some)` returns `clipboard.autoPushUnsupported` there.
- The baseline is read inside the command, before it returns: content copied before the target was set is never pushed. An unknown baseline adopts the first known count without reading.
- Read text only after the count changed, on a blocking worker, through `arboard` (the library behind the clipboard plugin). `arboard::Error::ContentNotAvailable` means no text (`skipped(no_text)`); every other error is `clipboard.hostReadFailed` with the raw diagnostic in `detail`. The plugin flattens these errors to English strings, which must not be matched.
- Empty text -> `skipped(no_text)`; more than `MAX_TEXT_BYTES` (256 KiB UTF-8) -> `skipped(too_large)`. Neither prepares nor writes.
- Deduplicate within one generation by a `RandomState` hash of the last successfully pushed text. Never store the text. A failed push does not record the hash; a new generation starts with no hash.
- The loop is sequential: no queue. Copies made during a push collapse into one later read of the newest count. A failure (prepare or submit) emits `failed` and consumes that count; the next copy is the next attempt. A submitted write is never retried and `clipboard.writeUnconfirmed` is not success.
- Check `is_current` (generation equal and `!adb::is_shutting_down`) after every await: after `wait`, after `read_text`, after `prepare` (then call `submit` with no await in between), and after `submit` before reporting. A stale generation exits without emitting.
- `emit` checks the generation again and logs emit failures with `eprintln!`. Events never contain clipboard text; the frontend filters by generation once more.

### 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Count unchanged or unavailable | No read, no event |
| No text / non-text content | `skipped(no_text)`, no write |
| Text above 256 KiB | `skipped(too_large)`, no write |
| `arboard` read failure or worker join failure | `failed(clipboard.hostReadFailed)` with `detail` |
| Same text as the last success in this generation | No write, no event |
| `prepare` or `submit` failure | `failed(<error>)`, no retry |
| Generation changed during `read_text`, `prepare` or `submit` | Exit; no `submit` after a stale `prepare`, no event |
| `Some(target)` on Linux | `Err(clipboard.autoPushUnsupported)` |

### 5. Good/Base/Bad Cases

- Good: five quick copies while a push runs end with the phone holding the fifth text after one more push.
- Base: copying the same text twice pushes once; switching A -> B -> A starts three generations and pushes it again to A.
- Bad: retrying a locked-device failure each poll, which starts the helper every 500 ms until the phone is unlocked.

### 6. Tests Required

- Drive `watcher::run` with a fake `Io` (no adb, no clipboard): baseline content never pushed; one change pushes once and an unchanged count reads nothing; per-generation dedupe and re-push in a new generation; copies during a push collapse to the newest text; failed write not retried and not recorded as pushed; failed prepare reported then next copy pushed; stale generation after prepare submits nothing and emits nothing; stale generation after submit emits nothing; empty / non-text / oversized / unreadable copies never prepared or written; exactly 256 KiB is pushed.
- `Watcher::observe` with unknown and known baselines.
- Serialize every status and assert the event keys are only `generation`, `at`, `kind`, `reason`, `error`.
- The platform code compiles only for macOS / Windows. When a cross `cargo check` is blocked by C dependencies (ring needs MSVC `lib.exe`, objc2-exception-helper needs Apple clang), record the blocker and verify the packaged app on the device.

### 7. Wrong vs Correct

#### Wrong

```rust
let helper = clipboard::prepare(&app, &serial).await?;
tokio::time::sleep(Duration::from_millis(10)).await;
clipboard::submit(helper, &request, true).await?; // the target may have changed
```

#### Correct

```rust
let helper = io.prepare().await?;
if !io.is_current() {
    return;
}
let result = io.submit(helper, &text).await; // spawns before its first await
```
