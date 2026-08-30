# Validation Result

Date: 2026-08-30

## Archive Disposition

Child D is ready to archive. Soft-Wrap, view formatting, immutable process/package identity, process/package queries, and crash presentation are covered by focused tests and LaunchServices desktop smoke. The final Rust-only Restart ordering fix was rebuilt and re-smoked on the wireless device before this record was written.

## Automated Gates

- `corepack pnpm test`: 16 files, 186/186 tests passed.
- `corepack pnpm exec tsc --noEmit`: strict TypeScript check passed.
- `corepack pnpm build`: TypeScript and Vite production build passed. The existing 662.06 kB chunk-size warning remains informational.
- `perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml`: 57/57 tests passed.
- `cargo fmt --manifest-path src-tauri/Cargo.toml --check`: passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: passed.
- `git diff --check`: passed.

## Release Bundle And Environment

- Tested bundle: `/Users/qi/Desktop/android-kt/adb-gui/src-tauri/target/release/bundle/macos/ADB GUI.app`.
- The app was launched through macOS LaunchServices with captured stdout/stderr, preserving the production WebKit lifecycle.
- `tauri build --bundles app` produced the fresh `.app` and updater archive. The command then returned nonzero only because this checkout contains an updater public key but the local `TAURI_SIGNING_PRIVATE_KEY` is intentionally unavailable; the generated app bundle itself was launched and accepted.
- Physical device: `adb-275179f2-BYZBAE._adb-tls-connect._tcp:5555`. The duplicate bare mDNS serial was not selectable, Activity refresh succeeded, and no `more than one device with serial` error occurred.
- Emulator: `emulator-5554`.

## View And Soft-Wrap Smoke

- The initial physical-device stream grew from 7,718 rows to the 10,000-row capacity and continued FIFO eviction without a blank list.
- Standard and Compact switched immediately. All seven columns, date, time, PID, TID, package, tag, and level, were toggled independently; with every optional field disabled, message used the available width without column drift. Evidence includes `all-columns-off.png` under `/Users/qi/.cache/adb-gui-smoke/logcat-view-final-20260830/`.
- Soft-Wrap defaulted off and therefore used the fixed-height path. Enabling it exposed full long messages with dynamic row height. At capacity under continued eviction, an anchored detached row remained stable through ten alternating wrap toggles.
- With Soft-Wrap enabled, switching to Apps and back retained the setting, query, rows, and anchor. Evidence: `/Users/qi/.cache/adb-gui-smoke/logcat-view-final-20260830/soft-wrap-tab-return.png`.
- Store and hook tests assert that the disabled path does not attach `measureElement`, while dynamic measurements compensate the stable anchored sequence before paint.

## Process And Query Smoke

- On the final bundle, `process:one.dev.video91` matched 1,403 of 10,000 frozen physical-device rows.
- The device process snapshot contained both `com.tencent.mm` and `com.tencent.mm:push`. `package:com.tencent.mm` matched 14 rows; `process=:com.tencent.mm` matched 6 and `process:com.tencent.mm:push` matched 8. The package result therefore covered both the main and secondary process without a `pidof` fallback.
- Focused tests cover contains/exact/regex/negative `process:` predicates, `package:mine`, five-second snapshot trust, failed refresh without timestamp renewal, PID reuse, immutable historical identities, Restart/device clearing, and A -> B -> A generation rejection.
- Physical -> emulator -> physical switching rebuilt process state each time and resumed streaming without leaking rows from the prior device.

## Crash Presentation Smoke

- On `emulator-5554`, `adb shell am crash com.qi.myktdemo` generated a real `AndroidRuntime` `FATAL EXCEPTION: main`. The final bundle's `is:crash` query matched exactly `1 / 6407` and displayed the crash emphasis; evidence: `/Users/qi/.cache/adb-gui-smoke/logcat-view-final-restart-20260830/crash-dark.png`.
- The preceding LaunchServices presentation pass exercised the same unchanged frontend in light and dark modes and distinguished crash rows from the weaker stacktrace marker. Semantic background/border tokens remain independent from E/F level text colors.
- Crash classifier tests cover Java crashes, native tombstones, ANR, Java frames, caused-by/elided frames, exception headers, normal messages, and deceptive non-crash samples.

## Pause, Paint, And Restart Regression

- At `10000 / 10000` under continuous eviction, a row was clicked and Pause was pressed immediately. Ten post-Pause accessibility samples produced the same visible-row SHA-256, `204b11cead8536dac2738cdcb048569b4a7dc85de8c90fabf2bdb437124f4f2b`. Only backlog/counter state changed.
- The earlier pixel-level proof contains ten identical Logcat-body crops, all `183bceb5edfa493d24688119ce325a033370d6936c2f7137e04b37191a0e7a3f`, under `/Users/qi/.cache/adb-gui-smoke/logcat-view-final-20260830/pause-body-crops/`.
- The wireless Restart failure was reproduced on the old binary as a persistent `0 / 0` with a live adb child. The final bundle then passed two consecutive same-serial Restarts: the first recovered to 2,400 rows within one second and 10,000 within four seconds; the second recovered to 200 within one second and 8,129 within four seconds. Evidence: `/Users/qi/.cache/adb-gui-smoke/logcat-view-final-restart-20260830/restart-2-recovered.png`.
- Root cause category: implicit transport assumption plus missing real-device coverage. Starting a new same-serial adb client before the old client exited worked on the emulator but the mDNS transport could tear down the new stream when the old client closed.
- Prevention is structural: per-serial start locks, stop-and-wait before spawn, explicit abort on stop failure, focused ordering/lock tests, and a backend spec requirement for two consecutive wireless Restarts.

## Regression And Export

- Query editing, tag shortcut, Pause/resume, Scroll to the End, clear, device-buffer clear, Restart, tab retention, and raw export remained operational.
- Raw export was verified against an exact-tag query: every exported line retained original threadtime, PID, TID, level, tag, and message rather than rendered column text.
- Toolbar controls remained non-overlapping at 1200x800 and 900x600 in light and dark presentation checks.
