# Quality Guidelines

> Frontend quality standards.

---

## Overview

工具链: TypeScript strict, Vitest, Vite (no ESLint configured yet). 类型检查由 `pnpm build` 中的 `tsc` 执行.

---

## Forbidden Patterns

- `any` 类型
- 直接 import `@tauri-apps/api/core` (通过 `lib/tauri.ts` 封装)
- CSS-in-JS (统一用 Tailwind)
- `var` 声明
- class 组件
- `document.querySelector` 直接操作 DOM (用 React ref)

---

## Required Patterns

- `type="button"` on all `<button>` elements
- `cn()` for conditional classes
- `@/` path alias for all imports
- async operations wrapped in try/catch with user feedback (toast)
- cleanup in useEffect when using listeners or timers
- `export function` (named export) for components

---

## Testing Requirements

前端纯逻辑和 store 行为使用同目录 Vitest 单测. 验证顺序:

1. `corepack pnpm test` — 运行 `src/**/*.test.ts` 单测
2. `corepack pnpm build` — 执行严格 TypeScript 检查和 Vite production build
3. UI 行为使用 Browser 工具验证; 桌面集成路径使用 Tauri debug 应用验证

新增或修改解析、校验、状态转换时必须增加回归测试. Canvas、虚拟滚动、dialog 焦点和键盘交互等浏览器行为需要真实 UI 冒烟测试, 不能只以 build 通过替代.

---

## Scenario: macOS Tauri Bundle UI Smoke Launch

### 1. Scope / Trigger

- Trigger: running a macOS desktop smoke test against a bundled Tauri `.app`, especially for animation-frame scheduling, virtual scrolling, streaming UI, or paint timing.
- Applies to debug and release bundles launched from a terminal or an automation harness.

### 2. Signatures

- Interactive launch: `open -n "<bundle-dir>/ADB GUI.app"`
- Captured launch: `open -n -W --stdout <stdout-log> --stderr <stderr-log> "<bundle-dir>/ADB GUI.app"`

### 3. Contracts

- Launch the `.app` through macOS LaunchServices. Never execute `ADB GUI.app/Contents/MacOS/adb-gui` directly for UI acceptance.
- Use one LaunchServices-created application instance to verify the initial render, Restart, and A -> B -> A device switching.
- Conclusions about `requestAnimationFrame`, layout effects, virtual scrolling, Logcat frame flushing, or paint stability are valid only after a LaunchServices launch.
- Capture Rust stdout/stderr through `open` when diagnostics are required; do not trade away the normal WebKit page lifecycle to obtain terminal output.

### 4. Validation & Error Matrix

- Direct bundle-binary execution + Tauri events arrive + animation frames never run -> invalid smoke environment; relaunch through `open` before diagnosing application code.
- LaunchServices execution + animation frames run + UI updates -> valid environment and valid UI evidence.
- LaunchServices execution + animation frames still do not run while the window is foreground -> application or host integration defect; continue diagnosis.
- Restart or A -> B -> A creates a new session but rows do not resume under a valid launch -> Logcat lifecycle regression.

### 5. Good/Base/Bad Cases

- Good: `open -n -W --stdout /tmp/adb-gui.out --stderr /tmp/adb-gui.err ".../ADB GUI.app"` preserves diagnostics and normal WebKit scheduling.
- Base: `open -n ".../ADB GUI.app"` is sufficient when terminal output is not needed.
- Bad: direct execution can deliver every Tauri batch while WebKit never invokes the queued animation frame, producing a false `0 / 0` Logcat regression.
- Bad: adding an rAF/timer fallback to compensate for a nonstandard smoke launch creates a second scheduler and hides the invalid test environment.

### 6. Tests Required

- macOS desktop smoke must assert an initial nonzero Logcat count, a new live session with rows after Restart, and rows after A -> B -> A.
- Any rAF or paint-timing regression report must record that the bundle was launched through LaunchServices and that the app window was foreground.
- Unit tests may inject and execute frame callbacks deterministically, but they do not replace the LaunchServices desktop smoke.

### 7. Wrong vs Correct

#### Wrong

```bash
"<bundle-dir>/ADB GUI.app/Contents/MacOS/adb-gui"
```

#### Correct

```bash
open -n -W --stdout <stdout-log> --stderr <stderr-log> "<bundle-dir>/ADB GUI.app"
```

---

## Code Review Checklist

