# scrcpy Mirroring Launcher

## 1. Scope / Trigger

- Apply when changing scrcpy discovery, version checks, argv generation, extra-argument parsing, mirroring sessions, the `mirror-exit` event, application-exit cleanup, or the frontend store and tool module that consume them.
- Applies across `src-tauri/src/commands/mirror.rs`, `src-tauri/src/lib.rs`, `src/lib/tauri.ts`, `src/lib/mirror.ts`, `src/store/mirror.ts`, `src/hooks/useMirrorRuntime.ts`, `src/components/MirrorTool.tsx`, `src/components/settings/sections/MirrorSection.tsx`, `scripts/fetch-scrcpy.mjs`, `src-tauri/resources/scrcpy/`, `src-tauri/tauri.conf.json` and `.github/workflows/release.yml`.
- Each installer bundles the official scrcpy build for its target. The application locates it or the file the user chose, builds argv, starts, stops and reaps it, and shows the result. It never renders video, controls the scrcpy window, or downloads scrcpy at runtime.
- Use [Error Handling](./error-handling.md) for payload rules and [Settings and Clipboard](../frontend/settings-clipboard.md) for the `mirror` preference group.

## 2. Signatures

- `detect_scrcpy(app, custom_path: Option<String>) -> Result<ScrcpyInfo, AppError>` (async)
- `parse_scrcpy_extra_args(text: String) -> Result<Vec<String>, AppError>`
- `start_mirror(app, serial: String, request: MirrorRequest) -> Result<MirrorSessionInfo, AppError>` (async)
- `stop_mirror(serial: String, session_id: u64) -> Result<(), AppError>` (async)
- `list_mirror_sessions() -> Vec<MirrorSessionInfo>`
- `shutdown_mirror_sessions() -> Result<(), AppError>`, called from `RunEvent::Exit`
- `ScrcpyInfo { path, version, source: "custom" | "bundled" }`
- `MirrorRequest { scrcpyPath: string | null, preset: "standard" | "saver" | "high", options: { turnScreenOff, stayAwake, showTouches, alwaysOnTop, noAudio, viewOnly }, extraArgs: string }` (camelCase on the wire)
- `MirrorSessionInfo { serial, session_id }`; event `mirror-exit`: `MirrorExit { serial, session_id, outcome: "closed" | "stopped" | "disconnected" | "failed", error: AppError | null }`
- Frontend bridge: `detectScrcpy`, `parseScrcpyExtraArgs`, `startMirror`, `stopMirror`, `listMirrorSessions`, `onMirrorExit`, `pickScrcpyExecutable`.
- Frontend store: `createMirrorStore(api)` / `useMirrorStore` with `detection`, `sessions`, `lastExit`, `ensureDetected`, `detect`, `start`, `stop`, `restore`, `acceptExit`.
- Fetch script: `node scripts/fetch-scrcpy.mjs [--target <rust-triple>]`, targets `aarch64-apple-darwin`, `x86_64-apple-darwin`, `x86_64-unknown-linux-gnu`, `x86_64-pc-windows-msvc`; the host target when omitted.

## 3. Contracts

### Bundling

- The binaries stay out of git. macOS arm64 and x64 need different builds and Tauri resource maps vary only by operating system, so the release workflow runs the fetch script per target before `tauri-action`. A script failure fails that target, and `publish-release` needs every build.
- `scripts/fetch-scrcpy.mjs` pins the version and the four release checksums. It verifies the archive, checks that every listed file exists, and only then replaces the contents of `src-tauri/resources/scrcpy/` except `.gitkeep`, so a failed run leaves the directory unchanged and a switch between architectures leaves no stale files. Any failure exits nonzero.
- Files copied: `scrcpy`, `scrcpy-server`, `scrcpy.png`, `disconnected.png`, `LICENSE` on macOS and Linux; `scrcpy.exe`, `scrcpy-server`, `scrcpy.png`, `disconnected.png`, `LICENSE.txt`, `SDL3.dll`, `avcodec-63.dll`, `avformat-63.dll`, `avutil-61.dll`, `swresample-7.dll`, `libusb-1.0.dll` on Windows. The official package's adb is never copied. An upgrade must recheck this list; the Windows DLL names change with FFmpeg and SDL.
- On Windows the script extracts with `%SystemRoot%\System32\tar.exe`, because the Git tar found in PATH cannot read zip.
- `tauri.conf.json` maps `resources/scrcpy/` to `scrcpy/` for every target. The tracked `.gitkeep` keeps the directory present for `cargo` and `tauri dev`, and is copied into installers as an empty file.
- The official builds are portable: they find `scrcpy-server` and both icons beside the executable, so `SCRCPY_SERVER_PATH` and icon variables are not set.

