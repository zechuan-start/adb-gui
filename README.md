# ADB GUI

**English** | [简体中文](#简体中文)

A cross-platform desktop GUI for Android ADB, built with [Tauri](https://tauri.app/) + React + TypeScript. It wraps common `adb` workflows into a fast, native-feeling app for macOS, Windows, and Linux.

## Features

- **Device management** — auto-discovers USB and Wi-Fi devices, shows online/offline status, and lets you switch between connected devices instantly.
- **Wi-Fi connect** — pair and connect to a device over `adb connect` without cables.
- **Screenshot** — capture the current screen with one click and save it locally.
- **Screen recording** — start/stop `screenrecord` sessions and pull the resulting video to your computer.
- **APK install** — drag-and-drop or pick an APK file to install onto the selected device.
- **App / package manager** — list installed packages, launch, force-stop, clear data, or uninstall apps.
- **Deep link launcher** — open a custom deep link / URI on the device for quick testing.
- **Port forwarding** — manage `adb forward` / `adb reverse` rules with a simple UI.
- **Bug report collection** — trigger `adb bugreport` and save the report archive locally.
- **Logcat viewer** — live-tail, filter, and search device logs with virtualized rendering for large output.
- **Quick keys** — send common key events (Home, Back, Power, volume, etc.) without touching the device.
- **Current activity monitor** — see the foreground activity in real time and jump back to it.
- **Device info panel** — inspect model, Android version, resolution, and other device properties.
- **Light / dark theme** and **in-app update checker** (via `tauri-plugin-updater`).

## Tech Stack

- **Frontend**: React 19, TypeScript, Vite, Tailwind CSS, Zustand, lucide-react
- **Backend**: Rust, Tauri 2, Tokio
- **Native integration**: shells out to the Android `adb` binary (bundled or system PATH)

## Getting Started

Prerequisites: [Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/), [Rust](https://www.rust-lang.org/tools/install), and platform-specific [Tauri prerequisites](https://tauri.app/start/prerequisites/). Android `adb` should be available on your `PATH` (or installed via Android SDK Platform Tools).

```bash
pnpm install
pnpm tauri dev
```

## Recommended IDE Setup

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## GitHub Packaging

- Manual package: run the `Package` workflow from GitHub Actions to build macOS, Windows, and Linux installers as workflow artifacts.
- Release package: push a `v*` tag, for example `v0.1.0`, to create a draft GitHub Release with installer assets and `latest.json`.
- Updater signing: set `plugins.updater.pubkey` in `src-tauri/tauri.conf.json`, then configure `TAURI_SIGNING_PRIVATE_KEY` and `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` in GitHub repository secrets before publishing signed updater artifacts.

---

## 简体中文

[English](#adb-gui) | **简体中文**

一款基于 [Tauri](https://tauri.app/) + React + TypeScript 打造的跨平台 Android ADB 桌面 GUI 工具,把常用的 `adb` 操作封装成一个原生体验、启动快速的桌面应用,支持 macOS、Windows、Linux。

## 功能特性

- **设备管理** — 自动发现 USB 与无线连接的设备,实时显示在线/离线状态,一键切换当前操作设备。
- **无线连接(Wi-Fi Connect)** — 无需数据线,通过 `adb connect` 配对并连接设备。
- **截图** — 一键截取设备当前屏幕并保存到本地。
- **屏幕录制** — 启动/停止 `screenrecord` 录屏,并将视频文件拉取到电脑本地。
- **APK 安装** — 拖拽或选择 APK 文件即可安装到当前选中设备。
- **应用 / 包管理** — 查看已安装应用列表,支持启动、强制停止、清除数据、卸载等操作。
- **DeepLink 启动器** — 快速在设备上打开自定义 DeepLink / URI,方便调试跳转。
- **端口转发(Port Forward)** — 图形化管理 `adb forward` / `adb reverse` 规则。
- **Bug 报告收集** — 一键触发 `adb bugreport` 并保存报告压缩包到本地。
- **Logcat 日志查看** — 实时滚动、过滤、搜索设备日志,大数据量下采用虚拟列表渲染保证流畅。
- **快捷按键** — 一键发送 Home、返回、电源、音量等常用按键事件。
- **当前 Activity 监控** — 实时查看前台 Activity,方便快速定位当前页面。
- **设备信息面板** — 查看设备型号、Android 版本、分辨率等详细信息。
- **明暗主题切换**,以及基于 `tauri-plugin-updater` 的**应用内自动更新检测**。

## 技术栈

- **前端**: React 19、TypeScript、Vite、Tailwind CSS、Zustand、lucide-react
- **后端**: Rust、Tauri 2、Tokio
- **原生集成**: 通过调用系统或内置的 Android `adb` 可执行文件实现设备交互

## 快速开始

前置依赖:[Node.js](https://nodejs.org/) + [pnpm](https://pnpm.io/)、[Rust](https://www.rust-lang.org/tools/install),以及对应平台的 [Tauri 环境依赖](https://tauri.app/start/prerequisites/)。请确保 `adb` 已在系统 `PATH` 中可用(可通过 Android SDK Platform Tools 安装)。

```bash
pnpm install
pnpm tauri dev
```

## 推荐 IDE 配置

- [VS Code](https://code.visualstudio.com/) + [Tauri](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) + [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer)

## GitHub 打包发布

- 手动打包:在 GitHub Actions 中运行 `Package` workflow,即可构建出 macOS、Windows、Linux 的安装包并作为 workflow 产物下载。
- 发布正式版:推送形如 `v0.1.0` 的 `v*` 标签,会自动创建带安装包资源和 `latest.json` 的 GitHub Release 草稿。
- 更新签名:在 `src-tauri/tauri.conf.json` 中设置 `plugins.updater.pubkey`,并在 GitHub 仓库 Secrets 中配置 `TAURI_SIGNING_PRIVATE_KEY` 与 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`,才能发布经过签名的自动更新产物。
