# i18n 基建与语言设置项

父任务: [界面中英双语与语言设置](../09-08-i18n-bilingual/prd.md) · 架构: [design.md](../09-08-i18n-bilingual/design.md)

## 交付边界

搭好双语的地基, 并让用户在设置里真正看到语言开关. 本子任务结束时, 语言可切换, 首启按系统语言判定, 但绝大多数界面文案仍是中文 —— 这是有意为之的中间状态, 也是整个任务的回滚点.

## 范围内

- `src/i18n/` 模块: 解析函数, 词典骨架 (`zh-CN` + `en` 同构), 格式化工具, 错误契约类型与 `AppError` 类, `useT()` / `messages()` 入口.
- `src/store/locale.ts`: 语言 store, 形状对齐 `store/theme.ts`.
- 设置面板"通用"分组新增语言行 (含 `settingsSections.ts` 注册表条目).
- 只迁移本子任务自己需要的文案: 语言行的 label/description/三档标签. 其余文案不动.
- 原生菜单双语通路: 前端 `locale-changed` 事件 + Rust 侧菜单标签更新.
- `document.documentElement.lang` 运行时写入.

## 范围外

- 不迁移外壳, 设置其他行, 工作区的任何文案 (子任务 2/3).
- 不改任何 Rust 命令的错误返回 (子任务 4), 只改菜单.
- 不改 README 与截图 (子任务 5).

## 验收标准

- [ ] 清空 localStorage 后, 系统语言中文时语言行显示"跟随系统"且界面判定为中文; 系统语言英文时判定为英文.
- [ ] 系统语言 `zh-TW` / `zh-Hant` 判定为简体中文, 不是英文.
- [ ] 系统语言为法语/日语等判定为英文.
- [ ] 显式选择"简体中文"或"English"后, 系统语言变化不再影响界面; 改回"跟随系统"立即重新解析.
- [ ] 偏好为"跟随系统"时, 运行中触发 `languagechange` 界面即时跟随, 无需重启.
- [ ] 语言行的三档标签中, `简体中文` 与 `English` 始终以各自语言书写; "跟随系统"随界面语言变化.
- [ ] 语言行在 `adb-gui-settings` 损坏 (`available === false`) 时仍可操作.
- [ ] 执行"恢复默认设置"后语言偏好保持不变.
- [ ] 原生菜单项在两种语言下分别为 `设置…` / `Settings…`, 切换语言后即时更新.
- [ ] 英文界面下 `document.documentElement.lang === "en"`.
- [ ] `en.ts` 少写一个 key 或参数类型不符时 `pnpm build` 失败 (人工验证一次后还原).
- [ ] `pnpm test` 通过, 含 `resolveLocale` 的表驱动用例.
