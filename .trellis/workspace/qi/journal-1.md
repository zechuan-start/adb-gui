# Journal - qi (Part 1)

> AI development session journal
> Started: 2026-06-26

---

## 2026-06-28 Session

### 完成项

1. **项目状态审查** — 确认 P0 功能代码完成度 ~95%, 所有核心前后端逻辑已落地.
2. **Git 初始化 + GitHub 推送** — 仓库: https://github.com/zechuan-start/adb-gui (public, main 分支).
3. **安全检查** — 确认无敏感信息被推送 (无 API key, token, secret, .env 文件).
4. **主题切换功能** — 实现亮色/暗色模式:
   - `src/index.css`: 亮色主题为默认, `.dark` class 覆盖暗色色板.
   - `src/store/theme.ts`: zustand store, 支持 light/dark/system, localStorage 持久化.
   - `src/App.tsx`: 顶栏加入 Sun/Moon 切换按钮.

### 待办

- 构建验证 (`pnpm build` / `pnpm tauri build`).
- UpdateChecker 配置真实 updater endpoint.
- 真机冒烟测试.



## Session 1: Complete P1 debug tools

**Date**: 2026-07-03
**Task**: Complete P1 debug tools
**Branch**: `main`

### Summary

Implemented and verified port forwarding, screen recording, and bug report collection. Archived the P1 debug tools task group without committing.

### Main Changes

- Added port forwarding management for `adb forward` / `adb reverse`.
- Added device screen recording with start/stop/status, local pull, and remote cleanup.
- Added bug report collection with quick evidence directories and full bugreport zip generation.
- Updated backend quality specs and archived the completed P1 debug tools task group.

### Git Commits

(No commits - planning session)

### Testing

- [OK] `cargo check --manifest-path src-tauri/Cargo.toml`
- [OK] `cargo test --manifest-path src-tauri/Cargo.toml`
- [OK] `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`
- [OK] `npm run build`
- [OK] `git diff --check`
- [OK] True-device smoke on `z5rc4hobfelv9tvc` for port forwarding, screen recording, quick bug report, and full bugreport zip.

### Status

[OK] **Completed**

### Next Steps

- None - task complete

## 2026-07-08 Session

### 完成项

1. **Updater 接入** — `lib.rs` 注册 `tauri_plugin_updater`，`capabilities/default.json` 添加 `updater:default`，更新 `tauri.conf.json` 公钥。
2. **签名密钥** — 生成新 keypair，写入 GitHub Secrets（`zechuan-start/adb-gui`）。本地配置见 `.local/setup.md`（gitignored）。
3. **内置 adb** — 打包 macOS / Linux / Windows platform-tools 到 `src-tauri/resources/`，新增 `scripts/fetch-platform-tools.sh` 刷新脚本。
4. **Linux 运行时** — 内置 adb 自动设置 `LD_LIBRARY_PATH`；所有 adb 调用统一走 `prepare_command` / `prepare_async_command`。

### 验证

- [OK] `cargo test` / `cargo clippy -D warnings`
- [OK] `pnpm tauri build`（带签名密钥，生成 `.tar.gz.sig`）

### 待办

- ~~发布 GitHub Release（当前 v0.1.0 仍为 Draft）~~ → 已于 2026-07-08 发布 v0.1.0 正式版



## Session 2: 新增 APK 推送到设备功能

**Date**: 2026-07-20
**Task**: 新增 APK 推送到设备功能
**Branch**: `main`

### Summary

新增 APK 安装/推送模式, 支持将单个 APK 原样推送到当前设备下载目录且不触发安装.

### Main Changes

- APK 卡片新增安装/推送模式, 默认保持安装模式.
- 新增设备作用域的 `push_apk` command, 固定推送至 `/sdcard/Download/<原文件名>`.
- 完成前端构建、Rust 单测、Clippy、浏览器 UI 冒烟和真实设备推送验证.


### Git Commits

| Hash | Message |
|------|---------|
| `e26d32c` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 3: 新增二维码和条形码生成

**Date**: 2026-07-20
**Task**: 新增二维码和条形码生成
**Branch**: `main`

### Summary

新增独立生码页签, 支持二维码和 Code 128 批量生成、自定义分隔符、虚拟滚动懒生成及键盘预览; 完成前后端测试、Tauri release 构建和扫码识别验证, 版本提升至 0.1.1.

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `1b15e60` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete


## Session 4: Logcat 时间戳与列布局优化

**Date**: 2026-07-26
**Task**: Logcat 时间戳与列布局优化
**Branch**: `main`

### Summary

流式 logcat 从 -v brief 切换到 -v threadtime：新增设备端时间戳列（悬停看完整日期时间），LogcatLine 增加 time/tid 字段并同步 TS 接口；解析正则改为 LazyLock 一次编译，补 6 个解析回归单测；tag 列 56px 加宽到 160px，点击 tag 精确过滤（工具栏 chip 可清除，与等级/搜索/应用过滤叠加）；导出文件自动带时间戳。流式 logcat 格式契约已写入 backend/quality-guidelines.md。搜索增强、行展开复制、跟随 UX 三组改进未做。

### Main Changes

(Add details)

### Git Commits

| Hash | Message |
|------|---------|
| `9e11e8c` | (see git log) |
| `576699a` | (see git log) |

### Testing

- [OK] (Add test results)

### Status

[OK] **Completed**

### Next Steps

- None - task complete
