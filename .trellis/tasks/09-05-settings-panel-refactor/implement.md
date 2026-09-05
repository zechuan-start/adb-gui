# 设置面板重构实施清单

三个阶段串行执行, 每阶段一个提交, 阶段间设评审门禁. 阶段一的可见变化只有禁用范围修正和"性能"并入"通用", 阶段二才动布局, 阶段三为可选项.

## 依赖与门禁

- [x] 2026-09-05 用户审阅预览后确认"性能并入通用"与"不保留归属标签", 并授权开始实现阶段一.
- [x] 开始前读取 `.trellis/spec/frontend/{component-guidelines,quality-guidelines,settings-clipboard}.md` 与既有设置实现.
- [x] 确认工作分支为 `codex/settings-and-clipboard`, 不新建分支, 不创建 PR.
- [~] 不适用: 本轮在远端容器实现, 未运行桌面应用, 没有本机配置需要备份/恢复.
- [x] 基线 380 项; 改造后 397 项 (+17), 40 个测试文件.

## 阶段一 · 结构与正确性(P0)

### 1.1 分组注册表与分组合并

- [x] 新增 `src/lib/settingsSections.ts`: `SettingsSectionMeta` / `SETTINGS_SECTIONS` / `findSettingsSection` / `sectionResetPlan` / `resetSettingsSection`; 未引入行级元数据.
- [x] `SettingsSection` 移入 `settingsSections.ts` 并去掉 `"performance"`; `SettingsPreferences.performance` 字段与默认值不变.
- [x] 性能开关并入"通用"末尾, 标签改为"离开性能页后继续采集"(并组后原标签失去上下文); `PerformancePanel` 入口改为 `openSettings("general")`.
- [x] 分派改为穷尽 `switch` + `assertNeverSection`, 兜底 `return` 已删除.
- [x] 测试: 六组顺序与标签、id 唯一、`findSettingsSection` 未知 id 抛错.

### 1.2 重置计划收敛

- [x] `sectionResetPlan(section)` 覆盖六组; general 含 `performance`.
- [x] `resetSettingsSection` 按 `settingsKeys` 遍历, capture 特例已删除.
- [x] 弹窗按计划执行复位, 不再硬编码分组名; 设置 store 不反向依赖 theme/ui store.
- [x] 设置不可用时仍执行 theme / logOpen 复位, 写入失败也不吞掉这两步.
- [x] 测试: 六组重置计划映射; 逐组只复位计划内的键, 入参不被修改; general 多复位 `performance` 单独断言.

### 1.3 禁用归属修正

- [x] 移除内容区整块 `fieldset`, 改由各分组组件用 `SettingsFieldset` 只包裹设置存储拥有的行.
- [x] 通用组主题行、日志组"显示日志的工作区"在 fieldset 之外; 界面无 owner 标签.
- [x] 错误横幅补充说明, 仅在 `!available`(读取失败)时显示, 写入失败态不显示.
- [x] `SortPreferences` / `GeneratorPreferences` 保持自带处理; 生码组直接复用其自有 fieldset, 未叠加第二层.
- [x] "恢复本组默认"在通用/日志两组始终可用, 其余分组沿用 `!available` 禁用.
- [ ] 手工验证: 写入非法 `adb-gui-settings` 后主题三档与日志工作区勾选仍生效并落盘, 其余项保持禁用与错误横幅. **本轮未做**, 需真实应用或浏览器会话.

### 1.4 版本迁移机制

- [x] `decodeSettings` 接入 `migrateSettings(version, settings)`, 字段校验与错误文案不变.
- [x] `MIGRATIONS` 为空表, `SETTINGS_VERSION` 保持 1.
- [x] 读取阶段不主动写盘, 迁移结果随下一次写入落盘.
- [x] 测试: 同版通过、低版缺迁移抛错、高版抛错、非整数版本抛错、错误体仍报"设置格式无效"; 既有 store 用例覆盖抛错路径不写盘.

### 1.5 分组拆文件

- [x] 六个分组迁到 `components/settings/sections/*.tsx`; `SettingRow` / `Toggle` 原样移入 `SettingRow.tsx`, 未重新设计行原语.
- [~] `SettingsDialog.tsx` 只留壳, 469 -> 224 行. 未达 <150 目标: 手写 Tab 环回(约 20 行)与 tablist 键盘处理(约 30 行)仍在, 分别由阶段三与阶段二处理.
- [x] 单行压缩写法已随分组拆分消除.
- [x] 测试: `sections/ownership.test.tsx` 断言 `!available` 时主题按钮与工作区勾选在 disabled fieldset 之外, 其余控件在内; `available` 时无 disabled 属性.

### 阶段一门禁

~~~sh
corepack pnpm test
corepack pnpm build
git diff --check
~~~

- [x] 可见变化: 禁用范围修正、"性能"并入"通用"(含该开关标签改写)、错误横幅多一句说明. 其余内容、控件、文案与重置范围不变.
- [~] 五处快捷入口按代码核对指向 general/files/codegen/general/logcat; 实际落点待真实应用冒烟确认.
- [x] 提交阶段一, 交用户评审后再进入阶段二.

## 阶段二 · 信息架构与交互(P1)

### 2.1 竖直导航

- [ ] 弹窗尺寸改为 `min(860px,100vw-32px)` × `min(640px,100dvh-32px)`, 左栏 `w-[152px]`.
- [ ] `role="tablist" aria-orientation="vertical"`, 六项, 上/下/Home/End 循环; `aria-selected` / roving `tabIndex` / `aria-controls` 语义不变.
- [ ] 900×600 与 1200×800 双主题下检查溢出、换行与长路径显示(截图目录、设备起始目录).

### 2.2 行原语统一

- [ ] 新增 `SettingRow.tsx`, 合并现有 `SettingRow` 与 `Toggle` 两套结构, 支持可选说明行与 `modified` 标记.
- [ ] 六组全部改用新行原语; 开关行保持整行可点击, 非开关行不整行可点击.
- [ ] 检查每行 label 与控件的关联方式(原生控件用 `htmlFor`, 自定义控件保留 `aria-label`).

### 2.3 说明文案与子标题

- [ ] 为后果不直观的偏好补说明: 后台采集(持续 adb 采样、耗电)、设备起始目录(下次进入文件页或点主页生效)、自动折叠崩溃堆栈、启动时检查更新、本机保存目录、自定义分隔符. 文案以预览页 https://claude.ai/code/artifact/40901a98-b26a-4291-87e4-58a5b8b12b17 为准.
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

- [ ] 双尺寸双主题无溢出、无横向滚动; 竖直导航键盘可达六组; Escape 关闭并返回触发按钮焦点.
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

## 阶段一实现记录 (2026-09-05)

- 依赖方向为 `settingsSections.ts -> settings.ts` 单向; `settings.ts` 不再出现 `SettingsSection`, 也不反向 import.
- 分派用穷尽 `switch` + `assertNeverSection` 替代原计划的运行期查表: 漏写分支变成编译错误, 比运行期抛错更早.
- `pnpm test` 397 项全绿(基线 380, 新增 17), `pnpm exec tsc --noEmit` 与 `pnpm build` 通过, `git diff --check` 干净.
- 仍待真实应用/浏览器验证: 损坏配置下的实际可编辑性与落盘、五处快捷入口落点、双主题双尺寸下拆分后的行间距与边框收尾.