- 新增组件是否遵循 component-guidelines 中的结构
- Tauri invoke 是否通过 `lib/tauri.ts`
- 是否有未处理的 Promise (需 catch 或 void)
- 响应式布局: 是否在窄屏下可用
- 暗色/亮色模式: 是否使用语义 token (不硬编码颜色)

## Scenario: Device Download Default Filenames

### 1. Scope / Trigger

- Trigger: adding or changing a system save dialog whose suggested filename comes from an Android device.
- Applies to device-file downloads through the Tauri bridge on Windows, macOS, and Linux.

### 2. Signatures

- `deviceDownloadDefaultName(fileName: string, pathSeparator: string) -> string`
- `pickDeviceDownloadPath(fileName: string) -> Promise<string | null>`

### 3. Contracts

- `fileName` is already the basename returned by the device-file backend. Do not parse it again with a host-native `basename` API because Android permits characters that have path semantics on Windows.
- Use Tauri `sep()` only to select the host filename rules, then pass the result to the pure helper.
- On Windows, replace `< > : " / \ | ? *` and control characters with `_`, replace trailing dots/spaces with `_`, and prefix reserved device names (`CON`, `PRN`, `AUX`, `NUL`, `COM1-9`, `LPT1-9`, including extensions) with `_`.
- On macOS and Linux, preserve the original UTF-8 device filename, including Chinese characters, spaces, single quotes, colons, and backslashes.
- Empty, `.` and `..` names fall back to `device-file` on every platform.

### 4. Validation & Error Matrix

- Windows-invalid character -> replace that character with `_` before calling `join()` or opening the save dialog.
- Windows reserved basename with or without an extension -> prefix the complete name with `_`.
- Empty, `.` or `..` -> use `device-file`; never pass a non-file name to the dialog.
- User cancels the save dialog -> return `null` without displaying an error.

### 5. Good/Base/Bad Cases

- Good: Windows maps `a\\b.txt` to `a_b.txt`, `CON.txt` to `_CON.txt`, and `report. ` to `report__`.
- Base: POSIX hosts preserve `设备 文件's.txt` byte-for-byte.
- Bad: `basename(fileName)` on Windows treats an Android backslash as a host separator and silently changes the suggested filename.

### 6. Tests Required

- Unit-test Windows backslashes, colons, control characters, reserved names with extensions, and trailing dots/spaces.
- Unit-test the empty/`.`/`..` fallback.
- Unit-test POSIX preservation with Chinese characters, spaces, and single quotes.
- Run `pnpm test` and `pnpm build` after changing the helper or dialog bridge.

### 7. Wrong vs Correct

#### Wrong

```typescript
const defaultName = await basename(fileName);
```

#### Correct

```typescript
const defaultName = deviceDownloadDefaultName(fileName, sep());
```

## Scenario: Logcat Query Language

### 1. Scope / Trigger

- Trigger: changing Logcat query syntax, compilation, evaluation, completion, device process snapshots, crash classification, or the query-backed filtered index.
- Applies to `logcatQuery.ts`, `logcatQueryCompletion.ts`, `logcatCrash.ts`, query UI hooks, `activityPollingController`, `useLogcatStore`, and the `list_device_processes` Tauri bridge.
- The query text is the only Logcat filtering source of truth. Do not restore level buttons, an app-filter dropdown, keyword state, tag chips, `LogcatFilter`, or `matchesFilter`.

### 2. Signatures

- `compileQuery(input: string) -> CompileSuccess | CompileFailure`
- `evaluate(entry: LogcatEntry, ast: QueryNode, ctx: EvalContext) -> boolean`
- `formatQueryValue(value: string) -> string`
- `formatRegexQueryValue(value: string) -> string`
- `getQueryValueKeyAtCursor(input: string, cursor: number) -> QueryKey | null`
- `detectCrashKind(level: LogLevel, tag: string, message: string) -> "crash" | "stacktrace" | null`
- `listDeviceProcesses(serial: string) -> Promise<ProcessEntry[]>`
- `ProcessEntry { pid: string, name: string }`
- `CompileSuccess { ok: true, ast, packageRefs: string[], processRefs: string[], tagRefs: string[] }`
- `CompileFailure { ok: false, message: string, start: number, end: number }`
- `EvalContext { currentPackage: string }`
- `processIdentityForPid(processMap, processMapUpdatedAt, pid, now) -> { processName, packageName }`

### 3. Contracts

