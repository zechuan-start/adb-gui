# Error Handling

> Tauri command error conventions.

---

## Overview

所有 Tauri command 返回 `Result<T, String>`. 错误通过 `String` 类型传递给前端, 前端通过 `try/catch` 捕获并展示给用户.

---

## Error Types

当前项目不使用自定义 error enum, 统一使用 `Result<T, String>`:

```rust
#[tauri::command]
pub fn some_command(app: AppHandle, serial: String) -> Result<String, String> {
    let output = run_adb_with_serial(&app, &serial, &["shell", "..."])
        .map_err(|e| format!("Failed to ...: {e}"))?;
    Ok(output)
}
```

---

## Error Handling Patterns

- **ADB 进程调用**: `.map_err(|e| format!("描述: {e}"))` 转换为可读 String.
- **文件 IO**: 同上, 使用 `.map_err(|e| e.to_string())` 或带上下文的 format.
- **状态解析失败**: 返回 `Ok(默认值)` (如空字符串), 不视为 hard error.
- **不使用 `unwrap()`**: 除非是不可能失败的情况 (如 Mutex lock).

---

## 前端错误展示

前端通过 `useFeedbackStore.showToast("error", msg)` 显示错误:

```typescript
try {
  await someCommand(serial);
  showToast("success", "操作成功");
} catch (error) {
  showToast("error", `操作失败: ${error}`);
}
```

---

## Common Mistakes

- 不要在 command 中 panic; 所有可能失败的路径都用 `?` 或 `map_err`.
- 不要吞掉 stderr 输出; ADB 命令失败时应将 stderr 内容返回给前端.
