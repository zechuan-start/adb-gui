# 双语架构设计

## 产品形态与设计原则

桌面工具 app 的语言切换要像换主题一样: 点一下就变, 不重启, 不打断正在跑的活. 因此:

1. 语言是外壳级偏好, 与 `theme` 同级, 不属于任何设置分组.
2. 词典是编译期资产, 不是运行时资源. 打包进 bundle, 不做异步加载, 不做 key 字符串查表.
3. 错误文案跟其他文案走同一条路. 后端只产出错误码, 翻译一律在前端渲染时发生.
4. 不做运行时回落. 缺词条是编译错误, 不是"显示 key 名"或"显示另一种语言".

明确拒绝的做法:

- 拒绝 `t("settings.general.startupPane")` 这种字符串 key. 打错字只有运行时才知道, 与项目现有的类型优先风格 (`SettingsPreferences`, `LOGCAT_COLUMNS`) 不一致.
- 拒绝把语言存进 `adb-gui-settings`. 设置解码失败时那条错误提示自己就需要语言.
- 拒绝 Rust 侧维护两套文案. 唯一例外是原生菜单, 理由见"跨层职责".

## 目录与模块

```
src/i18n/
  locale.ts        // 纯函数: 语言标签解析, 存储 key. 无副作用, 可直接单测
  messages/
    zh-CN.ts       // 基准词典, 唯一的中文来源
    en.ts          // const en: Messages = {...}, 类型强制同构
    index.ts       // CATALOGS: Record<Locale, Messages>
  format.ts        // 按语言缓存 Intl.NumberFormat / DateTimeFormat / Collator
  errors.ts        // AppError 类, 错误码到词条的映射入口
  index.ts         // useT(), messages(), useLocale() 等对外入口
src/store/locale.ts // zustand store, 形状对齐 store/theme.ts
```

## 语言 store

```ts
export type LocalePreference = "system" | "zh-CN" | "en";
export type Locale = "zh-CN" | "en";
```

- 存储 key `"locale"`, 与 `"theme"` 并列. 读写失败静默降级为内存态, 与 theme 的处理一致.
- 存储值非法时按 `system` 处理并覆写回存储, 与 `readTheme` 的行为一致.
- 模块初始化即解析并 `applyLocale`: 写 `document.documentElement.lang`.
- 监听 `window.addEventListener("languagechange")`, 偏好为 `system` 时重新解析. 导出 `disposeLocaleListener` 供 `import.meta.hot` 使用, 与 theme 一致.
- store 暴露 `preference`, `locale` (解析结果), `messages` (当前词典对象), `setPreference`.

解析函数保持纯净, 便于表驱动测试:

```ts
export function resolveLocale(
  preference: LocalePreference,
  languages: readonly string[],
): Locale
```

规则: 非 `system` 直接返回; 否则取 `languages` 首个非空标签, 小写后按 `-` 切分, 首段为 `zh` 返回 `"zh-CN"`, 其余返回 `"en"`; 列表为空返回 `"en"`.

调用侧传入 `navigator.languages ?? [navigator.language]`, 浏览器缺失时传 `[]`.

## 词典形状

`zh-CN.ts` 是基准, 按模块分命名空间: `common`, `shell`, `settings`, `logcat`, `files`, `apps`, `codegen`, `decoder`, `performance`, `tools`, `errors`.

叶子有两种形态:

- 静态文案: `string`.
- 带参文案: 具名参数的函数, 例如
  `sizeMismatch: (p: { remote: number; local: number }) => \`下载文件大小不一致: 设备端 ${p.remote} 字节, 本地 ${p.local} 字节\``

选函数而不是 `{name}` 占位符模板, 是对既定"自研 typed catalog"方案的一处细化: 参数名, 参数个数与类型全部由 TypeScript 检查, 英文词典少传一个参数就是编译错误; 而占位符模板要么放弃类型检查, 要么额外写模板解析器和类型体操. 运行时也少一次字符串扫描.

同构靠类型强制:

```ts
// types.ts
export type Messages = typeof zhCN;
// en.ts
const en: Messages = { ... };
```

缺 key, 多 key, 字符串写成函数, 参数类型不符, 全部编译期报错. 因此运行时不需要任何 fallback 分支.

## 消费方式

React 组件:

```tsx
const t = useT();          // 订阅 store, 语言变化触发重渲染
<span>{t.settings.general.startupPane}</span>
<button aria-label={t.common.close} />
```

`useT()` 直接返回词典对象, 属性访问即用. 有 IDE 补全, 无字符串 key.

非 React 代码 (store, lib 内抛错, 原生对话框参数):

```ts
import { messages } from "@/i18n";
throw new AppError("settings.invalidFormat");
await confirm(messages().tools.recording.discardBody(serial, remotePath), { ... });
```

`messages()` 从 store 的 `getState()` 取当前词典. 对话框参数在调用瞬间求值, 这没有问题, 因为对话框本身就是瞬时的.

## 错误的跨层契约

这是本任务唯一真正的跨层设计, 前后端共用一个形状.

```ts
export interface AppErrorPayload {
  code: string;                                  // 词典 errors 下的稳定键
  params?: Record<string, string | number>;      // 用于插值的结构化参数
  detail?: string;                               // adb/OS 原始输出, 不翻译, 原样展示
}
```

Rust 侧命令签名从 `Result<T, String>` 改为 `Result<T, AppError>`, `AppError` 用 serde 序列化成上面的形状. `detail` 承载 adb stderr, `io::Error` 文本这类必须保留的诊断信息, 前端拼在译文之后, 不试图翻译.

