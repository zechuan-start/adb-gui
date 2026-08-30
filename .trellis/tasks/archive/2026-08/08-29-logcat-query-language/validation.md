# Validation Result

Date: 2026-08-30

## Archive Disposition

The Logcat query-language implementation is ready to archive. The parser, evaluator, crash classifier, query-backed index, package-resolution controller, completion model, and Pause invariants are covered by focused tests. The final macOS debug bundle was also exercised through LaunchServices against live ADB streams for query editing, filtering, completion, export, Restart, detached scrolling, true Pause behavior, a generated emulator crash, and package-PID re-resolution across devices.

## Automated Gates

- `corepack pnpm test`: 16 files, 182/182 tests passed.
- `corepack pnpm exec tsc --noEmit`: strict TypeScript check passed.
- `corepack pnpm build`: TypeScript and Vite production build passed. The existing large-chunk warning remains (`654.16 kB`, `193.04 kB` gzip).
- `perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml`: 50/50 tests passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: passed.
- `git diff --check`: passed.
- `python3 ./.trellis/scripts/task.py validate 08-29-logcat-query-language`: 9 implementation context entries and 7 check context entries passed.

## Test Coverage

- Query tests cover every supported key and level, bare and quoted text, implicit and explicit AND, OR precedence, parentheses, term/group negation, exact/contains/linear-time regex matching, escaped spaces and backslashes, positioned errors, the dedicated unsupported `process:` error, and the 4,096-character/64-level limits.
- A hostile nested-quantifier pattern is compiled with RE2JS and evaluated 10,000 times without catastrophic backtracking.
- Crash tests cover Java fatal exceptions, AndroidRuntime signatures, native tombstones, ANR, Java frames, caused-by and elided frames, exception headers, benign messages, and DEBUG-level stacktraces. Normalization tests verify that `crashKind` is computed before query evaluation.
- Store tests cover successful commits, invalid-query retention and idempotence, root-OR tag-shortcut grouping, atomic package snapshots, stale-key rejection, package refresh failures, Restart, clear/reset behavior, and device-scoped PID invalidation.
- The Pause regression test anchors a visible snapshot, feeds multiple stream frames, and verifies that the visible buffer, filtered sequence index, revision, sequence allocator, and anchor do not change while only the bounded pending backlog grows.
- Package and activity controllers cover atomic publication, non-overlapping polling, queued refreshes, failure retry, disposed/stale completion rejection, retained snapshots, error-without-replacement behavior, and cleanup.
- Completion tests cover key/operator/value generation, case correction, unary exclusion, quoting, regex-literal escaping, decoded prefixes, cursor-aware replacement ranges, and sampling the latest 200 distinct tags from the newest end of the buffer.
- Structural searches found no remaining `LogcatFilter`, `matchesFilter`, or legacy filter-action references. `logcatQuery.ts` and `logcatCrash.ts` do not import React or Tauri.
- `.trellis/spec/frontend/quality-guidelines.md` contains the complete `Scenario: Logcat Query Language` contract, including syntax, precedence, package semantics, PID limitations, crash heuristics, errors, and required tests.

## Desktop And ADB Environment

- Tested bundle: `/Users/qi/.cache/adb-gui-smoke/logcat-final-20260830/debug/bundle/macos/ADB GUI.app`.
- The bundle was launched through macOS LaunchServices, preserving the WebKit animation-frame lifecycle required for paint and virtual-scroll conclusions.
- No installed `/Applications/ADB GUI.app` was present, so an older formal build could not be confused with the tested bundle.
- Device refresh exposed one selectable wireless identity, `adb-275179f2-BYZBAE._adb-tls-connect._tcp:5555`, alongside `emulator-5554`. Foreground Activity refresh completed without the former `adb: more than one device with serial` failure.

## Query UI Smoke

