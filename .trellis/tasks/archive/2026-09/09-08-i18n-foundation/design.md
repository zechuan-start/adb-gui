# 基建设计

架构总纲见 [父任务 design.md](../09-08-i18n-bilingual/design.md). 这里只写本子任务落地的文件级细节.

## 新增文件

### `src/i18n/locale.ts`

纯函数与常量, 不 import store, 不碰 DOM, 可直接单测.

```ts
export const LOCALE_STORAGE_KEY = "locale";
export type LocalePreference = "system" | "zh-CN" | "en";
export type Locale = "zh-CN" | "en";

export function isLocalePreference(value: string | null): value is LocalePreference
export function resolveLocale(
  preference: LocalePreference,
  languages: readonly string[],
): Locale
export function systemLanguages(): readonly string[]  // navigator.languages ?? [navigator.language] ?? []
```

`resolveLocale` 规则: 非 `system` 直接返回; `system` 时取首个非空标签, `toLowerCase().split("-")[0] === "zh"` 返回 `"zh-CN"`, 其余返回 `"en"`; 空列表返回 `"en"`.

### `src/i18n/messages/zh-CN.ts`

基准词典. 本子任务只建骨架 + 语言行所需条目:

```ts
export const zhCN = {
  common: {},
  shell: {},
  settings: {
    general: {
      language: {
        label: "语言",
        description: "跟随系统时按系统语言选择, 非中文使用英文",
        system: "跟随系统",
      },
    },
  },
  logcat: {}, files: {}, apps: {}, codegen: {},
  decoder: {}, performance: {}, tools: {},
  errors: {
    unknown: (p: { detail: string }) => `操作失败: ${p.detail}`,
  },
} as const;
```

命名空间先建空对象占位, 让后续子任务只往里填, 不再动结构.

`简体中文` 与 `English` 两个档位标签不进词典 —— 它们在两种语言下写法相同, 作为 `LANGUAGE_OPTIONS` 常量与 `SegmentedControl` 一起放在组件侧.

### `src/i18n/messages/en.ts`

```ts
import type { Messages } from "../types";
export const en: Messages = { ... };
```

### `src/i18n/types.ts`

```ts
import { zhCN } from "./messages/zh-CN";
export type Messages = typeof zhCN;
```

### `src/i18n/format.ts`

按语言缓存 Intl 实例, 用 `Map<Locale, T>` 记忆化. 本子任务只建函数, 替换 4 处硬编码 `"zh-CN"` 的工作放在子任务 3 (它们都在工作区代码里).

### `src/i18n/errors.ts`

```ts
export interface AppErrorPayload {
  code: string;
  params?: Record<string, string | number>;
  detail?: string;
}
export class AppError extends Error { readonly payload: AppErrorPayload; ... }
export function toAppError(value: unknown): AppErrorPayload;
export function translateError(payload: AppErrorPayload, messages: Messages): string;
```

`translateError` 按 `code` 走 `messages.errors` 下的路径取词条; 词条是函数就传 `params`; 找不到就退到 `errors.unknown` 并把 `code` 与 `detail` 拼进去 (这条路径只在 Rust 漏改时触发, 不是常规回落).

### `src/store/locale.ts`

逐条对照 `store/theme.ts` 的结构: 读取 → 校验 → 应用 → create store → 注册系统监听 → 导出 dispose → HMR 处理. 差异只有两处: 系统信号从 `matchMedia` 换成 `window.addEventListener("languagechange")`; `applyLocale` 写 `document.documentElement.lang` 并向 Rust 发 `locale-changed`.

store 形状:

```ts
interface LocaleState {
  preference: LocalePreference;
  locale: Locale;
  messages: Messages;
  setPreference: (preference: LocalePreference) => void;
}
```

`messages` 存在 store 里而不是每次 `CATALOGS[locale]` 现取, 是为了让 `useT()` 的订阅粒度稳定, 引用相等可用于 memo.

### `src/i18n/index.ts`

```ts
export function useT(): Messages          // useLocaleStore((s) => s.messages)
export function useLocale(): Locale
export function messages(): Messages      // useLocaleStore.getState().messages
```

## 修改文件

| 文件 | 改动 |
| --- | --- |
| `src/lib/settingsSections.ts` | `general` 分组 rows 首位插入 `language` 行; label/description 改为从词典取 —— 注册表当前存的是字面量, 需要把 `label`/`description` 的类型从 `string` 改为"从 Messages 取值的函数", 见下 |
| `src/components/settings/sections/GeneralSection.tsx` | 主题行之上新增语言 `SegmentedControl` |
| `src/components/settings/SettingRow.tsx` | 读取注册表 label/description 的方式随之调整 |
| `src-tauri/src/lib.rs` | 菜单标签按系统语言初始化; 监听前端 `locale-changed` 更新菜单项文本 |
| `src-tauri/Cargo.toml`, `src-tauri/Cargo.lock` | 仅在 macOS target 下添加 `sys-locale = "0.3.2"`, 实现阶段生成 lockfile |
| `src/lib/tauri.ts` | 新增 `emitLocaleChanged(locale)` |

