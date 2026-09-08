# 设计: 设置面板整体重构

## 1. 边界

主体改动位于 `src/components/settings/**`, `src/lib/settingsSections.ts` 及其测试, `CodeGeneratorPage` 对 `GeneratorPreferences` 的用法保持不变. 后续边界修复涉及共享 `BlueprintSelect` 和 `dropdownPlacement`; 网格样式复用 `src/index.css`; macOS 菜单及事件桥接位于 `src-tauri/src/lib.rs` 与 `src/lib/tauri.ts`. 不修改 settings schema, 迁移, store 或设备命令.

## 2. 信息架构: 从 tab 到滚动清单

```
+------------------------------------------------------------------+
| 设置                                                          [X] |
+-----------+------------------------------------------------------+
| 通用   *  |  01 通用                                 [恢复默认]   |
| 日志      |  主题                         [跟随系统][亮色][暗色]  |
| 截图与录屏|    跟随系统时随桌面外观自动切换          已修改        |
| 文件      |  启动页面                            [恢复上次页面 v] |
| 应用      |  启动时检查更新                                  (o)  |
| 生码      |  离开性能页后继续采集                            ( )  |
|           |                                                      |
|           |  02 日志                                             |
|           |  显示格式                              [标准][紧凑]  |
|           |  显示列                                              |
|           |    [日期][时间][PID][TID][包名][Tag][等级]           |
|           |  ...                                                 |
|           |                                                      |
|           |  ...                                                 |
|           |  全部恢复默认                                        |
+-----------+------------------------------------------------------+
```

- 弹窗: `w-[min(800px,calc(100vw-32px))]`, `h-[min(600px,calc(100dvh-32px))]`. 左栏 140px, 内容区 `overflow-y-auto`, 内容列 `max-w-[600px]`.
- 每个分组是一个 `<section id="settings-section-{id}" aria-labelledby="settings-heading-{id}">`, 标题行 = 序号 + 标签 (沿用 `font-data text-[10px] tracking-[0.12em] uppercase`) + 右侧条件渲染的 "恢复默认".
- 左栏由 `role="tablist"` 改为 `<nav aria-label="设置分组">` 内的按钮列表, `aria-current="true"` 标记当前分组. 点击时调用 `openSettings(id)`, 由滚动容器 `scrollTo({top: section.offsetTop, behavior: "auto"})` 定位. 键盘 Arrow / Home / End 从实际焦点对应分组计算落点, 随后滚动; Tab 进入该组第一个可用控件.
- scrollspy: 在滚动容器上监听 `scroll` (rAF 合并), 取 `offsetTop <= scrollTop + 24` 的最后一个 section 作为 active; 滚到底时 active 为最后一组. 不用 IntersectionObserver, 因为短分组在容器底部永远无法成为 "最大可见" 项.
- `useUiStore.settingsSection` 语义不变: `null` 关闭; 非 null 表示 "打开并定位到该组". 首次 `showModal()` 后聚焦 `tabIndex={-1}` 且无 outline 的标题, 再于下一帧滚动到目标组. 分组切换不重置焦点. active 高亮是弹窗内部 `useState`, 由 scrollspy 驱动, 不写回 store.
- 内容区组合 `blueprint-grid settings-grid`, 复用 22px 网格. 通过局部线色降低对比, 暗色进一步减弱; 保留不透明纸色底与控件表面.

## 3. 注册表 (`lib/settingsSections.ts`)

- `SettingsSectionMeta.groups: SettingsGroupMeta[]` 扁平为 `rows: SettingsRowMeta[]`. `SettingsGroupMeta` 删除.
- 删除 `keywords`, `searchSettingsRows`, `SettingsRowLocation.group`. 搜索不再存在.
- 保留并不改: `SettingsSection` 联合类型与顺序, `modified` 谓词, `modifiedRowIds`, `defaultSettingsSnapshot`, `RESET_PLANS`, `sectionResetPlan`, `resetSettingsSection`, `findSettingsSection`, `findSettingsRow`.
- 新增 `sectionRowIds(section): string[]`, 供弹窗判断分组是否 dirty: `rows.some(id => modified.has(id))`.
- `logPanes` 行 label 改为 "显示日志的工作区" 保持, 但它从 "组标题 + 无标签网格" 变成一个正常的堆叠行.
- 文案改动: `checkUpdates.description = "只在启动时检查一次"`; 删除 `appSort.description`; `separator.description = "批量生成时用它切分输入"`.

## 4. 行与控件原语 (`components/settings/`)

### 4.1 `SettingRow.tsx`