### Discovery and version

- A session runs either the file the user chose or the bundled file. There is no fallback between them, and PATH or install locations are never searched.
- `custom_path = Some(p)`: `p` must be absolute and an existing executable file; otherwise `mirror.customPathInvalid { path }`. The bundled scrcpy is not used.
- `custom_path = None`: use `resource_dir()/scrcpy/scrcpy` (`scrcpy.exe` on Windows) with source `bundled` when it is an executable file; otherwise `mirror.notFound`. A `resource_dir()` failure is `mirror.notFound` with the OS error in `detail`.
- `locate_scrcpy(custom, bundled_path, is_executable)` takes the resolved bundled path as a `Result` and the executable predicate as a parameter, so it is tested without host files and a custom path works without a resource directory.
- Run `scrcpy --version` with a 5-second timeout and parse only the first stdout line with `^scrcpy (\d+)\.(\d+)(\.\d+)?`. scrcpy 2.0 is the minimum (`--video-bit-rate`, `--no-audio` and friends start there; Ubuntu 22.04 ships 1.21). A custom path can still reach an older build.
- `start_mirror` detects again on every start with the request's `scrcpyPath`; the frontend's cached detection is presentation only.

### Extra arguments

- Rust is the only parser. Split on Unicode whitespace; single or double quotes group text and are removed; backslashes are ordinary characters so `C:\a\b` survives. An unclosed quote is `mirror.extraArgsUnclosedQuote`.
- Device selection belongs to the application. scrcpy uses `getopt_long`, which accepts unambiguous long-option abbreviations and bundled short flags (verified on scrcpy 5.0.1: `--ser=X`, `--tcp`, `--ot` and `-Sd` all select a device). Reject, as `mirror.extraArgsForbidden { option }`:
  - a long option whose name before `=` is a prefix of `serial`, `select-usb`, `select-tcpip`, `tcpip` or `otg` (`option` is the typed `--name`);
  - a short cluster containing `s`, `d` or `e` before the first value-taking short option `b`, `m`, `p`, `r`, `s` or `V` (`-sX`, `-Sd`, `-wte` reject; `-m1024`, `-bd` pass).
- A value that begins with `-` and follows a long option as a separate argument is scanned as an option; use `--opt=value` for such values.
- The settings row calls `parse_scrcpy_extra_args` after a 300 ms debounce and shows the error inline; `start_mirror` parses again and its result is authoritative.

### argv and environment

- argv is `["-s", serial]`, then the preset (`standard` none; `saver` `--max-size=1024 --video-bit-rate=4M --max-fps=30`; `high` `--video-bit-rate=16M`), then `--always-on-top`, `--no-audio`, `--no-control` (view only), then `--turn-screen-off`, `--stay-awake`, `--show-touches` only when view only is off, then the extra arguments. scrcpy lets later arguments override earlier ones.
- scrcpy refuses to start when `--no-control` is combined with the three control options, so they are omitted, not merely disabled in the UI; their stored values survive.
- Spawn without a shell: `adb::new_async_command(path).args(argv)` (hidden console on Windows), `stdin` null, `stdout` null, `stderr` piped, `kill_on_drop(true)`.
- Set `ADB=<adb::resolve_adb_path>`. A second adb client of another version restarts the adb server and cuts Logcat and metrics streams. When that adb is the bundled Linux binary, also set `LD_LIBRARY_PATH` from `adb::embedded_linux_lib_dir`, exactly as `adb::prepare_command` does.

### Sessions and exit

