# 设置面板整体重构验收

- 2026-09-07 按已确认的 `prd.md`, `design.md`, `implement.md` 完成前端实现. 未修改 settings schema、默认值、store 归属、Tauri 命令或 Rust 代码.
- 六个分组改为同一滚动清单与左侧锚点索引; 搜索、tab 内容分派、组内二级标题、footer 和底部关闭按钮已移除. 行标记改为可读的 `已修改`, 分组恢复与全局恢复移到内容区.
- 新增共享 `Switch`, `SegmentedControl`, `ChipGroup`, `SettingSwitchRow`, `SettingsSectionBlock`; 文件、应用和生码快捷控件继续写入同一个 settings store action.
- 浏览器检查发现并修复两处边界: 靠近底部的 `应用` 锚点被 scrollspy 误判为 `生码`; scrollspy 改变高亮后方向键从高亮而不是实际焦点继续. 程序化锚点现在只覆盖其自身滚动事件, 后续用户滚动继续由 scrollspy 接管.
- 损坏 settings 时, 全局恢复按钮不再被错误禁用. 它仍先确认, 再独立恢复 settings、主题和日志工作区可见性.

## 2026-09-07 自动验证基线

- `pnpm test`: 41 个测试文件, 406 项测试全部通过.
- `pnpm build`: TypeScript 严格检查和 Vite production build 通过; 仅保留既有的大 chunk 警告.
- `pnpm vitest run src/components/settings/sections/ownership.test.tsx`: 5 项通过.
- `git diff --check`: 通过.
- `rg -n 'type="checkbox"' src/components/settings`: 无结果.
- `rg -n 'searchSettingsRows|SettingsRowGate|SettingToggle|SettingsGroup\b|SettingsGroupMeta' src`: 无结果.

## 2026-09-07 浏览器验收

- 使用真实 Vite 页面和 Browser 工具, 按需运行项目的 `scripts/screenshots/mock-tauri.js` 设备模拟. 1200x800 与 900x600、亮色与暗色四种组合均渲染 6 个分组, dialog、内容区和 document 均无横向溢出.
- 点击锚点、手动滚动 scrollspy、ArrowUp / ArrowDown / Home / End、靠底部的 `应用` 定位均通过. 从文件、应用、生码、性能和日志入口打开时分别定位到对应分组.
- 主题与自动换行改动会显示行标记和分组恢复; 分组恢复不影响其他分组. settings 损坏时主题与日志工作区 chip 可操作, settings 所属控件禁用; 通用分组恢复仍能恢复主题, 显式恢复与全部恢复均能恢复 settings 可用状态.
- 全局恢复显示确认并恢复三个 store. 浏览器测试结束后 `adb-gui-settings`、主题和日志工作区可见性均恢复默认.
- 生码页的码类型、分隔符与设置双向同步; 文件和应用排序与设置双向同步.
- Tab / Shift+Tab 焦点环通过; Escape 关闭后焦点返回侧栏设置按钮.

## 范围说明

- 本任务没有修改安装/卸载、设备命令、截图、录屏或剪贴板原生链路, 因此未卸载设备应用或安装测试 APK. 用户已授权后续确有需要时执行该类测试.
- 2026-09-07 交接时尚未提交或归档; 2026-09-08 的后续验收与收口见下文.

## 2026-09-08 审查与原生验收

- 修复错误横幅被锚点滚动隐藏, 底部下拉菜单被裁剪, 从索引 Tab 跳回通用组的问题. 浏览器复现后回归通过, 原生 App 复测了错误恢复入口和菜单完整可见性.
- 原生 WebKit 中移除菜单缩放入场动画后, release 构建的 1200x800 与 900x600 菜单均完整显示. 自定义分隔符, 分组重置, 全局重置确认和暗色小窗口布局通过.
- 增加 macOS 原生应用菜单 "设置…" 和 `Cmd + ,`; Windows 的菜单注册不变. 真实原生 App 已验证快捷键打开.
- 设置内容区增加淡网格. 浏览器核对亮色线色强度约 0.042, 暗色约 0.022, 无横向溢出, 下拉菜单实色且完整可见; 原生窗口确认实际绘制效果.
- 初始焦点移到无边框标题. 浏览器验证初始 activeElement 为 `settings-title`, outline 为 none; Tab 后关闭按钮有可见焦点, Shift+Tab 环回, Escape 恢复触发按钮, 分组 End + Tab 正常. 原生 `Cmd + ,` 打开后聚焦标题且无边框, 按 Tab 后关闭按钮显示焦点框.
- `pnpm test`: 42 个测试文件, 410 项通过; 最终代码提交前于 2026-09-08 复跑通过. `pnpm build`, Rust 格式检查, Clippy, `git diff --check` 通过; Rust 125 项测试在 60 秒硬超时内通过.
- 最终 `pnpm tauri build --bundles app` 使用本机 ad-hoc 签名构建, 未生成 updater 资产或执行公证. `/Applications/ADB GUI.app` 签名校验通过, 安装文件与最终构建哈希一致, 旧 App 已移至垃圾桶.
- 损坏配置与重置测试完成后, 已逐项核对 settings, theme 和 UI 偏好与测试前备份一致. 后续网格与焦点验证不修改原生持久化偏好.
- 验收边界: macOS 原生验证通过; 未执行 Windows 原生测试, 未发布版本. 用户已授权本次代码与归档记录提交并推送 `main`.
