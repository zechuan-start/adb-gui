# Database Guidelines

> Not applicable.

---

## Overview

本项目是纯工具型桌面应用, 不使用数据库. 所有状态保持在内存中 (Zustand store + Rust AppState).

如果未来需要持久化配置, 优先考虑:
1. Tauri 的 `app.path().app_config_dir()` + JSON 文件
2. 如需结构化存储, 使用 SQLite via `tauri-plugin-sql`
