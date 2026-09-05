# 设置面板重构设计

## 分层与目标形态

保持"偏好数据在 store, 呈现在组件"的现有边界, 在中间补一层不含 React 的分组元数据, 让分派、重置范围、搜索和改动标记都变成可单测的纯函数.

~~~text
lib/settings.ts            schema/解码/默认值/迁移        无 React 无 store
lib/settingsSections.ts    分组元数据/重置计划/搜索/diff   无 React 无 store   (新增)
store/settings.ts          读写与错误态                    zustand
components/settings/       壳 + 六个分组组件 + 行原语       React
~~~

面板只做三件事: 从注册表取分组顺序与标签、按穷尽分支渲染对应分组组件、按重置计划执行复位. 不再持有任何分组特例.

## 分组注册表

新增 `src/lib/settingsSections.ts`, 只描述"有哪些分组、按什么顺序、复位时动谁", 不含 React, 不持有 store 闭包.

~~~ts
export interface SettingsSectionMeta {
  id: SettingsSection;
  label: string;
}

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[];
export function findSettingsSection(id: SettingsSection): SettingsSectionMeta;
~~~

- `SETTINGS_SECTIONS` 顺序即导航顺序: 通用 / 日志 / 截图与录屏 / 文件 / 应用 / 生码. "性能"并入"通用", 六组.
- 分派不用查表, 用对 `SettingsSection` 联合类型的穷尽 `switch` + `assertNever(section)` 收尾: 新增分组却忘了写分支时 TypeScript 直接编译失败, 比运行期报错更早也更可靠, 同时彻底移除 `SettingsDialog.tsx:269` 的兜底 `return`.
- `findSettingsSection` 供导航渲染取标签, 未知 id 抛错; 它面向的是编程错误, 不是用户输入.
- 阶段一不引入行级元数据. 行的标签与说明留在各分组组件里, 避免出现一份没有消费者、又会和组件分叉的平行清单. 搜索与"已改动"标记需要行级元数据, 到阶段二和它们一起引入.
- 图标同理属于阶段二的竖直导航, 阶段一的横向 tab 不需要.

## 存储归属与禁用范围

现有 `<fieldset disabled={!available}>` 一刀切禁用整块内容, 越界禁用了不属于设置存储的主题与日志工作区可见性.

- 移除内容区外层的整块 `fieldset`, 改由各分组组件自己把**设置存储拥有的那部分**包进 `<fieldset disabled={!available}>`; 不属于设置存储的行留在 fieldset 之外.
  - 通用: 主题行在外(theme 存储), 启动页面 / 启动时检查更新 / 切换页面时继续采集 在内.
  - 日志: 显示格式、显示列、三个开关在内; "显示日志的工作区"在外(`adb-gui-ui`).
  - 其余四组整体在内.
- 用 `fieldset[disabled]` 而不是给每个控件传 `disabled`: 原生行为会禁用全部后代表单控件, 改动面小且不会漏掉某一个控件.
- 归属只体现为禁用行为, **不在界面上加 owner 标签**; 需要解释时由错误横幅补一句"主题与日志面板可见性来自其他存储, 不受影响".
- 子组件 `SortPreferences` / `GeneratorPreferences` 已各自按 `available` 处理, 保持不变, 不叠加外层禁用.
- 底部"恢复本组默认"的可用性改为: 该分组的复位计划含 `resetTheme` 或 `resetLogPanes` 时始终可用(只复位可复位的部分), 否则沿用 `!available` 禁用.

## 重置计划

把"这一组重置要动哪些存储"从组件与 `resetSettingsSection` 的两处特例, 收敛成一个纯函数.

~~~ts
export interface SectionResetPlan {
  settingsKeys: readonly (keyof SettingsPreferences)[];
  resetTheme: boolean;
  resetLogPanes: boolean;
}

export function sectionResetPlan(section: SettingsSection): SectionResetPlan;
~~~

