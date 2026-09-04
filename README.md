# ADB GUI

**English** | [简体中文](README.zh-CN.md)

A cross-platform desktop workbench for everyday `adb` work: one device context, six focused workspaces, and a Logcat panel that stays with you wherever you are in the app.

[![Latest release](https://img.shields.io/github/v/release/zechuan-start/adb-gui?label=release)](https://github.com/zechuan-start/adb-gui/releases/latest)
[![License](https://img.shields.io/github/license/zechuan-start/adb-gui)](LICENSE)
![Platforms](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![Built with Tauri 2](https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React%2019-informational)

[Download the latest release](https://github.com/zechuan-start/adb-gui/releases/latest) · [All releases](https://github.com/zechuan-start/adb-gui/releases)

![ADB GUI tools workspace with the Logcat panel open](docs/images/workspace-tools.png)

> The application interface ships in Simplified Chinese. Screenshots in this README are captured from the real UI with mock device data (see [Development](#development)).

## Highlights

- **One device context** — USB and Wi-Fi transports of the same phone are merged into a single entry, and every command in every workspace targets the device you picked in the top bar.
- **Logcat everywhere** — the log panel docks under any workspace, remembers whether it was open per workspace, is resizable, and can go full height when you need to read a stack trace.
- **Local-first** — screenshots, recordings, logs, reports, APKs, and transferred files stay between your computer and your device. Nothing is uploaded.
- **ADB included** — resolved from `PATH`, `ANDROID_HOME`, or `ANDROID_SDK_ROOT`, with a bundled binary as a fallback, so a separate Platform Tools install is optional.

## Workspaces

| # | Workspace | What it covers |
| --- | --- | --- |
| 01 | Tools | Screenshot, screen recording, APK install, deep links, port forwarding, key events, current app, bug reports |
| 02 | Apps | Third-party package list with icons, versions, install dates, APK size, and lifecycle actions |
| 03 | Files | Device file browser with upload, download, folder creation, and image preview |
| 04 | Codegen | Batch QR code and Code 128 barcode generation |
| 05 | Decoder | Read codes back out of image files, drag-and-drop, or a pasted screenshot |
| 06 | Performance | Live CPU, memory, battery, and per-process usage |
| — | Logcat | Streaming log panel with a query language, shared by every workspace |

## Features

### Device and connection

- Continuously discovers attached and network devices and shows online, offline, or unauthorized state.
- Merges the USB and Wi-Fi transports of one physical device, so switching cables never loses your place.
- Connects or disconnects by `ip:port`, and can flip the selected USB device over to ADB over Wi-Fi.
- Shows the ADB version and source in the top bar, plus a specification strip with vendor/model, serial, transport, Android version and SDK, ABI, resolution, density, and battery, with the current foreground Activity on its own row.

### Logcat

![Logcat panel expanded with a filter query applied](docs/images/logcat.png)

- Streams Logcat live, with pause/resume, follow-to-bottom, clear screen, clear the device buffer, and export of the current filtered result.
- Filters through a small query language: `tag:`, `message:`, `level:`, `package:`, `process:`, and `is:crash` / `is:stacktrace`, combined with `&`, `|`, `-`, and parentheses, with regex or exact-match modifiers and inline completions.
- Detects crashes and stack traces, highlights them, and can auto-fold long traces so one crash stays one line until you open it.
- Adjustable view: which columns to show, soft wrap, wide line spacing, and a full-height mode.
- The panel keeps a per-workspace open state and shows an unread counter while it is hidden.

### Apps

![Apps workspace with a package selected](docs/images/apps.png)

- Lists third-party packages with real launcher icons, display names, version name and code, first install and last update time, and APK size.
- Search by app name or package name, then launch, force-stop, clear data, or uninstall the selected package.
- Icons and app metadata are cached per device, so reopening the workspace is fast.

### Files

![File browser with an image preview](docs/images/files.png)

- Browses device directories with breadcrumbs and absolute-path navigation.
- Creates folders, uploads one or many files, and downloads to a location you choose.
- Previews PNG, JPEG, WebP, and GIF images inline.
- Downloads are written through a validated temporary file before replacing the target, and uploads never silently overwrite an existing file on the device.

### Codegen and decoder

![Batch QR code generation](docs/images/codegen.png)

- Generates QR codes or Code 128 barcodes from one value or a whole batch (Ctrl/Cmd+Enter to generate).
- Splits input by newline, comma, semicolon, tab, or a custom separator, renders large batches through a virtualized list, and offers full-size preview navigation.
- Decodes codes back from PNG, JPG, JPEG, GIF, BMP, and WebP files — picked, dragged into the window, or pasted from the clipboard (Ctrl/Cmd+V) — up to 50 images at a time, with copy and open-link actions on the results.

### Performance

![Device performance workspace](docs/images/performance.png)

- Samples whole-device CPU, used and available memory, and battery level, status, and temperature once per second.
- Draws CPU and memory history as charts with a hover readout, and keeps up to 30 minutes of samples.
- Ranks processes by CPU or RSS, and marks processes that appeared during the session.
- Can pause on demand, or keep sampling in the background while you work in another workspace.

### Desktop experience

![Tools workspace in dark theme](docs/images/dark-theme.png)

- System, light, and dark themes.
- Native file dialogs, plus reveal-in-file-manager and open-with-default-app actions for everything the app writes.
- Signed in-app update checks against GitHub releases.

## Keyboard shortcuts

| Shortcut | Action |
| --- | --- |
| `Ctrl/Cmd + J` | Show or hide the Logcat panel for the current workspace |
| `Ctrl/Cmd + F` | Open the Logcat panel and focus the query field |
| `Ctrl/Cmd + Enter` | Generate codes in the Codegen workspace |
| `Ctrl/Cmd + V` | Decode the image on the clipboard in the Decoder workspace |

## Platform support

| Platform | Release architecture | ADB runtime |
| --- | --- | --- |
| macOS | Apple Silicon and Intel | Bundled, SDK, or `PATH` |
| Windows | x64 | Bundled, SDK, or `PATH`; background ADB commands do not open console windows |
| Linux | x64 | Bundled, SDK, or `PATH` |

Every release tag is packaged by GitHub Actions on native macOS, Windows, and Linux runners.

## Getting started

1. Download the package for your platform from [GitHub Releases](https://github.com/zechuan-start/adb-gui/releases/latest).
2. Enable Developer options and USB debugging on the Android device.
3. Connect the device and approve the computer's debugging fingerprint when Android prompts you.
4. Open ADB GUI and select the device in the top bar. A separate Platform Tools installation is optional because ADB is bundled.

For Wi-Fi debugging, connect over USB first and use the Wi-Fi action in the top bar, or enter an already reachable `ip:port` endpoint.

## Where files land

| Output | Default location |
| --- | --- |
| Screenshots and screen recordings | `Pictures/ADB GUI/` |
| Quick reports and full bugreports | `Documents/ADB GUI/reports/` |
| Exported Logcat files | `Documents/ADB GUI/logs/` |
| Downloaded device files | The location you pick in the save dialog |

## Development

Prerequisites: [Node.js](https://nodejs.org/), [pnpm](https://pnpm.io/), [Rust](https://www.rust-lang.org/tools/install), and the platform-specific [Tauri prerequisites](https://tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm test        # vitest
pnpm tauri dev   # run the desktop app
```

Main stack:

- **Desktop**: Tauri 2, Rust, Tokio
- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand
- **Device bridge**: Android Debug Bridge, using the system or SDK binary when available and the bundled binary otherwise

Documentation screenshots are generated, not taken by hand:

```bash
pnpm screenshots
```

`scripts/screenshots/capture.mjs` starts the dev server, loads the real frontend in Chromium with the fake IPC layer in `scripts/screenshots/mock-tauri.js`, and rewrites the images in `docs/images/`. The mock data is deterministic, so re-running it only changes what actually changed in the UI. It needs Playwright and its Chromium build (`npm i -g playwright && npx playwright install chromium` if you do not already have them).

Recommended editor setup: [VS Code](https://code.visualstudio.com/) with the [Tauri extension](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) and [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## Packaging and releases

- Run the `Package` workflow manually to build downloadable workflow artifacts without publishing a release.
- Push a `v*` tag, such as `v0.1.8`, to create the release, build all platform targets, attach installers and updater artifacts, and publish only after every package job succeeds.
- Updater artifacts require `plugins.updater.pubkey` plus the `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` repository secrets.

## License

[MIT](LICENSE)