- One session per serial; different serials run concurrently. Starts are serialized by a per-serial tokio mutex; a registered serial is `mirror.alreadyRunning`. Session ids increase globally.
- The registry is a `std::sync::Mutex<HashMap<serial, MirrorSession>>` that is never held across an await. A shutdown gate closed under the same lock rejects late registrations with `mirror.shuttingDown`; a rejected child is killed and reaped before returning.
- One monitor task owns each child. It reads stderr into a bounded tail (last 40 lines, each cut to 512 bytes on a UTF-8 boundary), waits for exit or a stop request, unregisters the matching session id, emits `mirror-exit`, then marks the session exited.
- Outcome: stop requested by the application (stop command or exit) -> `stopped`; code 0 -> `closed` (window closed); code 2 -> `disconnected` with `mirror.disconnected`; other code -> `failed` with `mirror.exitFailed { code }`; no code (Unix signal not sent by us) -> `failed` with `mirror.terminated`; wait error -> `failed` with `mirror.waitFailed`.
- Diagnostic `detail`: the text after `ERROR: ` from every matching stderr line, accepting the macOS NSLog prefix `YYYY-MM-DD HH:MM:SS.mmm scrcpy[pid:tid] `. getopt messages such as `unrecognized option '--bogus'` carry no prefix, so without ERROR lines use the last 5 non-empty lines.
- `stop_mirror(serial, session_id)` with a stale id is a no-op success. Otherwise it requests a stop and waits up to 5 seconds for the monitor: Unix sends SIGTERM (scrcpy cleans up like closing its window) and SIGKILL after 3 seconds; Windows terminates the process. Timeout -> `mirror.stopFailed`.
- `RunEvent::Exit` calls `shutdown_mirror_sessions` after Logcat and metrics shutdown and before `adb::shutdown_embedded_adb_server`, because scrcpy needs the adb server while it cleans up. It closes the gate, stops every session and waits up to 5 seconds in total; failures aggregate into `mirror.stopAllFailed { failed, total }`.

### Frontend

- `useMirrorStore` is runtime state only. `useMirrorRuntime()` at the App root subscribes to `mirror-exit` first, then calls `restore()` (`list_mirror_sessions`), so a reloaded page reattaches to open scrcpy windows. The tool module may be hidden while sessions end.
- `acceptExit` ignores an exit whose session id differs from the stored one. An exit for a serial that is starting or unknown is buffered and applied when the start or list response names that session id, so an immediate failure cannot leave a phantom session.
- A start failure is stored in `lastExit` and rendered beside the start button; it never raises a toast. A start failure with a discovery code also updates `detection`.
- `mirror.notFound` tells the user to reinstall the application and offers a new detection. `mirror.tooOld` offers settings and a new detection. The interface never suggests installing scrcpy separately.
- The `mirror-exit` event, not the stop response, ends a session in the store.
- `ensureDetected(path)` detects once per stored path; detection results carry the path and a request number so stale results are dropped.

## 4. Validation & Error Matrix

| Condition | Result |
| --- | --- |
| Custom path relative, missing, a directory or not executable | `mirror.customPathInvalid { path }`, no fallback |
| Bundled scrcpy missing or not executable, or `resource_dir()` fails | `mirror.notFound`, reinstall guidance; a resource failure keeps its OS error in `detail` |
| Fetch script: checksum mismatch, listed file missing, unsupported target or download failure | Nonzero exit; the resource directory is unchanged and the CI target fails |
| `--version` cannot spawn, or prints an unparsable first line | `mirror.versionUnreadable` with raw output/OS error in `detail` |
| `--version` exceeds 5 seconds | `mirror.versionTimeout` |
| Version below 2.0 | `mirror.tooOld { version, minimum }` |
| Unclosed quote / device selector in extra arguments | `mirror.extraArgsUnclosedQuote` / `mirror.extraArgsForbidden { option }` |
| Same serial already registered | `mirror.alreadyRunning` |
| Start during application exit | `mirror.shuttingDown`; the spawned child is killed and reaped |
| adb path unavailable or scrcpy spawn failure | `mirror.startFailed` with the adb error as cause or the OS error as detail |
| Exit code 0 / 2 / other / signal | `closed` / `disconnected` / `failed` + `exitFailed { code }` / `failed` + `terminated` |
| Stop with a stale session id | `Ok(())`, the current session keeps running |
| Process still alive 5 seconds after a stop request | `mirror.stopFailed`; the store returns the session to running with `stopError` |

