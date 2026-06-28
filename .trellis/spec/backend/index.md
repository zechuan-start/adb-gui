# Backend Development Guidelines

> Best practices for backend development in this project.

---

## Overview

Rust (Tauri 2) backend. ADB 调用封装, 命令模块化, Result 错误传播.

---

## Guidelines Index

| Guide | Description | Status |
|-------|-------------|--------|
| [Directory Structure](./directory-structure.md) | Tauri/Rust module layout | ✅ Done |
| [Database Guidelines](./database-guidelines.md) | N/A (no database) | ✅ Done |
| [Error Handling](./error-handling.md) | Result<T, String> patterns | ✅ Done |
| [Quality Guidelines](./quality-guidelines.md) | Clippy, forbidden patterns | ✅ Done |
| [Logging Guidelines](./logging-guidelines.md) | Minimal eprintln approach | ✅ Done |

---

## How to Fill These Guidelines

For each guideline file:

1. Document your project's **actual conventions** (not ideals)
2. Include **code examples** from your codebase
3. List **forbidden patterns** and why
4. Add **common mistakes** your team has made

The goal is to help AI assistants and new team members understand how YOUR project works.

---

**Language**: All documentation should be written in **English**.
