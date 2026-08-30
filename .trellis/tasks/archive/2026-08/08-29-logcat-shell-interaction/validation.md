# Validation Result

Date: 2026-08-30

## Automated Gates

- `corepack pnpm test`: 8 files, 77 tests passed.
- `corepack pnpm build`: strict TypeScript check and Vite production build passed.
- `perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml`: 33 tests passed.
- `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`: passed.
- `rustfmt --edition 2021 --check src-tauri/src/commands/logcat.rs`: passed.
- `git diff --check`: passed.
- Full-crate `cargo fmt --check` remains blocked only by pre-existing formatting differences in `device_info.rs`, `keys.rs`, and `screenshot.rs`; this task did not modify those files.

## Emulator Smoke

- Emulator serial: `emulator-5554`.
- `live + follow`, `live + detached`, `paused + follow`, and `paused + detached` all kept data flow and viewport following independent. Scrolling upward detached the viewport without changing the Pause icon; scrolling downward at the bottom kept follow mode active.
- Clicking a row detached and anchored it. After the 10,000-row FIFO window evicted more than 1,000 rows, marker row `anchor-4496` retained its viewport position.
- Switching to the Apps tab and back retained search, level, pause state, anchor, and scroll position. The hidden Logcat view continued receiving data, with backlog increasing from 1 to 1,195.
- Restart replaced the Logcat child process, retained filters, and resumed output. A second cold-started instance that remained on the Tools tab created no Logcat child process.
- Terminating the active Logcat child showed the disconnect strip within 0.5 seconds, retained 1,444 rows, kept local filtering usable, and recovered through Restart.
- Clear Screen removed only the frontend window; device marker `CodexClearScreen` remained in `adb logcat -d`. Clear Device Buffer required two clicks, reset confirmation when the menu closed, and removed the marker only after confirmation.
- Layout and semantic colors were checked at 1200x800 and 900x600 in both light and dark themes without overlap.

## Covered By Focused Tests

- Stream mode and follow mode behavior for all four combinations, paused backlog bounds, detached counters, anchor eviction, restart/reset state, and filter preservation.
- `LogcatEntry.seq` remains globally monotonic and is not reused after Clear Screen, Restart, or device reset.
- Bottom-directed wheel input, upward detachment, programmatic-scroll guards, stale animation-frame cancellation, hidden-tab restoration, and repeatable React StrictMode cleanup.
- Restart generation guards, pending restart device loss, retained filtering while disconnected, and stale-session rejection.