- `capture -> { settingsKeys: ["capture", "screenshot", "recording"] }`, 消除 `lib/settings.ts:311-317` 的 if 特例.
- `general -> { settingsKeys: ["general", "performance"], resetTheme: true }` —— 并组后"恢复本组默认"同时复位性能开关, 这是分组合并的直接后果, 已写进验收标准.
- `logcat -> { settingsKeys: ["logcat"], resetLogPanes: true }`, 消除 `SettingsDialog.tsx:317-320` 的组件内特例.
- `resetSettingsSection(settings, section)` 改为遍历 `settingsKeys` 覆盖默认值; 除 general 因并组多出 `performance` 外, 各组结果与现状逐项等价.
- 组件不再知道"哪些组要顺带复位主题或日志面板", 只按计划执行:
  设置可用时调 `resetSection(section)`, 随后按 `resetTheme` / `resetLogPanes` 复位另外两个存储.
  这两步互不依赖 —— 设置写入失败不再连带吞掉主题复位, 这正是归属分离要的结果.
- "全部恢复默认"(阶段二) = `restoreDefaults()` + 各分组 `resetTheme`/`resetLogPanes` 求并集后执行一次, 不逐组重复写入.

## 版本迁移

现状 `if (envelope.version !== SETTINGS_VERSION) throw`, 升版即让存量用户进错误态.

~~~ts
type SettingsMigration = (settings: Record<string, unknown>) => Record<string, unknown>;
const MIGRATIONS: Readonly<Record<number, SettingsMigration>>;   // key 为迁移的起始版本

export function migrateSettings(version: number, settings: unknown): unknown;
~~~

- `version === CURRENT`: 原样进入既有字段校验.
- `version < CURRENT`: 依次应用 `MIGRATIONS[version]`, 每步产出下一版本; 缺任一步即抛错并保留原始存储字节.
- `version > CURRENT`(降级): 抛错并保留原始字节, 沿用现有错误态与恢复入口, 不擅自按新版字段猜测读取.
- 迁移只在读取时进行, 不在加载阶段主动写盘; 迁移后的值在用户下一次成功写入时落盘. 只读打开应用不覆盖用户配置文件.
- 本任务 `MIGRATIONS` 为空表, `SETTINGS_VERSION` 保持 1. 只交付机制与测试, 不制造无消费者的版本跳变.
- 非法字段仍走既有 `record/flag/choice/text` 校验并抛错, 迁移不吞掉格式错误.

## 面板布局

弹窗尺寸 `min(860px, 100vw-32px)` × `min(640px, 100dvh-32px)`; 窗口下界 900×600 时为 860×568, 不溢出, 无需额外断点.

~~~text
┌ header: 标题                              搜索框        关闭 ┐
├──────────┬──────────────────────────────────────────────────┤
│ 通用   ● │  [错误横幅]                                       │
│ 日志     │  子标题                                           │
│ 截图与录屏│   行: ...                                        │
│ 文件     │                                                   │
│ 应用     │                                                   │
│ 生码     │                                                   │
├──────────┴──────────────────────────────────────────────────┤
└ footer: 恢复本组默认  全部恢复默认                     关闭 ┘
~~~

- 左栏 `w-[152px]`, `role="tablist" aria-orientation="vertical"`, 上/下/Home/End 键沿用现有横向 tab 的循环实现, 只换按键映射; `aria-selected`、`tabIndex` roving、`aria-controls="settings-content"` 语义不变.
- 右栏保持 `overflow-y-auto` 与 `id="settings-content" role="tabpanel"`, 错误横幅位置不变.
- 视觉沿用现有 token(`border-rule`、`bg-paper`、`bg-ink/text-onink` 选中态、hard shadow), 不引入新样式体系.
- 分组内子标题为一行 `text-xs font-semibold` + 其下行组, 复用 logcat 组已有的"显示日志的工作区"小标题写法.

## 行原语

用单一 `SettingRow` 取代现有 `SettingRow` + `Toggle` 两套结构.

~~~ts
interface SettingRowProps {
  id: string;                 // 稳定标识, 供搜索与改动标记复用
  label: string;
  description?: string;
  control: ReactNode;         // 开关时传 checkbox, 其余传 select/按钮组/输入
  disabled?: boolean;
  modified?: boolean;
  htmlFor?: string;           // 有原生可关联控件时使用 label 关联, 否则控件自带 aria-label
}
~~~

