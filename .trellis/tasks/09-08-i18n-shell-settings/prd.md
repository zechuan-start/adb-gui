# 框架与设置面板文案迁移

父任务: [界面中英双语与语言设置](../09-08-i18n-bilingual/prd.md) · 架构: [design.md](../09-08-i18n-bilingual/design.md)

依赖: [i18n-foundation](../09-08-i18n-foundation/prd.md) 必须先完成.

## 交付边界

把应用外壳与设置面板的全部可见文案迁进词典. 完成后, 英文用户能读懂顶栏, 设备选择, 状态横幅, 更新提示, toast, 以及设置面板七个分组的每一行.

## 文件归属

本子任务独占以下文件, 不与 [i18n-tool-pages](../09-08-i18n-tool-pages/prd.md) 重叠:

- `src/App.tsx`
- `src/components/layout/**` (AppShell, TopBar, IndexRail, StatusBanner, DevicePicker)
- `src/components/DeviceSpecStrip.tsx`, `ToastBar.tsx`, `UpdateChecker.tsx`, `BlueprintSelect.tsx`
- `src/components/settings/**` (弹窗, 行, 分组, 控件, 六个 section, 四个 preference 组件)
- `src/lib/settings.ts`, `src/lib/settingsSections.ts`
- `src/store/settings.ts`
- `src/lib/tauri.ts` (原生对话框的标题与按钮文案, 含工具相关的几处 —— 由本子任务一次改完, 避免跨任务改同一文件)

对应词典命名空间: `common`, `shell`, `settings`, 以及 `tools.recording` 下的对话框条目.

## 范围外

- 不改工作区内部文案 (子任务 3).
- 不改 Rust 错误返回 (子任务 4).
- 不改任何中文措辞. 迁移是搬运, 不是润色.

## 验收标准

- [ ] 英文界面下顶栏, 设备选择器, 设备规格条, 索引栏, 状态横幅, 更新提示, toast 无中文.
- [ ] 英文界面下设置弹窗七个分组逐行检查 (含搜索框, 已修改标记, 恢复默认按钮) 无中文.
- [ ] 设置搜索在两种语言下都能按当前语言的词命中对应行.
- [ ] `SORT_DIRECTIONS`, `FILE_SORT_OPTIONS`, `APP_SORT_OPTIONS`, `STARTUP_OPTIONS` 的选项标签跟随语言.
- [ ] 设置文件损坏与写入失败的提示在两种语言下正确显示, 且语言切换后已显示的提示同步变化.
- [ ] "恢复默认设置"与"放弃保存录屏"的原生确认弹窗在两种语言下标题, 正文, 两个按钮齐备.
- [ ] 中文界面逐字对照迁移前无变化 (`git diff` 中文串未被改写).
- [ ] `pnpm test` 通过, 相关测试断言改为引用 `zh-CN` 词典条目.
- [ ] 英文长文案下设置弹窗与顶栏在最小宽度无溢出.
