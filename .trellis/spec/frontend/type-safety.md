# Type Safety

> TypeScript strict mode conventions.

---

## Overview

TypeScript `strict: true` + `noUnusedLocals` + `noUnusedParameters`. 编译目标 ES2020.

---

## Type Organization

- **Tauri bridge 类型** 定义在 `lib/tauri.ts` 中 (如 `DeviceInfo`, `AdbInfo`, `ScreenshotResult`), 与 Rust 端 struct 一一对应.
- **Store 接口** 定义在各 store 文件中 (如 `DeviceStore`, `FeedbackStore`).
- **组件 Props** 定义在组件文件内部, 就近声明.
- **共享类型**: 用 `export interface` / `export type` 从定义文件导出.

---

## Validation

不使用 Zod 等运行时验证库. Tauri `invoke` 返回值通过 TypeScript 泛型声明类型:

```typescript
export async function listDevices(): Promise<DeviceInfo[]> {
  return invoke<DeviceInfo[]>("list_devices");
}
```

信任 Rust 端序列化的数据结构, 无前端 runtime validation.

---

## Common Patterns

- `type` 用于联合类型和字面量类型 (如 `type TabId = "tools" | "logcat" | "apps"`)
- `interface` 用于对象形状 (store, props, API response)
- 使用 `import type` 进行只类型导入

---

## Forbidden Patterns

- `any` — 禁止使用; 用 `unknown` + 类型守卫替代.
- `as` 类型断言 — 极少使用, 需有明确理由.
- `// @ts-ignore` — 禁止; 用 `// @ts-expect-error` + 注释说明原因.
- Non-null assertion `!` — 尽量避免, 优先用可选链 `?.` 和 nullish coalescing `??`.
