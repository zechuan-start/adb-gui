# Logging Guidelines

> Minimal logging for desktop app.

---

## Overview

依赖 `log` crate, 但当前未配置 subscriber (Tauri 默认输出到 stderr). 桌面应用日志需求很低, 主要用 `eprintln!` 记录非关键错误.

---

## 当前模式

- **错误但不致命**: `eprintln!("failed to ...: {err}")` — 如截图后打开文件失败.
- Propagate fatal failures through `Result<T, AppError>` for frontend rendering. Use [Error Handling](./error-handling.md) for structured IPC; reserve `Display` for diagnostic logs.
- **调试**: 开发时直接 `println!` 或 `dbg!`, 提交前移除.

---

## 规则

- 不引入额外的日志框架 (如 env_logger, tracing) 除非有明确需求.
- 不记录用户路径、设备序列号等到持久化日志文件中.
- 前端: 使用 `console.error` 记录异常, `console.log` 仅用于开发调试.
