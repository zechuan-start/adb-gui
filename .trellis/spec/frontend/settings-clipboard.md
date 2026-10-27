# Settings and Clipboard State

## 1. Scope / Trigger

- Apply to shared preference controls, startup behavior, capture options, manual clipboard transfers and clipboard auto push. Read [Bilingual UI and Error Presentation](./i18n.md) for locale, catalog and structured-error contracts.

## 2. Signatures

- `createSettingsStore(storageProvider)`, `useSettingsStore`, `requireSettings()`.
- `openSettings(section)` / `closeSettings()` in `useUiStore`.
- `SETTINGS_SECTIONS`, `findSettingsSection(id)`, `findSettingsRow(id)`, `sectionRowIds(section)`, `modifiedRowIds(snapshot)`, `hasSectionResetChanges(section, snapshot)`, `sectionResetPlan(section)`, `resetSettingsSection(settings, section)` live in `lib/settingsSections.ts` and own `SettingsSection`.
- `SettingRow` / `SettingSwitchRow` / `SettingRowLabel` render rows; `SettingsView` supplies modified marks. `Switch`, `SegmentedControl` and `ChipGroup` are the shared setting controls.
- `confirmRestoreDefaults()` in `lib/tauri.ts` is the only confirmation entry for the global reset.
- `migrateSettings(version, settings)` in `lib/settings.ts` runs before field validation.
- `takeScreenshot(serial, ScreenshotBehavior, CaptureDestination)` requires a click-time snapshot; `startScreenRecord(serial, CaptureDestination)` freezes the directory; `stopScreenRecord(SaveRecordingRequest)` takes `{sessionId,behavior,target}` at each save attempt.
- `createClipboardTransfer(deps).bind(device) / transfer(direction) / dispose()`.
- Native clipboard wrappers belong in `lib/tauri.ts`, including `setClipboardAutoPush(target: { serial, contextKey } | null): Promise<number>` (sends only `{ serial }`), `getClipboardAutoPushSupport(): Promise<boolean>` and `onClipboardAutoPushStatus(callback)` for the `clipboard-auto-push` event ([backend contract](../backend/clipboard.md#scenario-clipboard-auto-push)).
- `clipboardAutoPushTarget({ tauri, supported, enabled, device })` and `createClipboardAutoPushBinding(deps).start() / bind(target) / stop()` live in `lib/clipboardAutoPush.ts`.
- `useClipboardAutoPushStore` (runtime, not persisted) and `clipboardAutoPushStatus(inputs)` live in `store/clipboardAutoPush.ts`. `useClipboardAutoPush()` is mounted once in `App`; `useClipboardAutoPushControl()` is the switch shared by `ClipboardTool` and `GeneralSection`.

## 3. Contracts

- Keep `theme`, `locale` and `adb-gui-ui` as independent owners of their existing values. Store settings preferences under `adb-gui-settings` as `{version:1,settings}`. Do not duplicate language, theme or pane/log visibility there; language belongs only to `useLocaleStore`.
- Logcat and performance runtime stores must not own persisted view/background preferences. Do not persist rings, logs, queries, selection, pause flags, session IDs or clipboard text.
- Default to last pane, startup update checks enabled, standard log columns, wrap off, crash folding on, cozy rows off, background metrics off, clipboard auto push off, all three post-save actions on.
- Derive standard/compact state from columns. Quick controls and dialog controls must write the same settings action.
- `SETTINGS_SECTIONS` is the only source of section order and labels. Dispatch section content through an exhaustive `switch` over `SettingsSection` closed by `assertNever`; never add a fallback branch that renders one section for unmatched ids. `performance` is a preference key rendered inside the general section, not a section of its own.
- Render all seven sections (`general`, `logcat`, `capture`, `mirror`, `files`, `apps`, `codegen`) in one scroll container. The left navigation is an anchor index: clicks and ArrowUp / ArrowDown / Home / End scroll to the section, while a local scrollspy controls `aria-current`. `openSettings(section)` opens the dialog and scrolls to that section without changing its callers.
- Use one hierarchy of section heading then setting rows. Do not restore section tabs, search, or group subheadings. Keep the global reset at the end of the scroll content and expose a section reset beside a heading only while `hasSectionResetChanges` reports a change that the reset can actually restore. A language-only modification keeps its row marker but does not expose a no-op section reset.
- Disabled scope follows storage ownership, not the dialog: each section wraps only the controls stored in `adb-gui-settings` in `disabled={!available}`. Language (`useLocaleStore`), theme (`useThemeStore`) and pane visibility (`adb-gui-ui`) stay editable while the settings file is unreadable, and carry no ownership badge in the UI.
- `sectionResetPlan(section)` is the single source of reset scope, covering settings keys plus the theme and pane resets, and intentionally excluding locale. Each store resets independently: an unavailable or failing settings write must not suppress the theme or pane reset of the same section.
- `migrateSettings` accepts the current version as-is, walks the migration chain for older versions and throws when a step is missing, and refuses newer versions instead of reading their fields. Reading never writes; a migrated value reaches storage through the next user write. Add a migration step in the same change that raises `SETTINGS_VERSION`.
- `SettingsRowMeta.label`, optional `description` and section labels are `(messages: Messages) => string` functions. Resolve them with the current `useT()` catalog, never a section-local literal or an import-time translated string. A row rendered with an unknown id throws an English development assertion.
- Modified markers compare preferences, theme, locale preference and pane visibility against `defaultSettingsSnapshot()` across their four independent stores. Render `t.settings.dialog.modified` and its localized title; compare locale preference to `system`, not to the currently resolved language. A row that only presents a value another row owns (the logcat format preset) declares no `modified` predicate instead of duplicating the columns marker.
- The global reset confirms first, then restores settings, theme and pane visibility together while preserving the language preference. A confirmation that fails reports the failure and changes nothing.
- Apply the startup pane before React render. Share one update request across StrictMode effects; disabling permanently invalidates the current launch's check. Enabling during runtime does not initiate a check. Preserve user-initiated installation.
- Keep the dialog state transient, use a modal focus boundary, restore trigger focus on close, and suppress workspace hotkeys while settings are open.
- On opening, focus the non-tabbable settings heading without an outline or scroll movement. Tab and Shift+Tab from the heading enter the first and last controls; retain visible keyboard focus on controls and do not reset focus when navigating between sections.
- Keep settings errors and their recovery controls outside the scrolling section list so anchors never hide them. Forward Tab from an index button enters that section's first enabled control, or its focusable section when all controls are disabled.
- On macOS, expose Settings through the native application menu with `Cmd+,`, emit `open-settings`, and subscribe through `onOpenSettings()` in `lib/tauri.ts`. Initialize and synchronize the custom title through the [locale-menu contract](./i18n.md#native-settings-menu). Preserve an already-open section and dispose late listener registrations. Do not register a Windows shortcut.
- Send a click-time screenshot preference snapshot and a finalization-time recording snapshot to Rust. Compare requested flags with returned opened/revealed flags; saved files remain available if an opener fails.
- Persist `mirror: { preset, options, extraArgs, scrcpyPath }` without raising `SETTINGS_VERSION`; a missing group or field reads as its default (`standard`, all six options off, `""`, `null`). `preset` and options decode with `choice` / `flag`; `extraArgs` must be a string without NUL, CR or LF (`settings.invalidField`); `scrcpyPath` is `null` or an absolute POSIX, drive-letter or UNC path without NUL (`settings.invalidScrcpyPath`). `extraArgs` is stored verbatim: Rust is its only parser (see [scrcpy Mirroring](../backend/mirror.md)). The `mirror` section has four rows (`scrcpyPath`, `mirrorPreset`, `mirrorOptions`, `mirrorExtraArgs`) and `sectionResetPlan("mirror")` restores the whole group. The A-10 module and the settings row render the same `MirrorPresetControl`, so both write `update("mirror", ...)`. One preference set serves every device.
- Persist one `capture.directory: string | null`. Directory-only reset preserves screenshot/recording flags; capture-section reset restores all four preferences. Native dialogs and invokes belong only in lib/tauri.ts; unavailable browser preview must not fabricate a chosen path.
- `createRecordingController` owns frontend action coordination, automatic-attempt identity and stale-response revision. Keep Rust phase authoritative. Polling must not overwrite an in-flight operation, and settings-read failures must still consume the automatic attempt. Only explicit retry/save-as/discard actions recover failures.
- Dialog returns revalidate the original session before submitting, including disposal/resume and device changes. Cancel preserves the session and returns focus. Open/reveal always uses the actual saved result path.
- Bind clipboard operations to serial, context revision and operation ID. Subscribe synchronously to selected device/availability/transport changes, including A -> B -> A. Check immediately before each write submission. Already-submitted writes cannot be withdrawn.
- Manual transfers read the source clipboard only on click. Keep one active operation per context, suppress stale feedback/finally, and release the subscription on unmount.
- Auto push polls only the host change count, in Rust; the text is read in Rust after a change and never enters the webview. Neither path previews, persists or logs clipboard contents.

### Clipboard auto push

- Persist `clipboard: { autoPush: boolean }`, decoded with `flag(group, "autoPush", false)` without raising `SETTINGS_VERSION`. Row `clipboardAutoPush` follows `background` in General with a `modified` predicate; `sectionResetPlan("general").settingsKeys` includes `clipboard`, so the section reset and the global reset turn it off.
- The module switch and the settings row both call `useClipboardAutoPushControl().setChecked`, which is `update("clipboard", { autoPush })`. Disable the switch outside Tauri, when `supported === false` or when settings are unavailable; an offline device does not disable it. On an unsupported platform the settings row replaces its description with `settings.rows.clipboardAutoPush.unsupported`; do not detect the platform from the user agent.
- Target = `{ serial, contextKey: clipboardContextKey(device) }` only when Tauri, `supported === true`, `available && autoPush` and the selected device is in state `device`; otherwise `null`. `useClipboardAutoPush` calls `binding.bind(target)` from an effect keyed by `contextKey`, so an equal target re-rendered is not resent while A -> B -> A sends three targets.
- The binding is created once per hook instance and survives StrictMode cleanup. `start()` registers the listener (disposing a late registration) and queries support once; `stop()` unlistens and sends `null`. Requests run one at a time through a promise queue so Rust applies them in call order; only the latest request may call `bound` / `bindFailed`.
- The store discards events whose generation is older than the bound one, keeps the newest event of a generation whose command has not returned (`early`) and applies it in `bound`. `beginBind` clears the previous result, so another device never shows "pushed". `bound(generation, true)` starts at `watching` because the command returns after the baseline is recorded.
- `clipboardAutoPushStatus` precedence: not Tauri -> `off`; `supported === false` -> `unsupported`; settings unavailable -> `settingsUnavailable`; switch off -> `off`; support/listener failure -> `failed`; support unknown -> `null`; device offline -> `waitingDevice`; else the runtime status (`null` while binding).
- The module renders one `role="status"` `aria-live="polite"` line below the switch (none while `off`, an empty line while `null`). Tones: `watching` / `pushing` ink2, `pushed` ok with `timeOfDay(locale)`, `skipped(no_text)` / `waitingDevice` / `unsupported` ink3, `skipped(too_large)` / `settingsUnavailable` warn, `failed` err with `errorText`. Automatic results never toast; the manual buttons keep their toasts.

## 4. Validation & Error Matrix

- Missing new setting fields -> apply schema defaults for newly introduced fields.
- Malformed data/version -> preserve original storage, retain `AppErrorPayload` for render-time translation, and disable settings preference writes until explicit recovery or successful reload. Language, theme and pane visibility retain their independent availability.
- Storage write failure -> retain last effective preference and expose unsaved error; never imply persistence succeeded.
- Empty/non-text/oversized clipboard or native read failure -> preserve destination. Do not classify plugin string errors by matching English text.
- Old read completion after a context change -> no write. Old submitted write completion -> no new-target success or busy-state mutation.
- Malformed `clipboard.autoPush` -> `settings.invalidField` (`key: "autoPush"`); settings become unavailable and the target is `null`.
- `setClipboardAutoPush` rejection for the latest request -> `failed` status with the payload; a stale rejection or result is ignored. Support query or listener registration failure -> `setupError`, shown as `failed` while the switch is on.
- Auto push event of an older generation -> ignored; of an unbound newer generation -> held as `early` until its command returns, then applied or discarded.

## 5. Good/Base/Bad Cases

- Good: changing log wrap preserves ring data, seq, pause and selection.
- Base: disabling auto-open still saves the screenshot or recording.
- Bad: placing `persist` around a high-frequency log/metrics store or using serial equality alone for late clipboard responses.

## 6. Tests Required

- Cover schema defaults, persistence restart, malformed values, write failures, group reset and runtime isolation.
- Cover section order, unknown section rejection, every reset plan, and the migration branches (same / older / newer / non-integer version).
- Cover ownership by SSR-rendering a section with `available: false` and asserting language and theme radio groups and pane chips fall outside its disabled fieldset. Cover language-only modification, reset-button visibility, and locale preservation across General/global reset.
- SSR-render every section so an unknown row id fails in tests rather than at runtime, and cover readable modified marks, stacked rows, control roles, selected states, and the absence of native settings checkboxes.
- Browser-check the dialog against `scripts/screenshots/mock-tauri.js` at 1200x800 and 900x600 in both themes: seven-section rendering, no horizontal overflow, anchor clicks, scrollspy, navigation keys, per-section and global reset, Escape focus restoration, the corrupted-settings disabled scope, and quick-control synchronization. The mock answers `plugin:dialog|message` with the ok button label because plugin-dialog resolves a confirmation by comparing labels; returning a boolean silently reads as cancel.
- Cover startup zero-call and in-flight invalidation behavior.
- Cover A -> B -> A, disconnect/authorization loss, transport replacement, stale finally and no retry after writes.
- Auto push: setting default/missing/non-boolean/restart/general and global reset; target derivation for each blocking input and transport identity; binding order A -> B -> A, unchanged-target dedupe, latest-request-wins for results and rejections, `stop` with a late listener registration, StrictMode stop/start ordering, support queried once, setup failures; store generation filter, early events, cleared result on rebind; status precedence; SSR of every status line in both languages, disabled states, the unsupported settings description and no toast.
- Browser-check auto push with `mock-tauri.js` (`__ADB_GUI_MOCK_CLIPBOARD_AUTO_PUSH.supported`, `__ADB_GUI_MOCK_EMIT`) at 900x600 and 1200x800 in both themes and languages: row click, persisted switch, watching / pushed / locked / too-large lines without a toast, a stale generation ignored, settings row sync and section reset, and both switches disabled when unsupported.
- Check dialog layout at 1200x800 and 900x600 in both themes, focus trapping, Escape and keyboard tab navigation.
- Use a real packaged Tauri app for native capture/clipboard tests. On macOS launch debug bundles through LaunchServices (`open -n`).
- Before native clipboard writes, preserve complete host formats and device ClipData with a cleanup owner that survives the UI driver's timeout/reset; do not keep the sole snapshot in a disposable REPL or a child process that dies with it. Verify that recovery path on synthetic data first. Keep original clipboard contents out of logs, repository files and disk snapshots.
- Bound UI waits below the controlling runtime timeout and restore/verify clipboard contents before unrelated long-running QA. A `finally` in a driver that can be terminated is not a recovery guarantee. If the original snapshot is lost, stop further writes, disable automatic push and explicitly report the failed restoration; never reuse an earlier session's restoration claim.

## 7. Wrong vs Correct

Wrong: capture `serial`, await source text, compare only `serial`, then write.

Correct: capture monotonically increasing context revision and operation ID, await the source, validate the still-current operation, then submit the write without another await in between.

Wrong: poll `readText()` from a `setInterval` in the webview and call `setDeviceClipboard` when it differs; the timer stalls while the window is hidden and the text crosses into the webview.

Correct: send only the target to Rust (`setClipboardAutoPush`) and render the generation-filtered status events.

## Browsing and Generator Preferences

### 1. Scope / Trigger

- Apply when changing file/app views, starting directories, generator parameters or their settings controls, or the start-directory action in the file bookmark editor.

### 2. Signatures

- `projectDeviceFiles(entries, FilePreferences)` and `sortAppInfo(apps, AppPreferences, Intl.Collator)` return view arrays without mutating source data.
- `GeneratorOptions`, `GeneratedBatch extends GeneratorOptions`, `isGeneratedBatchStale(batch, inputRevision, options)`.
- `useCodeGeneratorStore` owns `input`, `inputRevision`, `generatedBatch`, error snapshots, `generate()` and `clear()`.

### 3. Contracts

- Persist `files`, `apps`, `codegen` only in version 1 settings. Missing fields receive declared defaults; malformed supplied values disable preferences until explicit recovery.
- Sort/filter in the final view projection, never in app source loading or the Rust file parser. Supply `appNameCollator(locale)` and include locale in the sorting memo dependencies; language switching must not trigger ADB loading. Preserve path/package selection and existing cache/icon batches.
- Keep directory priority independent of direction; size-less directories and unknown app numeric metadata sort last. Zero-byte files are valid. Name ties use stable path/package keys.
- Read the starting directory only on file activation, device switch and Home. `null` delegates the default to Rust. A failed target stays editable while the last successful list retains its actual path. Explicit download-directory navigation never updates the preference.
- A start directory may be unavailable on one device and present on another, because one preference serves every device. When the automatic read of a non-null start directory fails with `files.notDirectory` or `files.directoryPermission`, `loadDirectory(serial, path, { fallbackToDefault: true })` dispatches `start-fallback` and loads `null`. The pane shows a warn notice naming the start path with a Settings action instead of the list error. The preference is never rewritten.
- The notice survives only the default-directory load it explains (`list-start` with `keepStartFallback`); any later navigation and `reset` clear it. The fallback runs only after the request-id staleness check, so a late failure from a replaced device cannot open a directory on the new one.
- Manual path entry, breadcrumbs, bookmark jumps and the list error's retry never pass `fallbackToDefault`. A failing default directory is not retried.
- "Set as start directory" in the bookmark editor writes `files.startDirectory` through the same `update("files", ...)` call as the settings row, so the settings panel, Home and the fallback all read one value.
- Hiding a selected dot entry clears selection/preview and invalidates late preview publication, while in-flight transfer snapshots remain unchanged.
- Generator controls share `settings.codegen`. Generation captures options once; old results retain options and values. Clear removes only input/results/errors. Parameter reset preserves input/results and affects staleness without automatic generation.

### 4. Validation & Error Matrix

- Invalid enum, relative/NUL device start path, wrong field type -> decoding error; preserve stored bytes.
- Unavailable start path (`files.notDirectory` / `files.directoryPermission`) on an automatic start load -> open the default directory, show the fallback notice, keep the stored preference; no directory creation.
- The same failure on manual navigation, any other failure code, a `null` start directory, or a failing default directory -> actual Android error with editable target and explicit retry/download navigation.
- Empty custom separator -> visible field error, generation disabled; keep old results and do not reinterpret literal separators.
- Write failure -> retain last effective option; show settings error at the active settings/page surface.

### 5. Good/Base/Bad Cases

- Good: app sort changes reorder visible entries while the selected package remains the same.
- Base: clearing code generation leaves Code 128 and custom separator preferences available after restart.
- Good: a start directory that exists only on device A opens there, while device B opens the downloads folder with a notice naming the missing path.
- Bad: adding sort options to the ADB loading effect dependencies or persisting the entire generator store.
- Bad: rewriting `files.startDirectory` to `null` on fallback; switching back to the device that has the directory would no longer open it.

### 6. Tests Required

- Test defaults/migration/write failure/group reset, every sorting dimension and direction, unknown/zero/tie behavior, filtered selection and late previews.
- Test `isUnavailableStartDirectoryError` codes and the reducer: `start-fallback` ignores stale requests and other devices, does not set `listError`, survives `keepStartFallback`, and clears on the next `list-start` and on `reset`. Browser-smoke the fallback on entry and Home, the notice clearing on navigation, and no fallback for manual jumps or a failing default directory.
- Test generation option snapshots, reset/clear/restart semantics and refusal when settings are unavailable.
- Check all seven settings sections in the scrolling panel at 900x600 and 1200x800 in both themes, keyboard boundaries and native restart/device reads.

### 7. Wrong vs Correct

- Wrong: `readFresh: async () => sortAppInfo(await getInstalledApps(serial), preferences, appNameCollator(locale))`.
- Correct: load raw app sources once, then memoize `sortAppInfo(filterAppInfo(apps, search), preferences, appNameCollator(locale))` with `[apps, search, preferences, locale]` for display.