- 统一 `min-h-12`、`border-b border-rule last:border-b-0`、左侧标签区 `min-w-0` 可换行、右侧控件 `shrink-0`.
- 说明文字为标签下第二行 `text-[11px] text-ink3`, 无说明时不占高度.
- 开关行整行可点击的现有行为通过 `label` 包裹保留; 非开关行不整行可点击, 避免与下拉/输入冲突.
- `modified` 只做一个小圆点, 不改变行的可读密度.

## 搜索与改动标记

~~~ts
export function searchSettingsRows(query: string): readonly { section: SettingsSection; row: SettingsRowMeta }[];
export function modifiedRowIds(input: ModifiedInput): ReadonlySet<string>;

interface ModifiedInput {
  preferences: SettingsPreferences;
  theme: Theme;
  logOpenByPane: Record<PaneId, boolean>;
}
~~~

- 搜索大小写不敏感, 去空白后匹配 `label`/`description`/`keywords`; 空查询返回空数组, 由面板回落到当前分组视图.
- 命中结果按注册表顺序分组展示, 每条带来源分组标签; 点击结果切到对应分组并清空查询, 不做滚动定位与高亮闪烁.
- `modifiedRowIds` 与 `defaultSettings()` / `DEFAULT_LOG_OPEN_BY_PANE` / 主题默认 `system` 逐项比对, 覆盖三个存储, 结果同时用于行圆点和导航项圆点.
- 两个函数都不读 store, 由调用方传值, 便于直接单测.

## 组件拆分与影响文件

~~~text
components/settings/
  SettingsDialog.tsx          壳: 尺寸/焦点/tablist/错误横幅/底部按钮  (目标 <150 行)
  SettingRow.tsx              行原语                                   (新增)
  SettingsSearch.tsx          搜索框与结果列表                          (新增)
  sections/GeneralSection.tsx        六个分组组件 (含并入的性能开关)      (新增)
  sections/LogcatSection.tsx
  sections/CaptureSection.tsx
  sections/FilesSection.tsx
  sections/AppsSection.tsx
  sections/CodegenSection.tsx
  CaptureDirectoryPreference.tsx     现有四个子组件保持原位与原职责
  StartDirectoryPreference.tsx
  SortPreferences.tsx
  GeneratorPreferences.tsx
~~~

- 改动集中在 `lib/settings.ts`(分组联合类型、重置、迁移)、新增 `lib/settingsSections.ts`、`components/settings/**`; `store/settings.ts` 不变 —— 复位另外两个存储由弹窗按计划执行, 设置 store 不反向依赖 theme/ui store.
- 不动 `lib/tauri.ts`、`store/ui.ts` 的 `logOpenByPane` 结构、`store/theme.ts`、任何 Rust 文件.
- 页面快捷入口 `openSettings(section)` 签名不变; 因为并组, `PerformancePanel.tsx:106` 由 `openSettings("performance")` 改为 `openSettings("general")`, 其余四处不动.

## 测试策略

前端无 jsdom, 交互不做 DOM 级断言, 把可测性放进纯函数与 SSR 快照.

- 纯函数: 注册表顺序与 id 唯一性、`findSettingsSection` 未知 id 抛错、`sectionResetPlan` 六组映射、`resetSettingsSection` 与改造前逐组等价、`migrateSettings` 三种版本分支、`searchSettingsRows`、`modifiedRowIds`.
- SSR 快照(`renderToStaticMarkup`): 每个分组组件在 `!available` 时只把设置存储拥有的控件放进 disabled fieldset, 主题与日志工作区仍可用; 阶段二再补行级元数据与组件渲染结果的一致性断言.
- 等价性回归: 改造前后对同一份存量配置调用 `decodeSettings` + 各组 `resetSettingsSection`, 结果逐字段一致(general 因并组多复位 `performance`, 单独断言).
- 人工检查(改造后一次性): 900×600 与 1200×800 × 亮暗双主题的溢出/换行、竖直导航键盘可达、Escape 与焦点返回、五处快捷入口落点、损坏配置下主题仍可切换.

## 回滚

三个阶段各自是独立提交, 按阶段倒序回滚即可; 因为不改 schema、不 bump 版本、不写入新字段, 回滚后已保存的用户配置仍被旧代码原样读取, 无数据迁移债务. `MIGRATIONS` 为空表时删除迁移函数不影响任何存量配置.
