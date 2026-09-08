# 基建实施计划

## 阶段 1: 纯函数与词典骨架

1. 新建 `src/i18n/locale.ts` (常量, 类型, `isLocalePreference`, `resolveLocale`, `systemLanguages`).
2. 新建 `src/i18n/messages/zh-CN.ts` (骨架 + 语言行条目 + `errors.unknown`), `types.ts`, `messages/en.ts`, `messages/index.ts`.
3. 新建 `src/i18n/format.ts` (记忆化 Intl 工厂, 本阶段无调用方).
4. 新建 `src/i18n/errors.ts` (`AppErrorPayload`, `AppError`, `toAppError`, `translateError`).

验证: `pnpm build` 通过; 手工把 `en.ts` 删掉一个 key, 确认编译失败, 再还原.

## 阶段 2: 语言 store

5. 新建 `src/store/locale.ts`, 逐条对照 `store/theme.ts` 实现.
6. 新建 `src/i18n/index.ts` (`useT`, `useLocale`, `messages`).
7. 在 `main.tsx` 或 store 模块副作用中确保初始化时机早于首屏渲染 (theme 走的是模块副作用, 沿用同一方式).

验证: 新增 `locale.test.ts` 与 `store/locale.test.ts` 并通过; 浏览器 devtools 里改 `localStorage.locale` 后刷新, 行为符合预期.

## 阶段 3: 设置面板语言行

8. `SettingsRowMeta` 的 `label` / `description` 改为取值函数, 同步改 `SETTINGS_SECTIONS` 全部现有条目 (这一步会碰所有分组的注册表, 但只改取值形式, 中文串逐字不变).
9. `SettingsSnapshot` 新增 `localePreference`, `defaultSettingsSnapshot()` 补默认值.
10. `general` 分组 rows 首位插入 `language` 行.
11. `GeneralSection.tsx` 新增语言 `SegmentedControl`, 不套 `SettingsFieldset`.
12. 调整 `SettingRow.tsx` 的 label/description 读取方式.

验证: `pnpm test` 通过 (需同步更新 `settingsSections.test.ts` 与 `ownership.test.tsx`); 手工在设置里切三档, 确认语言行自身文案与 `document.documentElement.lang` 跟随变化; 确认设置文件损坏时 (手工写坏 `adb-gui-settings`) 语言行仍可点.

## 阶段 4: 原生菜单同步

13. `src/lib/tauri.ts` 新增 `emitLocaleChanged`, 非 Tauri 环境静默跳过.
14. `applyLocale` 中调用.
15. `src-tauri/src/lib.rs`: 菜单标签双语常量, 启动时按系统语言选初始值, 监听 `locale-changed` 更新菜单项.

验证: `cargo check`; `pnpm tauri dev` 下切换语言, 菜单栏文字即时变化.

## 阶段 5: 收口

16. 跑完整验收清单 (见 [prd.md](./prd.md)).
17. 记录 `validation.md`.

## 风险与回滚

| 风险 | 应对 |
| --- | --- |
| 步骤 8 触及所有设置分组注册表, diff 较大 | 单独一个提交, 只改取值形式; review 时确认中文串未变 |
| 菜单事件在非 Tauri 环境报错 | `isTauri()` 守卫, 截图脚本与 vitest 环境都走这条路径 |
| store 初始化时机晚于首屏, 出现语言闪烁 | 沿用 theme 的模块级副作用, 与主题同一时机 |

回滚点: 阶段 3 结束即为可交付状态 (语言可切, 其余文案仍中文). 阶段 4 失败可单独回滚, 不影响前端双语能力.

## 继续实现前需要确认

- Rust 侧取系统语言是否引入 `sys-locale` 依赖. 若不希望增加依赖, 采用"初始英文 + 前端就绪后覆盖"的退路, 接受启动瞬间的菜单文字闪烁.