- Supported keys are lowercase `tag`, `message`, `level`, `package`, `process`, and `is`. Bare text is `message:<text>`.
- `~` selects RE2 regular expression matching and `=` selects case-sensitive exact matching. Both modifiers are valid for `tag`, `message`, and `process`; their default match is case-insensitive containment. `package`, `level`, and `is` reject modifiers.
- Parentheses bind before unary `-`, implicit or explicit `&` binds before `|`, and adjacent terms imply AND. For example, `tag:A | level:ERROR package:mine` means `tag:A | (level:ERROR & package:mine)`.
- Unquoted `\` represents one space. Quoted values preserve backslashes except `\"` and `\\`, which represent a quote and a backslash. `formatQueryValue` must round-trip spaces, quotes, backslashes, and operator characters.
- Compile regular expressions once with `RE2JS`, then cache the compiled matcher in the AST. Never use backtracking JavaScript `RegExp` or construct matchers in `evaluate`.
- Query input is limited to 4,096 UTF-16 code units and parser nesting is limited to 64 levels. Limit failures use the normal positioned `CompileFailure` path.
- `level` is case-insensitive and threshold-based: `VERBOSE/V`, `DEBUG/D`, `INFO/I`, `WARN/W`, `ERROR/E`, and `ASSERT/F`; `level:INFO` matches I/W/E/F.
- `process:` evaluates the immutable `LogcatEntry.processName`, including suffixes such as `:remote`. `package:` evaluates the immutable `LogcatEntry.packageName`; `package:mine` substitutes the current foreground Android package before exact comparison.
- A successful device process snapshot replaces the complete PID map and records its completion timestamp. The snapshot is trusted for new Logcat rows for at most 5 seconds. A failed refresh keeps the prior map for diagnostics but never renews its timestamp.
- Resolve `processName` and `packageName` exactly once when each row reaches the store, including rows queued while paused. Unknown or expired mappings become `null`; future snapshots must never backfill or reinterpret historical rows because Android may reuse a PID.
- Derive a package only from Android application-style process names. `com.example.app:remote` maps to `com.example.app`; kernel, system, and native names such as `[kworker/0:1]`, `system_server`, and `/system/bin/foo` map to `null`.
- Process refresh shares the existing non-overlapping 5-second Activity polling controller. Activity and process results publish independently. Device switches and Restart clear the map and use a unique generation key so an A -> B -> A late completion cannot publish into the newer A session.
- Compute `LogcatEntry.crashKind` once during normalization. Crash rules are `FATAL EXCEPTION`, qualifying `AndroidRuntime` process/exception lines, native `DEBUG` tombstone markers, and `ANR in ...`. Stacktrace rules are Java-style `at` frames, `Caused by:`, `... N more`, and exception/error/throwable headers, regardless of log level.
- Crash classification is heuristic. Application-printed stacktraces and ordinary text beginning with `Caused by:` can be false positives; coroutine or vendor-specific frames can be missed.
- `commitQuery` updates the active AST and index only after a successful compile. A syntax error updates the positioned error while the last valid query and result set remain active.
- Completion context scanning is quote-aware across the full input. Spaces and operators inside a quoted value do not split the active term, and adjacent unary `-` characters belong only to the term under the cursor.
- Key completion matches prefixes case-insensitively but always inserts the lowercase key accepted by the parser.
- A tag suggested for a `~` query is observed literal data, not user-authored regex syntax. Build its insertion text with `formatQueryValue(RE2JS.quote(tag))`; do not insert tag metacharacters such as `.`, `[`, or `+` as active regex operators.
- A row-tag shortcut adds a positive top-level AND predicate. Prefer the current `queryInput` when it compiles, otherwise fall back to `activeQuery`. Group a root OR query before appending; a matching tag under NOT or inside an OR branch is not a duplicate positive conjunct.
- The query input debounces compilation by 150 ms. Completion supports keys, unary `-`, levels, `is` values, the latest 200 distinct tags sampled from the newest end of the current buffer, lazy package names, current process names, and Ctrl/Cmd+Space. Observed process names inserted into `process~:` must be RE2-escaped literals. Keyboard selection must remain visible and expose combobox/error/status ARIA relationships.

### 4. Validation & Error Matrix

- Unknown key, missing value, dangling operator, unmatched parenthesis/quote, unsupported modifier, invalid regex, overlength input, or excessive nesting -> positioned `CompileFailure`; preserve the last valid AST and filtered rows.
- Missing `processName` or `packageName` -> the positive predicate is false; unary query negation applies normally.
- `package:mine` without a foreground package -> predicate is false and the UI reports the no-foreground state.
- Process snapshot refresh failure -> preserve the prior map and timestamp, expose the error, and retry on the shared polling schedule. Once the timestamp expires, new rows resolve to unknown even though the diagnostic map remains visible.
- Disposed controller or stale device/restart generation -> ignore both late success and late failure, including toasts.
- Activity polling failure -> retain the last valid foreground package and report the error. Process polling failure must not discard a successful Activity result, and Activity failure must not discard a successful process snapshot.

