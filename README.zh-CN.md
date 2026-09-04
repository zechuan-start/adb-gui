# ADB GUI

[English](README.md) | **简体中文**

面向日常 `adb` 工作的跨平台桌面工作台: 统一的设备上下文, 六个各司其职的工作区, 以及一个跟着你走的 Logcat 面板.

[![最新版本](https://img.shields.io/github/v/release/zechuan-start/adb-gui?label=release)](https://github.com/zechuan-start/adb-gui/releases/latest)
[![许可证](https://img.shields.io/github/license/zechuan-start/adb-gui)](LICENSE)
![支持平台](https://img.shields.io/badge/platform-macOS%20%7C%20Windows%20%7C%20Linux-blue)
![技术栈](https://img.shields.io/badge/built%20with-Tauri%202%20%2B%20React%2019-informational)

[下载最新版本](https://github.com/zechuan-start/adb-gui/releases/latest) · [查看全部版本](https://github.com/zechuan-start/adb-gui/releases)

![ADB GUI 工具工作区, 底部为日志面板](docs/images/workspace-tools.png)

> README 中的截图由真实界面加模拟设备数据自动生成, 生成方式见 [本地开发](#本地开发).

## 核心特点

- **统一设备上下文** — 同一台手机的 USB 和 Wi-Fi 通道会合并成一个条目, 所有工作区的每条命令都作用于顶栏选中的设备.
- **日志随处可用** — 日志面板停靠在任意工作区下方, 分工作区记住开合状态, 高度可拖拽, 需要看堆栈时可以铺满窗口.
- **本地完成操作** — 截图、录屏、日志、报告、APK 和传输文件只在电脑与设备之间流转, 不上传任何数据.
- **内置 ADB** — 优先使用 `PATH`、`ANDROID_HOME` 或 `ANDROID_SDK_ROOT` 中的 ADB, 找不到时回落到内置版本, 因此不强制单独安装 Platform Tools.

## 工作区

| # | 工作区 | 覆盖内容 |
| --- | --- | --- |
| 01 | 工具 | 截图、录屏、安装 APK、Deep Link、端口转发、快捷按键、当前应用、Bug 报告 |
| 02 | 应用 | 第三方应用列表, 含图标、版本、安装时间、APK 大小和常用操作 |
| 03 | 文件 | 设备文件浏览, 支持上传、下载、新建目录和图片预览 |
| 04 | 生码 | 批量生成二维码和 Code 128 条形码 |
| 05 | 解码 | 从图片文件、拖拽或剪贴板截图中反向解码 |
| 06 | 性能 | 实时 CPU、内存、电池和进程占用 |
| — | 日志 | 带查询语法的实时 Logcat 面板, 所有工作区共用 |

## 功能介绍

### 设备与连接

- 持续发现 USB 和网络设备, 显示在线、离线或未授权状态.
- 合并同一台物理设备的 USB 与 Wi-Fi 通道, 换线切换不会丢失当前上下文.
- 支持按 `ip:port` 连接或断开, 也可以把当前 USB 设备切换到 ADB Wi-Fi 模式.
- 顶栏显示 ADB 版本与来源; 设备信息条平铺厂商与型号、序列号、连接方式、Android 版本与 SDK、ABI、分辨率、密度、电量, 并用单独一行显示当前前台 Activity.

### 日志

![铺满窗口并应用了过滤查询的日志面板](docs/images/logcat.png)

- 实时查看 Logcat, 支持暂停与恢复、回到底部跟随、清屏、清空设备日志缓冲区, 以及导出当前过滤结果.
- 使用查询语法过滤: `tag:`、`message:`、`level:`、`package:`、`process:`、`is:crash` / `is:stacktrace`, 可用 `&`、`|`、`-` 和括号组合, 并支持正则与精确匹配修饰符和输入补全.
- 自动识别崩溃与堆栈并高亮, 可自动折叠长堆栈, 让一次崩溃在展开前只占一行.
- 视图可调: 显示哪些列、Soft-Wrap、宽行距, 以及铺满窗口模式.
- 面板按工作区记住开合状态, 隐藏时在侧栏显示未读条数.

### 应用

![应用工作区, 已选中一个应用](docs/images/apps.png)

- 显示第三方应用列表, 含真实图标、应用名、版本名与版本号、首次安装与最后更新时间、APK 大小.
- 支持按应用名或包名搜索, 并对选中应用执行启动、强制停止、清除数据、卸载.
- 图标与应用信息按设备缓存, 再次进入工作区时加载更快.

### 文件

![文件浏览器与图片预览](docs/images/files.png)

- 通过面包屑和绝对路径浏览设备目录.
- 支持新建目录、单文件或多文件上传, 以及下载到自选位置.
- 可直接预览 PNG、JPEG、WebP、GIF 图片.
- 下载先写入临时文件并校验后再替换目标, 上传时不会静默覆盖设备上的同名文件.

### 生码与解码

![批量生成二维码](docs/images/codegen.png)

- 根据单条或批量数据生成二维码和 Code 128 条形码 (Ctrl/Cmd+Enter 生成).
- 支持换行、逗号、分号、Tab 或自定义分隔符; 大批量结果使用虚拟列表渲染, 并支持全尺寸预览切换.
- 可从 PNG、JPG、JPEG、GIF、BMP、WebP 图片反向解码 — 选择文件、拖入窗口或从剪贴板粘贴 (Ctrl/Cmd+V), 单次最多 50 张, 结果支持复制和打开链接.

### 性能

![设备性能工作区](docs/images/performance.png)

- 每秒采集整机 CPU、已用与可用内存, 以及电池电量、状态和温度.
- 用带悬停读数的折线图展示 CPU 与内存历史, 最多保留约 30 分钟样本.
- 按 CPU 或 RSS 排序进程占用, 并标记采集期间新出现的进程.
- 支持随时暂停, 也可以在切换到其他工作区后继续后台采集.

### 桌面体验

![暗色主题下的工具工作区](docs/images/dark-theme.png)

- 跟随系统、亮色、暗色三种主题.
- 原生文件对话框, 应用写出的文件都支持"在文件管理器中显示"和"用默认程序打开".
- 基于 GitHub Release 的带签名应用内更新检查.

## 快捷键

| 快捷键 | 作用 |
| --- | --- |
| `Ctrl/Cmd + J` | 显示或隐藏当前工作区的日志面板 |
| `Ctrl/Cmd + F` | 打开日志面板并聚焦查询输入框 |
| `Ctrl/Cmd + Enter` | 在生码工作区生成结果 |
| `Ctrl/Cmd + V` | 在解码工作区解码剪贴板中的图片 |

## 平台支持

| 平台 | 发布架构 | ADB 运行方式 |
| --- | --- | --- |
| macOS | Apple Silicon 和 Intel | 内置、SDK 或 `PATH` |
| Windows | x64 | 内置、SDK 或 `PATH`; 后台 ADB 命令不会弹出终端窗口 |
| Linux | x64 | 内置、SDK 或 `PATH` |

每个正式版本标签都会由 GitHub Actions 在原生 macOS、Windows 和 Linux runner 上完成打包.

## 快速开始

1. 从 [GitHub Releases](https://github.com/zechuan-start/adb-gui/releases/latest) 下载对应平台的安装包.
2. 在 Android 设备上启用开发者选项和 USB 调试.
3. 连接设备, 并在 Android 弹窗中允许当前电脑的调试指纹.
4. 打开 ADB GUI, 从顶部选择设备. 应用已内置 ADB, 因此不强制要求单独安装 Platform Tools.

使用 Wi-Fi 调试时, 可以先通过 USB 连接并使用顶部的 Wi-Fi 操作, 也可以直接输入已经可访问的 `ip:port` 地址.

## 本地文件位置

| 内容 | 默认位置 |
| --- | --- |
| 截图和屏幕录制 | `Pictures/ADB GUI/` |
| 快速报告和完整 Bugreport | `Documents/ADB GUI/reports/` |
| 导出的 Logcat 日志 | `Documents/ADB GUI/logs/` |
| 从设备下载的文件 | 保存对话框中选择的位置 |

## 本地开发

前置依赖: [Node.js](https://nodejs.org/)、[pnpm](https://pnpm.io/)、[Rust](https://www.rust-lang.org/tools/install), 以及对应平台的 [Tauri 环境依赖](https://tauri.app/start/prerequisites/).

```bash
pnpm install
pnpm test        # vitest
pnpm tauri dev   # 启动桌面应用
```

主要技术栈:

- **桌面端**: Tauri 2、Rust、Tokio
- **前端**: React 19、TypeScript、Vite、Tailwind CSS、Zustand
- **设备桥接**: Android Debug Bridge, 优先使用系统或 SDK 中的 ADB, 否则使用应用内置版本

文档截图由脚本生成, 不需要手动截屏:

```bash
pnpm screenshots
```

`scripts/screenshots/capture.mjs` 会启动开发服务器, 在 Chromium 中加载真实前端, 并注入 `scripts/screenshots/mock-tauri.js` 提供的模拟 IPC 数据, 然后重新生成 `docs/images/` 下的图片. 模拟数据是确定性的, 所以重跑只会反映界面本身的变化. 该脚本依赖 Playwright 及其 Chromium (未安装时执行 `npm i -g playwright && npx playwright install chromium`).

推荐使用 [VS Code](https://code.visualstudio.com/), 并安装 [Tauri 扩展](https://marketplace.visualstudio.com/items?itemName=tauri-apps.tauri-vscode) 和 [rust-analyzer](https://marketplace.visualstudio.com/items?itemName=rust-lang.rust-analyzer).

## 打包与发布

- 手动运行 `Package` workflow 可以构建供下载的 workflow artifacts, 但不会发布正式版本.
- 推送形如 `v0.1.8` 的 `v*` 标签后, CI 会创建 Release, 构建全部平台目标, 上传安装包与更新产物, 并且只在全部打包任务成功后正式发布.
- 自动更新产物需要配置 `plugins.updater.pubkey`, 以及仓库 Secrets `TAURI_SIGNING_PRIVATE_KEY` 和 `TAURI_SIGNING_PRIVATE_KEY_PASSWORD`.

## 许可证

[MIT](LICENSE)