```ts
SettingsView({ modified: (rowId) => boolean })          // context, 只剩 modified
SettingRowLabel({ id })                                  // label + "已修改" 标签 + description(text-ink2)
SettingRow({ id, layout?: "inline" | "stacked", children })
SettingSwitchRow({ id, checked, onChange, disabled? })   // 整行点击 + 有标签的 Switch
SettingsFieldset({ available, children })                // 不变
```

- `inline`: `flex items-center justify-between gap-6 min-h-12 py-2.5 border-b border-rule last:border-b-0`.
- `stacked`: 同样的边框与 padding, 内部 `flex-col gap-2`, children 占满宽.
- 删除 `SettingsRowGate`, `SettingsGroup`, `SettingsView.visible`.
- "已修改" 标签: `<span title="当前值与默认不同" className="font-data text-[10px] uppercase tracking-[0.08em] text-note">已修改</span>`. 放在 label 同一行, `aria-hidden` 去掉, 让读屏也能读到.

### 4.2 `controls/Switch.tsx`

- `<button type="button" role="switch" aria-checked aria-label?>`, 轨道 `h-5 w-9 border border-rule`, 滑块 `h-3 w-3` 方形 (Blueprint 方角), 选中 `bg-ink` 滑块 `bg-onink` 右移. `disabled` 走 `disabled:opacity-40`. 无动画依赖, 只用 `transition-transform`.
- 行使用 `<div>`, 标签通过 `aria-labelledby` 关联 switch. 行点击转发状态变更, 排除 switch 自身冒泡并检查 disabled; 键盘焦点仅落在 switch, 不嵌套按钮.

### 4.3 `controls/SegmentedControl.tsx`

```ts
SegmentedControl<T extends string>({
  value: T; options: ReadonlyArray<{ value: T; label: string; icon?: LucideIcon }>;
  onChange(value: T): void; ariaLabel: string; disabled?: boolean;
})
```

- `role="radiogroup"`, 每项 `role="radio" aria-checked`. 尺寸固定: `h-8 px-3 text-xs`, 图标 `h-3.5 w-3.5` 在文字左侧; 外框 `border border-rule`, 项间 `border-r`; 选中 `bg-ink text-onink`. 键盘: 左右箭头在项间移动并选中 (与 radiogroup 约定一致).
- 消费方: 主题 (图标 + 文字), 显示格式, 码类型 (图标 + 文字), 排序方向.
- 主题分段的 `value` 是 `Theme`; 显示格式 `value` 由 `columnsMatch` 推导, 都不匹配时 `value` 为 `undefined` 并允许 (`value?: T`), 此时无选中项.

### 4.4 `controls/ChipGroup.tsx`

```ts
ChipGroup<K extends string>({
  options: ReadonlyArray<{ value: K; label: string }>;
  selected: Record<K, boolean>; onToggle(value: K, next: boolean): void;
  ariaLabel: string; disabled?: boolean;
})
```

- `role="group"`, 每项 `<button type="button" aria-pressed>`, `h-7 px-2.5 text-xs border border-rule`, 选中 `bg-ink text-onink`, `flex flex-wrap gap-1.5`.
- 消费方: 日志显示列 (`LOGCAT_COLUMNS`), 显示日志的工作区 (`STARTUP_OPTIONS` 去掉 `last`).

### 4.5 共享快捷控件

- `GeneratorPreferences.tsx` 拆出 `CodeTypeControl` (SegmentedControl 包装, 写 `codegen.codeType`) 与 `SeparatorControl` (BlueprintSelect + 自定义输入 + 校验, 写 `separatorMode` / `customSeparator`). `GeneratorPreferences` 保留给生码工作区, 内部组合这两个控件; `CodegenSection` 用 `SettingRow id="codeType"` + `SettingRow id="separator" layout="stacked"` 组合同样两个控件. 两处写同一个 `update("codegen", ...)`.
- `SortPreferences.tsx` 导出 `setSortBy(section, value)` / `setSortDirection(section, value)` 两个纯 store 写入函数; 工具栏版本 (下拉 + 箭头 + 齿轮) 不变; 设置行新增 `SortRow({ section })` = BlueprintSelect + SegmentedControl(升序/降序), 调同一对函数.
- `StartDirectoryPreference.tsx` / `CaptureDirectoryPreference.tsx`: 外壳改为 `SettingRow layout="stacked"`, 内部逻辑 (预设 / 草稿 / 校验 / 原生目录选择 / 世代计数) 不变. 保存目录的两个图标按钮保留, 与路径同一行右对齐.

## 5. 弹窗 (`SettingsDialog.tsx`)