前端 `lib/tauri.ts` 加一层归一化 `toAppError(unknown): AppErrorPayload`: 拿到符合形状的对象直接用; 拿到裸字符串或未知异常, 归到 `errors.unknown` 并把原文放进 `detail`. 这一层保证即使某个命令漏改, 界面也不会崩, 只是提示退化.

翻译发生在渲染时, 不在抛出时. 因此:

- `store/feedback.ts` 的 toast 从存 `message: string` 改为存 `AppErrorPayload` 或已翻译的静态文案二选一的联合类型, 由 `ToastBar` 渲染时翻译.
- `ScreenRecordStatus.error`, 设置读取失败的 banner 这类会长期停留的状态, 一律存错误码, 不存译文. 语言切换后它们跟着变.

## 本地化格式

`format.ts` 按语言缓存 Intl 实例 (Intl 构造开销大, 每次渲染新建会掉帧):

```ts
export function numbers(locale: Locale): Intl.NumberFormat
export function dateTime(locale: Locale): Intl.DateTimeFormat
export function timeOfDay(locale: Locale): Intl.DateTimeFormat
export function appNameCollator(locale: Locale): Intl.Collator
```

替换现有 4 处硬编码 `"zh-CN"`. 其中 `appInfo.ts` 的 collator 现为模块级常量, 改为按语言取, 排序函数接收 collator 作为参数; 语言变化时列表要重新排序, 由订阅 store 的组件重渲染驱动.

`deviceFiles.ts` 的 `KiB/MiB/GiB` 单位是国际通用写法, 两种语言都不改.

## 跨层职责

| 层 | 职责 | 不做 |
| --- | --- | --- |
| Rust 命令 | 产出错误码与结构化参数, 保留原始 detail | 不拼接面向用户的完整句子, 不接收 locale 参数 |
| Rust 菜单 | 唯一的 Rust 侧文案例外, 见下 | 不维护其他任何界面文案 |
| `lib/tauri.ts` | 归一化错误, 传原生对话框文案参数 | 不在这里翻译业务文案 |
| store | 存结构化状态与错误码 | 不存译文 |
| 组件 | 渲染时翻译, 拼接 detail | 不硬编码任何字面文案 |

原生菜单例外: `src-tauri/src/lib.rs:66` 的 `"设置…"` 在 app 启动时建菜单, 早于 WebView 可用, Rust 也读不到 localStorage 里的用户偏好. 处理方式: Rust 启动时按系统语言用同一条规则选一个初始标签; 前端解析出生效语言后 (以及每次切换后) 发一个 `locale-changed` 事件, Rust 收到后更新菜单项文本. Rust 侧只需保存两条字符串, 不引入 Rust i18n 库.

## 设置面板中的语言行

放在"通用"分组, 位置在主题之上 (语言决定其他所有行怎么读, 排第一符合阅读顺序).

- 控件: 与主题一致的 `SegmentedControl`, 三档 `跟随系统 / 简体中文 / English`.
- 中文与英文两档的标签始终用各自语言书写 (`简体中文`, `English`), 不随界面语言翻译 —— 这是语言选择器的通行做法, 避免用户在看不懂的语言里找不到自己的语言.
- "跟随系统"这一档随界面语言翻译.
- 描述文案: 说明当前系统解析结果, 例如"跟随系统时使用英文".
- `modified` 判定: `preference !== "system"`.
- 不进入任何分组的 `SectionResetPlan`. "恢复默认设置"不改语言, 与 theme 的处理保持一致 —— 注意 theme 目前在 `general` 的 reset 计划里 `resetTheme: true`, 语言不跟随这条, 需要在 PRD 验收里单独确认.

## 状态覆盖 (语言设置行)

| 状态 | 表现 |
| --- | --- |
| 默认 | 三档中当前偏好高亮, 未选定时高亮"跟随系统" |
| 加载 | 无异步, 无加载态 |
| 禁用 | 无. 语言存储独立于 `adb-gui-settings`, 设置文件不可用时语言行仍可操作, 不套 `SettingsFieldset` |
| 成功 | 切换后整个界面即时变化, 不弹 toast |
| 失败 | localStorage 写入失败时沿用 theme 的静默降级: 本次会话生效, 重启回退 |
| 边界 | 系统语言在运行中变化且偏好为"跟随系统"时, 界面即时跟随 |

## 实现约束

- 禁止在组件里写任何中文或英文字面量作为可见文案, 包括 `aria-label`, `title`, `placeholder`, 原生对话框参数.
- 禁止用 `locale === "zh-CN" ? "中文" : "English"` 这类内联三元代替词典.
- 禁止为英文单独改布局体系; 只允许对确实溢出的具体元素加 `truncate` / `min-w-0` / 调整固定宽度.
- 词典文件只放文案, 不放业务逻辑, 不 import store.
- 迁移中禁止顺手改文案措辞. 中文词条必须与迁移前逐字一致, 这样 diff 可核对, 测试也能一次性改成引用词典. 措辞优化留到后续任务.

## 防回归守卫

新增测试扫描 `src/**` 非测试文件, 除 `src/i18n/messages/zh-CN.ts` 外出现 CJK 字符即失败; 同时校验 `en.ts` 不含 CJK 字符. 这条守卫是本任务能长期成立的关键: 没有它, 下一个功能就会重新写死中文.

例外清单显式列出, 目前预期为空 (代码注释里的中文不在扫描范围, 只扫字符串字面量与 JSX 文本).
