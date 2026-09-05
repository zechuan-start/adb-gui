# Manual Clipboard Contract

## 1. Scope / Trigger

- Apply when changing clipboard Java, DEX, Rust commands, framing or helper deployment.
- Keep Java sources and the checked-in DEX synchronized. Read the shared DEX section in `quality-guidelines.md`.

## 2. Signatures

- `get_device_clipboard(app, serial) -> Result<ClipboardResult, String>`.
- `set_device_clipboard(app, serial, text) -> Result<(), String>`.
- Java entry: `com.adbgui.clipboard.Main`; preserve `com.adbgui.appinfo.Main`.

## 3. Contracts

- Send UTF-8 JSON `{version:1,operation:"get"}` or `{version:1,operation:"set",text}` through stdin and close input. Never use text in argv, environment, temporary files or diagnostics.
- Frame stdout with the complete line `--ADBGUI-CLIPBOARD-V1--`, then one JSON object. Require version 1, boolean `ok`, and exactly one valid `result` or `error`. Match whole marker lines; markers inside JSON text are ordinary content.
- Results: `{kind:"text",text}`, `{kind:"no_text"}`, `{kind:"written"}`. Require normal process exit and operation-appropriate result. Do not accept legacy app-info arrays for clipboard.
- Preserve whitespace, CRLF, Unicode and shell-looking text. Limit text to 256 KiB UTF-8 and wire bytes to `6 * 256 KiB + 4096`. Reject excess without truncation or clearing the destination.
- Run `adb -s SERIAL shell -T -e none` with a generated fixed command containing `toybox timeout -s KILL 8 app_process`. Bound host input/output/wait to 10 seconds; consume all pipes concurrently with bounded buffers and reap terminated host children.
- Use shell UID 2000, package/opPackage `com.android.shell`, and matching AttributionSource on API 31+. Instantiate ClipboardManager with the shell wrapper context; delegated `getSystemService` would retain system attribution.
- Reject locked devices and non-primary users. Read only `ClipData.Item.getText`; do not resolve URIs. Require set readback equality. Never retry an already-submitted set, even after response loss.
- Preserve the original app-info parser and read-only retry behavior. Share deployment, not its long-running query lock.

## 4. Validation & Error Matrix

- Empty/no-text -> preserve destination and show explicit feedback.
- Locked/permission/identity/non-primary user -> reject; never change permissions or unlock automatically.
- Unknown/invalid version, wrong result kind, missing/duplicate marker, trailing JSON or nonzero successful envelope -> fail without echoing raw stdout/stderr.
- Lost set response -> report unconfirmed result; do not promise rollback or resubmit.
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

## 7. Wrong vs Correct

Wrong: `adb shell input text <clipboard>` or extracting after the last marker substring.

Correct: serialize stdin JSON, find one complete marker line, strictly deserialize its envelope, and validate process exit and readback.