- 结构: `<dialog>` > `<div flex-col>` > `<header>` (标题 + X) + 可选错误横幅 + `<div flex>` (`<nav>` 索引 + 滚动内容).
- 内容 = `SETTINGS_SECTIONS.map(section => <SettingsSectionBlock>)` + 末尾 `全部恢复默认` 按钮. 错误横幅与恢复操作留在滚动区外.
- `SettingsSectionBlock({ meta, dirty, onReset, children })` 渲染 `<section>` + 标题行 + children; `children` 由穷尽 `switch(section.id)` 给出 (保留 `assertNeverSection`).
- `resetSection(id)`: 与现状 `resetCurrent` 相同逻辑, 参数化为任意 section. `dirty(id) = sectionRowIds(id).some(rowId => modified.has(rowId))`.
- 删除: `query` state, 搜索输入, `searchSettingsRows`, `hitSections`, footer, "关闭" 按钮, `role="tabpanel"`.
- 保留: Tab 焦点环, `onCancel` / `onClose` -> `closeSettings`, `showModal` / `close` effect, 错误横幅的 重新读取 / 恢复新设置默认值.
- 标题初始焦点不参与 Tab 顺序; 从标题按 Tab / Shift+Tab 分别进入首尾控件. 控件继续使用全局 `focus-visible`, 关闭时由 dialog 恢复触发焦点.
- `BlueprintSelect` 测量视口与 clipping ancestors 的交集, 使用 `dropdownPlacement` 决定上下展开和最大高度; 滚动与 resize 时重测, 取消监听时清理. 不保留缩放入场动画.

### macOS 原生菜单

- 仅在 `target_os = "macos"` 注册 "设置…" 与 `Cmd + ,`.
- 菜单动作显示主窗口并发送 `open-settings`; 前端调用现有 `openSettings`, 监听注册失败显式提示, 卸载时注销监听.

## 6. 数据流

```
uiStore.settingsSection ──open──> dialog.showModal(); scrollTo(section)
nav click / keys ────────────────> openSettings(id) + scrollTo(id)
scroll ─────rAF────> active section (local state) ──> nav aria-current
row control ───────> useSettingsStore.update / useThemeStore.setTheme / useUiStore.setLogOpen
modifiedRowIds(snapshot) ──> SettingsView.modified ──> 行 "已修改" 标签
                        └──> dirty(section) ──> 分组标题 "恢复默认" 显隐
```

## 7. 取舍

| 决策 | 备选 | 取舍理由 |
| --- | --- | --- |
| 单页滚动 + 锚点 | 保留 tab, 合并小分组 | 合并后仍有 1 到 2 行的页面; 滚动清单让密度自然, 且 20 项一屏半可尽览 |
| 移除搜索 | 保留搜索过滤 | 20 项一页可见, 索引 + 滚动即可定位; 搜索带来 `SettingsRowGate` / `visible` 一整层过滤逻辑与 footer 禁用规则 |
| 取消二级小标题 | 保留 显示 / 截图 / 录屏 等 | 行标签已自含语境 ("保存截图后打开图片"); 少一层缩进, 与索引层级一一对应 |
| 分组级重置就地显示 | footer 常驻 "恢复本组默认" | 只在有改动时出现, 同时回答了 "标记是什么意思" 与 "怎么恢复" |
| switch 用 button 自绘 | 保留 checkbox + `role=switch` | 原生 checkbox 在 macOS 上是蓝色勾, 与 Blueprint 主题冲突, 且视觉上不是开关 |
| 保留 `SettingsSection` 六个 id | 合并 应用 到 文件 | 工作区快捷入口按 id 定位; 滚动清单里 1 行的分组不再刺眼 |

## 8. 兼容性

- 存储: 不变. 不升 `SETTINGS_VERSION`, 不加迁移.
- `openSettings(section)` 调用方 (`DeviceFileManager`, `CodeGeneratorPage`, `PerformancePanel`, `LogcatViewMenu`, `IndexRail`): 不变.
- `GeneratorPreferences` 在生码页的外观会随 `SegmentedControl` 收窄 (不再铺满两列), 属预期变化.
- 删除的导出: `searchSettingsRows`, `SettingsRowGate`, `SettingsGroup`, `SettingToggle`, `SettingsGroupMeta`. 全仓 `rg` 确认无其他消费者后删除.

## 9. 回滚形态

- 单任务串行, 每个实现阶段是一次可独立 revert 的提交 (提交时机由用户决定). 存储未变, 回滚不影响已保存偏好.
- 阶段一 (注册表扁平 + 删搜索) 与阶段二 (控件套件) 之间可停: 旧弹窗仍能编译运行 (`SettingsGroup` 在阶段一保留为只渲染标题的薄封装, 阶段四删除).
