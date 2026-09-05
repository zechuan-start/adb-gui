# Settings and Clipboard State

## 1. Scope / Trigger

- Apply to shared preference controls, startup behavior, capture options and manual clipboard transfers.

## 2. Signatures

- `createSettingsStore(storageProvider)`, `useSettingsStore`, `requireSettings()`.
- `openSettings(section)` / `closeSettings()` in `useUiStore`.
- `SETTINGS_SECTIONS`, `findSettingsSection(id)`, `findSettingsRow(id)`, `searchSettingsRows(query)`, `modifiedRowIds(snapshot)`, `sectionResetPlan(section)`, `resetSettingsSection(settings, section)` live in `lib/settingsSections.ts` and own `SettingsSection`.
- `SettingRow` / `SettingToggle` / `SettingsRowGate` / `SettingsGroup` / `SettingRowLabel` render rows; `SettingsView` supplies the panel's row filter and modified marks.
- `confirmRestoreDefaults()` in `lib/tauri.ts` is the only confirmation entry for the global reset.
- `migrateSettings(version, settings)` in `lib/settings.ts` runs before field validation.
- `takeScreenshot(serial, ScreenshotBehavior, CaptureDestination)` requires a click-time snapshot; `startScreenRecord(serial, CaptureDestination)` freezes the directory; `stopScreenRecord(SaveRecordingRequest)` takes `{sessionId,behavior,target}` at each save attempt.
- `createClipboardTransfer(deps).bind(device) / transfer(direction) / dispose()`.
- Native clipboard wrappers belong in `lib/tauri.ts`.

## 3. Contracts

- Keep `theme` and `adb-gui-ui` as the owners of their existing values. Store only new preferences under `adb-gui-settings` as `{version:1,settings}`. Do not duplicate theme or pane/log visibility values there.
- Logcat and performance runtime stores must not own persisted view/background preferences. Do not persist rings, logs, queries, selection, pause flags, session IDs or clipboard text.
- Default to last pane, startup update checks enabled, standard log columns, wrap off, crash folding on, cozy rows off, background metrics off, all three post-save actions on.
- Derive standard/compact state from columns. Quick controls and dialog controls must write the same settings action.
- `SETTINGS_SECTIONS` is the only source of section order and labels. Dispatch section content through an exhaustive `switch` over `SettingsSection` closed by `assertNever`; never add a fallback branch that renders one section for unmatched ids. `performance` is a preference key rendered inside the general section, not a section of its own.
- Disabled scope follows storage ownership, not the dialog: each section wraps only the controls stored in `adb-gui-settings` in `disabled={!available}`. Theme (`useThemeStore`) and pane visibility (`adb-gui-ui`) stay editable while the settings file is unreadable, and carry no ownership badge in the UI.
- `sectionResetPlan(section)` is the single source of reset scope, covering settings keys plus the theme and pane resets. Each store resets independently: an unavailable or failing settings write must not suppress the theme or pane reset of the same section.
- `migrateSettings` accepts the current version as-is, walks the migration chain for older versions and throws when a step is missing, and refuses newer versions instead of reading their fields. Reading never writes; a migrated value reaches storage through the next user write. Add a migration step in the same change that raises `SETTINGS_VERSION`.
- Row labels and descriptions come from the registry, never from a literal inside a section component, so a search hit always names a row the panel can render. A row rendered with an unknown id throws.
- Search filters rows in place through `SettingsView`: matching rows keep their real controls, a group title disappears once all of its rows are filtered out, and section reset is disabled while a query is active.
- Modified markers compare the live snapshot against `defaultSettingsSnapshot()` across all three stores. A row that only presents a value another row owns (the logcat format preset) declares no `modified` predicate instead of duplicating the columns marker.
- The global reset confirms first, then restores settings, theme and pane visibility together. A confirmation that fails reports the failure and changes nothing.
- Apply the startup pane before React render. Share one update request across StrictMode effects; disabling permanently invalidates the current launch's check. Enabling during runtime does not initiate a check. Preserve user-initiated installation.
- Keep the dialog state transient, use a modal focus boundary, restore trigger focus on close, and suppress workspace hotkeys while settings are open.
- Send a click-time screenshot preference snapshot and a finalization-time recording snapshot to Rust. Compare requested flags with returned opened/revealed flags; saved files remain available if an opener fails.
- Persist one `capture.directory: string | null`. Directory-only reset preserves screenshot/recording flags; capture-section reset restores all four preferences. Native dialogs and invokes belong only in lib/tauri.ts; unavailable browser preview must not fabricate a chosen path.
- `createRecordingController` owns frontend action coordination, automatic-attempt identity and stale-response revision. Keep Rust phase authoritative. Polling must not overwrite an in-flight operation, and settings-read failures must still consume the automatic attempt. Only explicit retry/save-as/discard actions recover failures.
- Dialog returns revalidate the original session before submitting, including disposal/resume and device changes. Cancel preserves the session and returns focus. Open/reveal always uses the actual saved result path.
- Bind clipboard operations to serial, context revision and operation ID. Subscribe synchronously to selected device/availability/transport changes, including A -> B -> A. Check immediately before each write submission. Already-submitted writes cannot be withdrawn.
- Read source clipboard only on click. Keep one active operation per context, suppress stale feedback/finally, and release the subscription on unmount. Do not preview, persist, poll or log clipboard contents.

