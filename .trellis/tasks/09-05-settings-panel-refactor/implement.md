# 设置面板重构实施清单

三个阶段串行执行, 每阶段一个提交, 阶段间设评审门禁. 阶段一不改变任何可见行为(除禁用范围修正), 阶段二才动布局, 阶段三为可选项.

## 依赖与门禁

- [ ] 本文档仅为规划. 未获用户明确开始指令前不进入实现, 不运行 `task.py start`.
- [ ] 开始前读取 `trellis-before-dev`, `.trellis/spec/frontend/{component-guidelines,state-management,quality-guidelines,settings-clipboard}.md`.
- [ ] 确认工作分支为 `codex/settings-and-clipboard`, 不新建分支, 不创建 PR.
- [ ] 记录改造前本机 `adb-gui-settings` / `adb-gui-ui` / `theme` 三份配置原值, 收工后恢复.
- [ ] 基线留档: 改造前跑一次 `pnpm test` 并记录用例数(当前 380), 后续以此对比新增量.

## 阶段一 · 结构与正确性(P0)

### 1.1 分组注册表

- [ ] 新增 `src/lib/settingsSections.ts`: `SettingsRowMeta` / `SettingsGroupMeta` / `SettingsSectionMeta` / `SETTINGS_SECTIONS` / `findSettingsSection`.
- [ ] 七组顺序、标签与现有 `SECTIONS`(`SettingsDialog.tsx:24-32`)完全一致, 行 id 全局唯一.
- [ ] 逐行标注 `owner`: 主题为 `theme`, 显示日志的工作区为 `ui`, 其余为 `settings`.
- [ ] 测试: 顺序与标签快照、id 唯一、未知 id 抛错、每行 `owner` 取值合法.

### 1.2 重置计划收敛

- [ ] 新增 `sectionResetPlan(section)`, 覆盖七组的 `settingsKeys` / `resetTheme` / `resetLogPanes`.
- [ ] `resetSettingsSection` 改为按 `settingsKeys` 遍历, 删除 capture 特例(`lib/settings.ts:311-317`).
- [ ] 新增 `applySectionReset(section)`(store 层薄封装), 承接原组件内的 theme / logOpen 复位(`SettingsDialog.tsx:317-320`), 组件不再 `getState()` 触达外部 store.
- [ ] 测试: 七组重置计划映射; 同一份配置在改造前后逐组 `resetSettingsSection` 结果逐字段等价.

### 1.3 禁用归属修正

- [ ] 移除内容区整块 `<fieldset disabled={!available}>`(`SettingsDialog.tsx:441-446`), 改为逐行按 `owner` 判定.
- [ ] 保留 `SortPreferences` / `GeneratorPreferences` 自带的 `available` 处理, 不叠加外层禁用.
- [ ] "恢复本组默认"在含非 settings 行的分组仍可用, 只复位可复位部分; 全 settings 分组沿用 `!available` 禁用.
- [ ] 手工验证: 写入非法 `adb-gui-settings` 后主题三档与日志工作区勾选仍生效并落盘, 其余项保持禁用与错误横幅.

### 1.4 版本迁移机制

- [ ] `decodeSettings` 接入 `migrateSettings(version, settings)`, 保留原有字段校验与错误文案.
- [ ] `MIGRATIONS` 为空表, `SETTINGS_VERSION` 保持 1, 不制造无消费者的版本跳变.
- [ ] 读取阶段不主动写盘, 迁移结果随用户下一次写入落盘.
- [ ] 测试: 同版原样通过、低版缺迁移即抛错、高版(降级)抛错且不消费字段、抛错路径不触发任何 `setItem`.

### 1.5 分组拆文件

- [ ] 七个分组内容迁到 `components/settings/sections/*.tsx`, 分派改为查表渲染, 删除末尾兜底 `return`(`SettingsDialog.tsx:269`).
- [ ] `SettingsDialog.tsx` 只留壳(尺寸、焦点、tablist、错误横幅、底部按钮), 目标 <150 行.
- [ ] 顺带整理 `:260-267` 的单行压缩写法, 与相邻文件缩进风格一致.
- [ ] 测试: 每个分组组件 SSR 渲染出的行 id 集合等于元数据声明; `!available` 时只有 settings 归属控件带 `disabled`.

### 阶段一门禁

~~~sh
corepack pnpm test
corepack pnpm build
git diff --check
~~~

