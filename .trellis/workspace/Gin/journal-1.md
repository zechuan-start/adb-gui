# Journal - Gin (Part 1)

> AI development session journal
> Started: 2026-10-25

---



## Session 1: Windows Android 17 clipboard and development Logcat fixes

**Date**: 2026-10-25
**Task**: Windows Android 17 clipboard and development Logcat fixes
**Branch**: `codex/fix-clipboard-android17`

### Summary

Fixed Android 17 lock-state checks, development Logcat performance-record memory growth, Windows browser test startup and i18n paths. Frontend 637 tests, browser 42 scenarios, Rust 169 tests and JVM checks passed; native development run stayed stable for about 20 minutes. Wireless mirroring stop/restart and lock-screen clipboard rejection verified. Test processes cleaned. Task progress updated; macOS privacy authorization remains pending, so the clipboard task stays in_progress.

### Main Changes

- Replaced KeyguardManager bootstrap with fail-closed Binder lock-state checks, added JVM tests, and regenerated the shared DEX.
- Replaced the full Logcat render array prop with an item count and accessor, preserving FIFO refreshes and StrictMode while bounding React development performance details.
- Added fixed-height and wrapped-row memory regression coverage; corrected Windows browser launch and catalog path handling.
- Updated task validation records and retained the outstanding macOS privacy authorization requirement.

### Git Commits

| Hash | Message |
|------|---------|
| `640635d` | fix(clipboard): support Android 17 lock-state checks |
| `60357d9` | fix(logcat): bound development performance payloads |
| `d03a71f` | test(i18n): normalize catalog paths on Windows |

### Testing

- Frontend: 637 tests; browser: 42 scenarios; TypeScript/Vite build passed.
- Rust: 169 tests, formatting and clippy passed; Java lock-state tests passed.
- Android 16 wireless device and Android 17 emulator clipboard transfer passed; locked writes were rejected and did not appear after unlocking.
- Logcat performance detail payload over 40 updates dropped from 23,208,900 bytes to 8,880 bytes.
- Final native development run lasted about 20 minutes without OOM; final renderer memory was 385 MB. Log pause/resume and wireless mirroring stop/restart passed.
- Test processes and ports were cleaned. QA logs remain because earlier automatic review rejected temporary-directory deletion.

### Status

Windows/Android fixes and this regression session are complete. The clipboard task remains **in_progress** because macOS privacy authorization validation is still pending.

### Next Steps

- Push the committed repair branch to the configured fork.
- Complete macOS privacy authorization validation in a suitable environment before closing the clipboard task.


## Session 2: Windows release installers and native QA completion

**Date**: 2026-10-26
**Task**: Windows release installers and native QA completion
**Branch**: `codex/fix-clipboard-android17`

### Summary

Validated actual NSIS/MSI 0.1.11 installation, launch and removal; lock-screen UI in both languages, no replay after unlock and 761 ms new-copy recovery; phone plus emulator mirroring, presets/options/transport reconnect. Restored original 0.1.10 files and shortcuts with full hash comparison. Device clipboard restored, but host clipboard snapshot was lost after the test controller reset; user informed and writes stopped. Test processes, ports and remote probes cleaned. Old temp deletion remains blocked; USB, physical WiFi, two physical devices, Linux and macOS privacy-preview validation remain open. No product source edits; QA records and recovery safeguards updated.

### Main Changes

- Recorded actual NSIS/MSI installation, launch and removal, including MSI administrator requirements and AppSearch reusing the prior install directory.
- Completed release lock-screen UI and additional Windows mirroring evidence; kept physical USB/WiFi, second physical device, Linux and independent topmost/audio measurements explicitly pending.
- Added clipboard recovery safeguards after the controller reset lost the host clipboard snapshot; device ClipData was restored, but host restoration failed and the user was informed.

### Git Commits

- `9fde7a6` — `docs: record Windows release QA and recovery safeguards`. Product source is unchanged; the user authorized documentation/journal commits without pushing.

### Testing

- Frontend: 61 files / 637 tests passed; TypeScript/Vite and NSIS/MSI release builds passed. Prior Rust/Java/browser results were not rerun this session.
- Both installed packages launched and mirrored the wireless phone. MSI removal success was confirmed by MsiInstaller events; a repeated uninstall returned 1605 after removal.
- All 10 original 0.1.10 files and both restored shortcuts matched backup hashes. Test processes, ports and remote DEX probes were cleaned. Documentation links and `git diff --check` passed.

### Status

Windows release QA for the available environment is recorded. The clipboard task remains **in_progress** for macOS privacy-preview authorization. Host clipboard restoration failed; old QA directory removal remains blocked by automatic approval review. New QA logs and installation backups are retained.

### Next Steps

- Keep these commits local as requested; do not archive the incomplete clipboard task.
- Complete the explicitly untested hardware/platform checks when the required cable, devices and environments are available.

### Same-evening Windows USB follow-up

- User supplied and authorized USB serial `275179f2`; tested the actual NSIS-installed 0.1.11 release using a fresh isolated WebView profile.
- A preliminary offline state recovered after one targeted ADB reconnect; this was recorded separately from the subsequent physical unplug/replug evidence.
- User physically unplugged the cable: device list became empty, mirroring/device stream/Logcat processes ended, and Start mirroring was disabled. After the user plugged it back in, the same device returned online automatically with a new transport ID. Manually restarting mirroring displayed real video; clicking Logcat Reconnect restored live collection.
- Closing the app with active USB mirroring and logs removed all test processes and CDP. NSIS uninstall exited 0. All 10 original 0.1.10 files, both shortcuts and both registry snapshots were restored with matching hashes; 5037/9223 were closed after stopping the test ADB server.
- No product-source changes or new clipboard reads/writes. Auto push and scrcpy clipboard autosync were disabled; previous host clipboard restoration failure remains unchanged. USB reconnect stale-copy behavior was not retested. Physical WiFi loss, two physical devices, Linux, independent topmost/audio effects and macOS privacy-preview authorization remain pending.
- `dde9b7f` — `docs: verify Windows USB physical reconnect`. Followed the user's existing approval to commit QA records locally without pushing. Task remains in_progress; USB temporary backups/profile are retained.