### 5. Good/Base/Bad Cases

- Good: `package:mine level:WARN -tag:Noise` resolves the foreground package, applies the level threshold, and excludes the tag from one query string.
- Good: `package:com.example.app` matches rows frozen from both `com.example.app` and `com.example.app:remote`, while `process=:com.example.app:remote` can isolate the secondary process.
- Good: `message~:"\\d+"` matches digits through the linear-time regex engine, and a 10,000-entry rebuild remains bounded for hostile patterns such as `^(a+)+$`.
- Good: choosing tag `QFoo.Bar` after `tag~:` inserts a quoted, RE2-escaped literal and matches the dot rather than any character.
- Good: completing `LEVEL:w` replaces the key with `level:` while preserving the value draft, so the parser receives `level:w`.
- Base: an empty query compiles to `always`, while a row captured before the first process snapshot keeps both identity fields `null` permanently.
- Base: `is:stacktrace` matches a DEBUG Java frame because classification is independent of log level.
- Bad: clearing `compiledQuery` when the user has typed `tag:Foo & ` makes an incomplete edit replace the last valid result.
- Bad: evaluating historical rows against the newest PID map changes old query results after PID reuse and assigns logs to the wrong application.
- Bad: keeping tag candidates after the buffer identity changes makes completion suggest cleared or previous-session tags.
- Bad: formatting an observed tag with `formatQueryValue` alone in regex mode turns tag punctuation into executable regex syntax.
- Bad: scanning only from the most recent space loses context when the cursor is inside `tag:"Q Tag Space"`.

### 6. Tests Required

- Parser/evaluator tests assert every key, bare and quoted text, implicit/explicit AND, OR precedence, parentheses, unary/group negation, exact/contains/regex process matching, quoted backslashes, positioned syntax errors, 4,096/64 boundaries, and all six level names plus letters and thresholds.
- Regex tests compile hostile nested-quantifier patterns and evaluate them against 10,000 entries without catastrophic backtracking.
- Crash tests use real Java crash, native tombstone, ANR, stack-frame, caused-by, elided-frame, exception-header, normal INFO, and deceptive ordinary-message samples; normalization tests assert `crashKind` is always present.
- Store tests assert invalid queries preserve the prior AST/index, repeated identical errors are idempotent, process snapshots publish atomically, expired/failed snapshots freeze new rows as unknown, historical rows never backfill, paused rows freeze identity at arrival, and clear/restart/device reset preserve sequence and query contracts.
- Store tests assert an anchored visible snapshot remains unchanged across multiple paused stream frames: only the pending queue and backlog count may change.
- Controller tests assert no overlapping Activity/process cycles, independent result publication, stale/disposed completion rejection, and retry after failure.
- Pure completion tests assert key/operator/value suggestions, uppercase-key correction, adjacent negation boundaries, quote-aware cursor context, regex-literal tag/process escaping, value quoting, prefix decoding, and replacement ranges. Hook tests assert newest-first sampling still includes newly observed tags when more than 200 distinct older tags exist. Package-list request deduplication, keyboard wrapping, and active-option scrolling require Tauri UI smoke unless those hooks gain a dedicated browser test harness.
- Store tests assert a row-tag shortcut appends to a compilable draft, falls back only for an invalid draft, preserves a valid draft that already contains the tag, and groups root OR queries.
- Run `pnpm test`, `pnpm exec tsc --noEmit`, and `pnpm build`; use a LaunchServices-started Tauri app with a device/emulator to smoke query editing, process/package completion and matching, multi-process package coverage, crash filtering, device switching, Restart, pause/resume, export, both empty states, 10,000-row regex rebuild, high-frequency input, and narrow layout.

### 7. Wrong vs Correct

#### Wrong

```typescript
const result = compileQuery(queryInput);
set({ compiledQuery: result.ok ? result.ast : null });
```

#### Correct

```typescript
const result = compileQuery(queryInput);
if (!result.ok) {
  set({ queryError: result });
  return;
}
set({ activeQuery: queryInput, compiledQuery: result.ast, queryError: null });
```

Only a valid query may replace the active evaluator and rebuild the filtered index.
