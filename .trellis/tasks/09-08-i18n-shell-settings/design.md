# 框架与设置迁移设计

架构总纲见 [父任务 design.md](../09-08-i18n-bilingual/design.md). 本文只定迁移约定与本批的具体处理.

## 词典键命名约定 (全任务通用, 本子任务先立)

```
<模块>.<组件或区域>.<角色>
```

- 模块: `common` | `shell` | `settings` | `logcat` | `files` | `apps` | `codegen` | `decoder` | `performance` | `tools` | `errors`.
- 角色用途导向, 不描述内容: `label`, `description`, `placeholder`, `empty`, `confirm`, `cancel`, `ariaLabel`, `title`, `body`.
- 跨模块复用的短词 (`取消`, `确定`, `复制`, `刷新`, `关闭`, `重试`) 一律放 `common`, 不在各模块重复.
- 一个组件内的多条文案聚成一个子对象, 不平铺成长键名.

反例: `settings.themeFollowSystemLabel`. 正例: `settings.general.theme.system`.

## 选项常量的处理

`lib/settings.ts` 里 `SORT_DIRECTIONS` 等常量把 `value` 与 `label` 绑在一起, 且 `label` 参与了 `choice()` 的解码校验路径. 迁移原则:

- 常量只保留 `value` (解码校验只依赖 `value`, 与语言无关).
- 标签改为词典里以 `value` 为键的映射, 例如 `settings.files.sortBy.name`.
- 组件渲染时把 `value` 映射成当前语言标签.

这一步要特别小心 `decodeSettings`: 它用 `options.find(({ value }) => ...)` 校验, 去掉 `label` 后签名与行为都不变, 但类型定义需要同步收窄.

## 抛错文案的处理

`lib/settings.ts` 与 `store/settings.ts` 的抛错文案 (`设置格式无效`, `设置字段 ${key} 无效`, `无法读取设置: ${error}`, `设置未保存: ${error}`) 改用 `AppError`:

- `code` 落在 `errors.settings.*`.
- 原始 `error` 文本放 `detail`, 不翻译.
- `store/settings.ts` 的 `error` 字段类型从 `string | null` 改为 `AppErrorPayload | null`, 渲染时翻译. 这样设置损坏的横幅在语言切换后会跟着变.

`findSettingsSection` / `findSettingsRow` 抛的 `未知设置分组` 是开发期断言, 改为英文字面量并在守卫测试例外清单里说明, 不进词典.

## toast 的处理

`store/feedback.ts` 的 `ToastState.message: string` 改为:

```ts
export type ToastBody =
  | { kind: "text"; text: (m: Messages) => string }
  | { kind: "error"; payload: AppErrorPayload };
```

`ToastBar` 渲染时用 `useT()` 求值. 静态文案走 `text` 分支 (传取值函数而不是已翻译字符串, 保证语言切换后同步), 失败提示走 `error` 分支.

调用方从 `showToast("success", "已复制")` 变为 `showToast("success", (m) => m.common.copied)`.

## 设置搜索

`SettingsDialog` 的搜索目前对中文 label/description 做匹配. 迁移后匹配对象改为"当前语言下求值出来的 label/description", 因此搜索天然跟随语言. 需确认匹配前统一 `toLowerCase()`, 否则英文大小写会漏匹配.

## 原生对话框

`lib/tauri.ts` 里传给 `open` / `save` / `confirm` 的 `title`, `okLabel`, `cancelLabel`, 正文全部改为 `messages()` 求值. 这些调用是瞬时的, 求值时机没有问题.

注意 `confirmRestoreDefaults` 在非 Tauri 环境走 `globalThis.confirm`, 两条分支都要改.

## 测试改造

`StatusBanner.test.tsx`, `ownership.test.tsx`, `settingsSections.test.ts`, `controls.test.tsx`, `settings.test.ts`, `store/settings.test.ts` 里的中文字面量断言改为引用 `zhCN` 词典的同一条目:

```ts
import { zhCN } from "@/i18n/messages/zh-CN";
expect(html).toContain(zhCN.shell.status.unauthorized.title);
```

对带参词条, 断言调用结果. 这样后续改措辞不再破坏测试.

至少补一条英文渲染断言 (把 store 切到 `en` 后渲染 `StatusBanner`, 断言出现英文条目), 证明双语通路真的接上了.
