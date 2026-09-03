# Validation: 应用信息读取稳定性加固

## Automated checks

- `cargo test`: 77 passed.
- `cargo clippy --all-targets -- -D warnings`: passed.
- `pnpm test -- --run`: 279 passed.
- `pnpm build`: passed. Vite only reported the existing chunk-size warning.
- `git diff --check main...HEAD`: passed.

## Device checks

- Rebuilt `app-info.dex` and confirmed the installed application uses the same artifact hash.
- Loaded 227 third-party applications from the connected device; metadata completed in about 1.96 seconds.
- Confirmed `--icons-only` package filtering returns only requested packages.
- Confirmed compatibility with the old no-sentinel dex and its unfiltered superset response.
- Replaced the remote dex with invalid data of the same size and confirmed the Tauri path repaired it automatically in about 2 seconds.
- Refreshed the application panel repeatedly through the real UI; every successful run returned 227 structured entries without a fallback banner.
- Temporarily removed the installed `app-info.dex`, confirmed the fallback banner appeared, expanded the concrete missing-resource error, restored the dex, and confirmed the Retry action returned to 227 structured entries.

## Residual device coverage

- The USB/WiFi dual-transport switch scenario was not reproducible in this session because `adb devices` exposed only one WiFi transport. The global-lock behavior and stale-request guards are covered by code review and unit tests, but this physical topology remains a release-observation item.

## Result

Accepted for task closure. All executable quality gates and the primary success, fallback, detail, retry, compatibility, filtering, and corrupt-dex recovery paths passed.