### 注册表的文案取值方式

`SETTINGS_SECTIONS` 是模块级常量, 求值早于任何 store, 不能在里面直接写 `messages().settings...`. 改为存取值函数:

```ts
export interface SettingsRowMeta {
  id: string;
  label: (m: Messages) => string;
  description?: (m: Messages) => string;
  modified?: (state: SettingsSnapshot, defaults: SettingsSnapshot) => boolean;
}
```

渲染侧 `const t = useT()` 后调用 `row.label(t)`. 这样注册表保持纯数据, 语言切换自动生效.

`findSettingsSection` / `findSettingsRow` 抛出的 `未知设置分组: ${id}` 是开发期断言, 不面向用户, 不进词典 (在守卫测试里列为例外, 或直接改成英文).

## 语言设置行的 modified 与 reset

- `modified: (state) => state.localePreference !== "system"`. 这要求 `SettingsSnapshot` 新增 `localePreference` 字段, 与 `theme` 同级.
- `defaultSettingsSnapshot()` 里 `localePreference: "system"`.
- `RESET_PLANS.general` **不** 增加 `resetLocale`. 语言不随"恢复默认设置"重置, 见父 PRD 共同要求.

## 原生菜单同步

- 2026-09-08 技术决策: 引入 `sys-locale = "0.3.2"`, 放入 `[target.'cfg(target_os = "macos")'.dependencies]`. 原生设置菜单及其语言同步沿用现有 macOS 条件编译边界. 依据见 [父任务调研](../09-08-i18n-bilingual/research.md).
- Rust 在 `macos_menu` 创建设置项时调用 `sys_locale::get_locales()`, 按偏好顺序取首个非空 BCP 47 标签. 忽略大小写比较主子标签, `zh` 使用 `设置…`, 其他标签使用 `Settings…`; 不继续向后寻找中文. 空列表或读取不到语言时使用英文, 遵循父 PRD 已有默认规则.
- 不采用固定英文启动, 不通过 shell 环境变量或新增 Tauri OS 插件读取语言. `sys-locale` 在 macOS 使用 `CFLocaleCopyPreferredLanguages`, 不需要本项目维护 CoreFoundation FFI.
- 前端语言 store 是 WebView 就绪后的唯一生效语言来源. Rust 不保存另一份用户偏好, 不轮询系统语言; 前端在 `applyLocale` 里 emit, 覆盖首启, 显式切换以及跟随系统时的 `languagechange`.
- 已保存的显式偏好可能不同于系统语言: WebView 就绪前菜单按系统初始化, 首次同步后改为已保存偏好. 本阶段不承诺此前菜单完全没有标签变化; 界面首屏仍须按已保存偏好渲染.
- 确保 Rust 监听注册早于前端首次发送. 事件载荷仅接受 `zh-CN` / `en`; 无效载荷不改菜单并记录诊断. 发送或 `set_text` 失败须可诊断, 不以静默忽略或无限重试掩盖同步失败.
- 非 Tauri 环境 (浏览器预览, 截图脚本) 下 emit 要静默跳过, 复用 `isTauri()` 判断.

## 测试

| 测试 | 内容 |
| --- | --- |
| `src/i18n/locale.test.ts` | `resolveLocale` 表驱动: `system`+`["zh-CN"]`, `["zh-TW"]`, `["zh"]`, `["en-US"]`, `["fr"]`, `["ja-JP"]`, `[]`, 以及显式偏好覆盖系统 |
| `src/store/locale.test.ts` | 存储非法值回落并覆写; 偏好为 system 时 `languagechange` 触发更新; 显式偏好时不受影响; 存储不可用时内存态仍生效 |
| `src/i18n/messages/catalog.test.ts` | `en` 词典不含 CJK 字符; 两份词典叶子路径集合相同 (类型已保证, 这里防结构漂移) |
| `src/components/settings/sections/ownership.test.tsx` | 补语言行在通用分组首位的断言 |
| macOS Rust 菜单测试 | 纯解析覆盖 `zh-CN` / `zh-TW` / `zh-Hant`, 大小写, 非中文首选后含中文, 空列表; 无效事件载荷不更新菜单 |
| macOS 原生冒烟 | 系统首选为中文和非中文时的菜单初值; 显式偏好与系统不同的冷启动; 切换及改回跟随系统后的菜单同步 |