## 5. Good/Base/Bad Cases

- Good: a Finder-launched macOS app runs `Contents/Resources/scrcpy/scrcpy` with source `bundled` and `ADB` set to the application's adb, so Logcat keeps streaming even when Homebrew has another scrcpy installed.
- Good: `--bogus` starts scrcpy, which exits 1; the module shows `unrecognized option '--bogus'` next to the start button.
- Base: two devices mirror at once; switching the selected device shows that device's session or last result.
- Bad: falling back to the bundled scrcpy or PATH when the configured path is wrong; the user would mirror with a binary they did not choose.
- Bad: committing the binaries or mapping per-architecture directories; every installer would carry both macOS builds.
- Bad: matching only `-s`, `--serial=` and `-sX`; `--ser=X` or `-Sd` would make scrcpy mirror another device while the app tracks the first.
- Bad: passing the extra-arguments string to a shell or splitting it again in TypeScript.

## 6. Tests Required

- Rust unit tests: version lines (`scrcpy 5.0.1 <...>`, `2.0`, `1.25`, garbage); lookup with an injected predicate (valid custom path over the bundled file, invalid custom path without fallback, relative custom path, custom path without a resource directory, bundled file used, bundled file missing, resource-directory failure detail); `ScrcpyInfo` serde shape for both sources; splitting (whitespace, both quotes, quotes inside a word, empty quoted arguments, Windows backslashes, unclosed quotes); every forbidden form including abbreviations and bundles plus allowed options; argv for each preset and option, view-only omission and extra arguments last; request/event serde shape; stderr tail bounds and UTF-8 truncation; ERROR extraction with NSLog prefix and fallback; exit mapping for 0/2/1/stopped/signal/wait error; registry duplicates, stale ids and the shutdown gate.
- Process tests (Unix, `/bin/sh` doubles): failed exit with `ERROR: boom`, closed, disconnected, duplicate serial rejection, shutdown of two sessions then rejection, stale stop, SIGTERM-ignoring child escalated to SIGKILL, spawn failure.
- Fetch script: on the host, the directory matches the file list and the official hashes; a wrong checksum, a missing listed file and an unsupported target exit nonzero and leave the directory unchanged; switching targets leaves no stale files.
- Frontend: store early exits for start and restore, stale exits, stale detection, start failure without toast, discovery failure updating detection, stop failure; view-model mapping for every state; SSR rendering of every module state in both languages with no install hints; one shared preset control writing `update("mirror", ...)`; view-only chips disabled with stored values kept.
- Browser smoke (`pnpm test:browser`): A-10 bundled file missing / too old / invalid path / running / long failure / disconnected without horizontal overflow at 900x600 and 1200x800 in both themes and languages; settings anchor, four rows, bundled path and source, inline extra-argument error and section reset.
- Packaged files: the `.app` and DMG hold the listed files with official hashes and no official adb; each CI installer holds only its own target's files.
- Real device (packaged app, LaunchServices on macOS): source `bundled` with the running process inside the application, Logcat continuity during mirroring, stop and window close, each preset and option, `--bogus`, `-s abc`, invalid custom path, USB unplug, exit cleanup with `pgrep scrcpy`.

## 7. Wrong vs Correct

### Wrong

```rust
// Shell parsing, PATH lookup and a second adb client.
Command::new("sh").arg("-c").arg(format!("scrcpy -s {serial} {extra_args}")).spawn()?;
```

### Correct

```rust
let extra_args = parse_extra_args(&request.extra_args)?;
let scrcpy = detect(&app, request.scrcpy_path.as_deref()).await?;
let mut command = adb::new_async_command(&scrcpy.path);
command.args(build_mirror_args(&serial, request.preset, &request.options, extra_args));
command.env("ADB", &adb_path);
```
