# Quality Guidelines

> Rust backend quality standards.

---

## Overview

工具链: Rust stable, `cargo clippy`, `cargo fmt`. 构建: `cargo tauri build`.

---

## Forbidden Patterns

- `unwrap()` on fallible operations (除 Mutex lock).
- `panic!` in command handlers.
- 硬编码路径分隔符 (使用 `PathBuf::join`).
- 阻塞 main thread 的长时间操作 (使用 `tauri::async_runtime::spawn`).

---

## Required Patterns

- 所有 `#[tauri::command]` 函数返回 `Result<T, String>`.
- ADB 调用统一通过 `run_adb` / `run_adb_with_serial` helper.
- 跨平台兼容: 使用 `cfg!(target_os = "...")` 处理平台差异.
- 新 command 必须在 `lib.rs` 的 `generate_handler!` 中注册.

---

## Testing Requirements

当前无单元测试. 验证方式:
1. `cargo clippy --all-targets` 无 warning
2. `cargo build` 成功
3. `pnpm tauri dev` 手动验证功能

---

## Code Review Checklist

- command 是否正确返回 Result 而非 panic
- ADB 命令参数是否安全 (不拼接用户输入为 shell 命令)
- 跨平台: Windows/macOS/Linux 路径和进程处理是否兼容
- 新增依赖是否必要, 是否指定了版本