- [ ] 除禁用范围修正外无可见行为变化: 七组内容、控件、文案、重置影响范围与改造前逐项一致.
- [ ] 五处快捷入口(`IndexRail` / `DeviceFileManager` / `CodeGeneratorPage` / `PerformancePanel` / `LogcatViewMenu`)落点正确.
- [ ] 提交阶段一, 交用户评审后再进入阶段二.

## 阶段二 · 信息架构与交互(P1)

### 2.1 竖直导航

- [ ] 弹窗尺寸改为 `min(860px,100vw-32px)` × `min(640px,100dvh-32px)`, 左栏 `w-[152px]`.
- [ ] `role="tablist" aria-orientation="vertical"`, 上/下/Home/End 循环; `aria-selected` / roving `tabIndex` / `aria-controls` 语义不变.
- [ ] 900×600 与 1200×800 双主题下检查溢出、换行与长路径显示(截图目录、设备起始目录).

### 2.2 行原语统一

- [ ] 新增 `SettingRow.tsx`, 合并现有 `SettingRow` 与 `Toggle` 两套结构, 支持可选说明行与 `modified` 标记.
- [ ] 七组全部改用新行原语; 开关行保持整行可点击, 非开关行不整行可点击.
- [ ] 检查每行 label 与控件的关联方式(原生控件用 `htmlFor`, 自定义控件保留 `aria-label`).

### 2.3 说明文案与子标题

- [ ] 为后果不直观的偏好补说明: 后台采集(持续 adb 采样、耗电)、设备起始目录(下次进入文件页或点主页生效)、自动折叠崩溃堆栈、启动时检查更新、本机保存目录、自定义分隔符.
- [ ] 截图与录屏拆"截图"/"录屏"子标题; 文件拆"排序与显示"/"起始目录".
- [ ] 文案不承诺实现之外的行为, 与两份 README 表述一致.

### 2.4 全局重置

- [ ] 底部补"全部恢复默认", 二次确认后执行 `restoreDefaults()` + theme/logOpen 并集复位一次.
- [ ] 取消无任何写入; 错误态横幅内既有"恢复新设置默认值"入口保持不变.

### 2.5 搜索与改动标记

- [ ] 实现 `searchSettingsRows` / `modifiedRowIds` 纯函数并接入头部搜索框.
- [ ] 空查询回落当前分组视图; 命中结果按注册表顺序分组展示并标来源分组; 点击结果切分组并清空查询.
- [ ] 改动标记同时作用于行与导航项, 覆盖三个存储的默认值比对.
- [ ] 测试: 大小写/空白归一、无命中、跨分组命中、三存储各自的改动判定.

### 阶段二门禁

~~~sh
corepack pnpm test
corepack pnpm build
git diff --check
~~~

- [ ] 双尺寸双主题无溢出、无横向滚动; 竖直导航键盘可达七组; Escape 关闭并返回触发按钮焦点.
- [ ] 重置范围与阶段一保持一致, 搜索与标记不改变任何写入路径.
- [ ] 提交阶段二, 交用户评审后再决定是否做阶段三.

## 阶段三 · 可选(P2)

- [ ] 打开设置热键(macOS `⌘,` / 其他 `Ctrl+,`), 复用 `AppShell.tsx:49-68` 的屏蔽逻辑, 打开时不与工作区热键冲突.
- [ ] 评估删除手写 Tab 环回(`SettingsDialog.tsx:330-348`): 先在双主题双尺寸下确认 `<dialog showModal>` 原生约束覆盖全部控件(含 `BlueprintSelect` 展开态), 确认不通过则保留现有实现并在 spec 记录原因.
- [ ] 补齐面板 SSR 快照测试的剩余分组, 记录最终用例数增量.

## 收尾

- [ ] 更新 `.trellis/spec/frontend/settings-clipboard.md`: 分派按注册表、禁用按存储归属、重置计划为唯一来源、版本迁移三分支、面板测试策略.
- [ ] 恢复本机三份配置原值, 不残留测试数据.
- [ ] 按用户要求提交到 `codex/settings-and-clipboard`; 不自动归档, 不运行会自动提交的脚本.

## 回滚

三个阶段各自独立提交, 倒序 revert 即可. 不改 schema、不 bump `SETTINGS_VERSION`、不写入新字段, 因此回滚后存量配置仍被旧代码原样读取, 无数据迁移债务; `MIGRATIONS` 为空表时删除迁移函数不影响任何存量配置.