- `level:ERROR` filtered the live stream to error-level rows.
- `package:mine level:WARN` displayed resolved PID status and filtered the stream. An explicit package query also filtered successfully.
- `-tag:HWComposer`, `tag~:HW.*`, and `tag~:Activ` updated the visible result set as expected.
- With the stream paused and `tag:HWComposer` producing 68 visible rows, changing the input to `tag:HWComposer & ` preserved all 68 rows and the same first row while displaying `位置 16: 运算符 & 后缺少表达式`. This confirms that an incomplete edit does not replace the last valid query.
- Clicking the `BatteryStatsService` tag appended the shortcut to the active query as `level:ERROR tag:BatteryStatsService` and applied the resulting filter.
- Automatic completion and Cmd+Space both opened the suggestion list. Arrow/Enter selected `is:stacktrace` while retaining input focus; mouse selection applied `level:VERBOSE`; wrapping upward selected `level:ASSERT`.
- `is:stacktrace` matched 153 live rows, exercising the normalized `crashKind` field through the full query/UI path.
- On `emulator-5554`, `adb shell am crash com.qi.myktdemo` generated a real `AndroidRuntime` `FATAL EXCEPTION: main`. The live `is:crash` query matched exactly that crash row (`1 / 6114`), and `is:stacktrace` matched 163 related stacktrace rows (`163 / 6384`).
- With `package:mine level:WARN` active on the emulator, the current launcher package resolved to PID `1022`. Switching to the physical device retained the exact query text and atomically replaced the package result with PIDs `620, 3077`; the filtered result refreshed to `193 / 5319` without re-entering the query.

## Export Evidence

- With `tag=:HWComposer` active, export created `/Users/qi/Documents/ADB GUI/logs/adb-275179f2-BYZBAE._adb-tls-connect._tcp_5555-20260830-131517.log`.
- The file contains 67 raw Logcat lines. Every line contains the exact `HWComposer` tag and retains the original threadtime/PID/TID/level/message text; no non-matching row was present.

## Paint, Pause, And Session Regression

- The ring reached `10000 / 10000`, then remained under continuous FIFO eviction while a clicked row anchored the detached viewport.
- `/Users/qi/.cache/adb-gui-smoke/logcat-final-20260830/frames-detached/` contains 20 consecutive frames. Across the 19 adjacent-frame comparisons, the Logcat body had `YAVG=0` and `YMAX=0`; the previously reported old/new-row flashing and scroll jump did not reproduce.
- During true Pause, the pending backlog grew to `+4520` without changing the visible snapshot. `/Users/qi/.cache/adb-gui-smoke/logcat-final-20260830/frames-paused/` contains 16 frames; all 15 adjacent-frame comparisons again had `YAVG=0` and `YMAX=0`.
- The reported click-then-Pause sequence was repeated after a fresh app session at `10000 / 10000`. Across 10 samples in `/Users/qi/.cache/adb-gui-smoke/pause-click-20260830-1329-proof/`, the pending backlog increased from `+2665` to `+3292` while all visible-content hashes remained `021afa083be6b8d841efe2a88f8bd35e315853f662197d6f6538332f5bb4cf4c` and all cropped Logcat-body pixel hashes remained `a5946dcf62223260ec1ba556ad2509af82f943baa0871fb90dfa1950d3281a71`. No old/new-row flash or viewport jump occurred.
- Resume returned to live follow mode. Scroll to the End returned to the bottom, and clear-and-reconnect produced a fresh session with the initial dump.

## Debug Retrospective

- Root-cause category: test-coverage gap plus an implicit paint-timing assumption. FIFO eviction changed virtual-row indices before the detached anchor was compensated, and a passive effect plus a later animation frame allowed one stale `scrollTop` paint. Pause also needed a strict snapshot boundary rather than continuing to mutate visible rows.
- Earlier controller-only checks proved the scroll arithmetic but could not prove that React applied it before paint. Background smoke runs also suspended the only animation-frame scheduler and could be misread as a stopped ADB stream.
- Prevention is now structural: anchored detached revisions use `useLayoutEffect -> measureNow()`, paused frames enter only the bounded pending queue, and regression tests assert both the hook routing and the unchanged visible-store fields. The foreground LaunchServices smoke contract and these invariants are captured in the frontend quality, hook, and state-management specs.
- Similar virtualized streaming views must treat stable item identity, pre-paint anchor correction, and paused snapshot ownership as one contract; a timer fallback is not an acceptable substitute for a valid foreground smoke environment.

## Deferred Parent Integration Checks

- Final combined toolbar layout, light/dark presentation, Soft-Wrap, process/package forward mapping, and crash highlighting belong to child task D and the parent integration review.
