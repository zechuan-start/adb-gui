# Directory Structure

> Rust (Tauri 2) backend layout in `src-tauri/`.

---

## Overview

Backend is a Tauri 2 desktop app written in Rust. All native logic lives under `src-tauri/src/`. The crate name is `adb_gui_lib`.

---

## Directory Layout

```
src-tauri/
├── Cargo.toml
├── build.rs
├── tauri.conf.json
├── capabilities/         # Tauri permission capabilities
│   └── default.json
├── icons/                # App icons (all platforms)
├── resources/            # Bundled resources (e.g. embedded adb)
└── src/
    ├── main.rs           # Entry point (calls lib::run)
    ├── lib.rs            # Tauri Builder setup, plugin registration, command handlers
    ├── adb.rs            # ADB binary resolution, version detection, path caching
    └── commands/         # Tauri command modules (one file per domain)
        ├── mod.rs        # pub mod declarations
        ├── device.rs     # Device listing, ADB info, activity detection + run_adb helpers
        ├── app.rs        # APK install, uninstall, launch, force-stop, clear-data
        ├── keys.rs       # Key event injection (back, home, etc.)
        ├── screenshot.rs # Screenshot capture via exec-out + save to disk
        └── logcat.rs     # Logcat streaming (reserved)
```

---

## Module Organization

- **`commands/`**: 每个业务域一个文件, 通过 `mod.rs` 统一 re-export.
- **`adb.rs`**: 共享的 ADB 路径解析和进程调用基础设施, 所有 command 模块通过 `crate::adb` 引用.
- **新增功能**: 在 `commands/` 下新建文件, 在 `mod.rs` 中添加 `pub mod`, 在 `lib.rs` 的 `generate_handler!` 宏中注册.
- **共享状态**: 通过 `AppState` struct + `app.manage()` 注入, 命令通过 `app.state::<AppState>()` 获取.

---

## Naming Conventions

- 文件名: `snake_case.rs`
- 模块名: `snake_case`
- Tauri command 函数名: `snake_case` (前端以 `camelCase` 调用, Tauri 自动转换)
- Struct 和 Enum: `PascalCase`
- 常量: `SCREAMING_SNAKE_CASE`