## 4. Validation & Error Matrix

- Missing new setting fields -> apply schema defaults for newly introduced fields.
- Malformed data/version -> preserve original storage, expose the error, disable new preference writes until explicit recovery or successful reload.
- Storage write failure -> retain last effective preference and expose unsaved error; never imply persistence succeeded.
- Empty/non-text/oversized clipboard or native read failure -> preserve destination. Do not classify plugin string errors by matching English text.
- Old read completion after a context change -> no write. Old submitted write completion -> no new-target success or busy-state mutation.

## 5. Good/Base/Bad Cases

- Good: changing log wrap preserves ring data, seq, pause and selection.
- Base: disabling auto-open still saves the screenshot or recording.
- Bad: placing `persist` around a high-frequency log/metrics store or using serial equality alone for late clipboard responses.

## 6. Tests Required

- Cover schema defaults, persistence restart, malformed values, write failures, group reset and runtime isolation.
- Cover section order, unknown section rejection, every reset plan, and the migration branches (same / older / newer / non-integer version).
- Cover ownership by SSR-rendering a section with `available: false` and asserting the theme buttons and pane checkboxes fall outside its disabled fieldset.
- SSR-render every section so an unknown row id fails in tests rather than at runtime, and cover the filtered and marked states.
- Browser-check the dialog against `scripts/screenshots/mock-tauri.js` at 1200x800 and 900x600 in both themes: dialog size, no horizontal overflow, vertical navigation keys, Escape focus restoration, the corrupted-settings disabled scope, and the global reset. The mock answers `plugin:dialog|message` with the ok button label because plugin-dialog resolves a confirmation by comparing labels; returning a boolean silently reads as cancel.
- Cover startup zero-call and in-flight invalidation behavior.
- Cover A -> B -> A, disconnect/authorization loss, transport replacement, stale finally and no retry after writes.
- Check dialog layout at 1200x800 and 900x600 in both themes, focus trapping, Escape and keyboard tab navigation.
- Use a real packaged Tauri app for native capture/clipboard tests. On macOS launch debug bundles through LaunchServices (`open -n`).

## 7. Wrong vs Correct

Wrong: capture `serial`, await source text, compare only `serial`, then write.

Correct: capture monotonically increasing context revision and operation ID, await the source, validate the still-current operation, then submit the write without another await in between.

## Browsing and Generator Preferences

### 1. Scope / Trigger

- Apply when changing file/app views, starting directories, generator parameters or their settings controls.

### 2. Signatures

- `projectDeviceFiles(entries, FilePreferences)` and `sortAppInfo(apps, AppPreferences)` return view arrays without mutating source data.
- `GeneratorOptions`, `GeneratedBatch extends GeneratorOptions`, `isGeneratedBatchStale(batch, inputRevision, options)`.
- `useCodeGeneratorStore` owns `input`, `inputRevision`, `generatedBatch`, error snapshots, `generate()` and `clear()`.

### 3. Contracts

- Persist `files`, `apps`, `codegen` only in version 1 settings. Missing fields receive declared defaults; malformed supplied values disable preferences until explicit recovery.
- Sort/filter in the final view projection, never in app source loading or the Rust file parser. Preserve path/package selection and existing cache/icon batches.
- Keep directory priority independent of direction; size-less directories and unknown app numeric metadata sort last. Zero-byte files are valid. Name ties use stable path/package keys.
- Read the starting directory only on file activation, device switch and Home. `null` delegates the default to Rust. A failed target stays editable while the last successful list retains its actual path. Explicit download-directory navigation never updates the preference.
- Hiding a selected dot entry clears selection/preview and invalidates late preview publication, while in-flight transfer snapshots remain unchanged.
- Generator controls share `settings.codegen`. Generation captures options once; old results retain options and values. Clear removes only input/results/errors. Parameter reset preserves input/results and affects staleness without automatic generation.

### 4. Validation & Error Matrix

- Invalid enum, relative/NUL device start path, wrong field type -> decoding error; preserve stored bytes.
- Unavailable start path -> actual Android error with editable target and explicit retry/download navigation; no automatic fallback or directory creation.
- Empty custom separator -> visible field error, generation disabled; keep old results and do not reinterpret literal separators.
- Write failure -> retain last effective option; show settings error at the active settings/page surface.

### 5. Good/Base/Bad Cases

- Good: app sort changes reorder visible entries while the selected package remains the same.
- Base: clearing code generation leaves Code 128 and custom separator preferences available after restart.
- Bad: adding sort options to the ADB loading effect dependencies or persisting the entire generator store.

### 6. Tests Required

- Test defaults/migration/write failure/group reset, every sorting dimension and direction, unknown/zero/tie behavior, filtered selection and late previews.
- Test generation option snapshots, reset/clear/restart semantics and refusal when settings are unavailable.
- Check seven settings tabs at 900x600 and 1200x800 in both themes, keyboard boundaries and native restart/device reads.

### 7. Wrong vs Correct

- Wrong: `readFresh: async () => sortAppInfo(await getInstalledApps(serial), preferences)`.
- Correct: load raw app sources once, then memoize `sortAppInfo(filterAppInfo(apps, search), preferences)` for display.
