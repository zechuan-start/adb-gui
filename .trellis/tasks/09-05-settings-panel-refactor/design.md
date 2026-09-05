# 设置面板重构设计

## 分层与目标形态

保持"偏好数据在 store, 呈现在组件"的现有边界, 在中间补一层不含 React 的分组元数据, 让分派、重置范围、搜索和改动标记都变成可单测的纯函数.

~~~text
lib/settings.ts            schema/解码/默认值/迁移        无 React 无 store
lib/settingsSections.ts    分组元数据/重置计划/搜索/diff   无 React 无 store   (新增)
store/settings.ts          读写与错误态                    zustand
components/settings/       壳 + 七个分组组件 + 行原语       React
~~~

面板只做三件事: 按 id 取分组元数据、渲染对应分组组件、把重置计划交给 store 执行. 不再持有任何分组特例.

## 分组注册表

新增 `src/lib/settingsSections.ts`, 只描述"有什么、归谁管、怎么复位", 不持有控件实现与 store 闭包.

~~~ts
export type PreferenceOwner = "settings" | "ui" | "theme";

export interface SettingsRowMeta {
  id: string;                       // 稳定标识, 供测试/搜索/改动标记使用
  label: string;
  description?: string;
  owner: PreferenceOwner;
  keywords: readonly string[];      // 中文标签之外的检索词
}

export interface SettingsGroupMeta {
  title?: string;                   // 组内子标题, 无标题即紧接分组顶部
  rows: readonly SettingsRowMeta[];
}

export interface SettingsSectionMeta {
  id: SettingsSection;
  label: string;
  icon: LucideIcon;
  groups: readonly SettingsGroupMeta[];
}

export const SETTINGS_SECTIONS: readonly SettingsSectionMeta[];
export function findSettingsSection(id: SettingsSection): SettingsSectionMeta;
~~~

- `SETTINGS_SECTIONS` 顺序即导航顺序, 现有七组顺序与标签不变.
- `findSettingsSection` 找不到即抛错, 取代 `SettingsDialog.tsx:269` 的兜底 `return`. 面板渲染时 `section` 一定非空(打开即有值), 未知值属于编程错误而非用户输入.
- `icon` 仅用于竖直导航, 沿用 `IndexRail` 已用的 lucide 图标语汇, 不新增图标依赖.
- 行元数据与控件实现分开: 组件负责画控件并写 store, 元数据负责被搜索、被 diff、决定 disabled. 两者靠 `id` 对齐, 由测试断言"每个分组组件渲染出的行 id 集合等于元数据声明", 防止两边分叉.

## 存储归属与禁用范围

现有 `<fieldset disabled={!available}>` 一刀切禁用整块内容, 越界禁用了不属于设置存储的主题与日志工作区可见性.

- 移除内容区的整块 `fieldset`, 改为逐行 `disabled = row.owner === "settings" && !available`.
- `owner` 取值与实际存储一一对应: `theme` -> `useThemeStore`; `ui` -> `adb-gui-ui` 的 `logOpenByPane`; 其余全部 `settings`.
- 子组件 `SortPreferences` / `GeneratorPreferences` 已各自按 `available` 处理, 保持不变, 不叠加外层禁用.
- 错误横幅与"重新读取 / 恢复新设置默认值"保持现状, 只是不再连带锁住另外两个存储的控件.
- 底部"恢复本组默认"的可用性改为: 该分组存在非 settings 归属的行时仍可用(只复位可复位的部分), 全部行都是 settings 归属时沿用 `!available` 禁用.

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
- `general -> { settingsKeys: ["general"], resetTheme: true }`, `logcat -> { settingsKeys: ["logcat"], resetLogPanes: true }`, 消除 `SettingsDialog.tsx:317-320` 的组件内特例.
- `resetSettingsSection(settings, section)` 改为遍历 `settingsKeys` 覆盖默认值, 行为与现状逐项等价.
- theme/logOpen 的实际复位放在一个 `applySectionReset(section)` 里(store 层或一个薄 hook), 组件只调用它, 不再 `getState()` 触达两个外部 store.
- "全部恢复默认" = `restoreDefaults()` + 对所有分组的 `resetTheme`/`resetLogPanes` 求并集后执行一次, 不逐组重复写入.

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
│ 性能     │   行: 标签 / 说明               控件              │
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
  id: string;                 // 与 SettingsRowMeta.id 对齐
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
  sections/GeneralSection.tsx        七个分组组件                       (新增)
  sections/LogcatSection.tsx
  sections/PerformanceSection.tsx
  sections/CaptureSection.tsx
  sections/FilesSection.tsx
  sections/AppsSection.tsx
  sections/CodegenSection.tsx
  CaptureDirectoryPreference.tsx     现有四个子组件保持原位与原职责
  StartDirectoryPreference.tsx
  SortPreferences.tsx
  GeneratorPreferences.tsx
~~~

- 改动集中在 `lib/settings.ts`(重置与迁移)、新增 `lib/settingsSections.ts`、`components/settings/**`; `store/settings.ts` 只增 `applySectionReset` 一类薄封装.
- 不动 `lib/tauri.ts`、`store/ui.ts` 的 `logOpenByPane` 结构、`store/theme.ts`、任何 Rust 文件.
- 页面五处快捷入口 `openSettings(section)` 签名不变, 无需改调用方.

## 测试策略

前端无 jsdom, 交互不做 DOM 级断言, 把可测性放进纯函数与 SSR 快照.

- 纯函数: 注册表顺序与 id 唯一性、`findSettingsSection` 未知 id 抛错、`sectionResetPlan` 七组映射、`resetSettingsSection` 与改造前逐组等价、`migrateSettings` 三种版本分支、`searchSettingsRows`、`modifiedRowIds`.
- SSR 快照(`renderToStaticMarkup`): 每个分组组件渲染出的行 id 集合等于元数据声明; `!available` 时 settings 归属的控件带 `disabled`, theme/ui 归属的控件不带.
- 等价性回归: 改造前后对同一份存量配置调用 `decodeSettings` + 七组 `resetSettingsSection`, 结果逐字段一致.
- 人工检查(改造后一次性): 900×600 与 1200×800 × 亮暗双主题的溢出/换行、竖直导航键盘可达、Escape 与焦点返回、五处快捷入口落点、损坏配置下主题仍可切换.

## 回滚

三个阶段各自是独立提交, 按阶段倒序回滚即可; 因为不改 schema、不 bump 版本、不写入新字段, 回滚后已保存的用户配置仍被旧代码原样读取, 无数据迁移债务. `MIGRATIONS` 为空表时删除迁移函数不影响任何存量配置.
