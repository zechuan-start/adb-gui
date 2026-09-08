# 框架与设置迁移实施计划

按"用户能看到的区域"分批, 每批一个提交, 每批跑一次 `pnpm test`.

## 批次 1: common 与外壳

1. 抽 `common` 命名空间 (取消/确定/复制/刷新/关闭/重试等跨模块短词).
2. `App.tsx`, `layout/**`, `DeviceSpecStrip.tsx`, `BlueprintSelect.tsx` 文案入 `shell`.
3. `StatusBanner.test.tsx`, `DevicePicker.test.ts`, `DeviceSpecStrip.test.ts` 断言改为引用词典.

验证: `pnpm test`; 手工在英文下看首屏与设备未授权/离线/无设备三种横幅.

## 批次 2: toast 与更新提示

4. `store/feedback.ts` 的 `ToastBody` 改造 + 全部 `showToast` 调用方同步 (跨工作区文件也会被波及 —— 只改调用形式, 文案暂时用取值函数指向临时 `common` 条目或就地保留, 由子任务 3 归位).
5. `ToastBar.tsx`, `UpdateChecker.tsx` 迁移.

验证: `pnpm test`; 手工触发一次成功 toast 与一次失败 toast, 切换语言确认已显示的 toast 同步变化.

> 注意: 步骤 4 是本子任务唯一会碰到工作区文件的地方. 只改 `showToast` 的调用形式, 不动工作区其它文案, 避免与子任务 3 冲突. 若两个子任务并行, 此步应在子任务 3 开始前完成并合入.

## 批次 3: 设置注册表与选项常量

6. `lib/settings.ts`: 选项常量去掉 `label`, 标签入词典; 抛错改 `AppError`.
7. `lib/settingsSections.ts`: 剩余 label/description 全部改为词典取值函数.
8. `store/settings.ts`: `error` 字段改 `AppErrorPayload | null`.

验证: `pnpm test` (含 `settings.test.ts`, `settingsSections.test.ts`); 手工写坏 `adb-gui-settings` 确认两种语言下的损坏提示.

## 批次 4: 设置面板组件

9. `settings/**` 全部组件: 弹窗标题, 搜索框, 已修改标记, 恢复默认按钮, 六个 section, 四个 preference 组件, 三个控件.
10. 保留六分组锚点导航, scrollspy 与键盘焦点行为; 不新增搜索.

验证: `pnpm test`; 手工在英文下逐行走六个分组, 验证锚点和键盘定位.

## 批次 5: 原生对话框

11. `lib/tauri.ts` 全部对话框文案改 `messages()` 求值, 含非 Tauri 分支.

验证: `pnpm tauri dev` 下触发目录选择, 恢复默认设置, 放弃录屏三个对话框, 两种语言各看一次.

## 批次 6: 收口

12. 英文下最小宽度 + 1400x880 双尺寸, 双主题走查设置弹窗与顶栏.
13. `git diff` 核对中文串逐字未变.
14. 记录 `validation.md`.

## 风险与回滚

| 风险 | 应对 |
| --- | --- |
| 批次 2 波及工作区文件, 与子任务 3 冲突 | 只改调用形式; 串行实施时此风险消失 |
| 去掉常量 `label` 破坏 `decodeSettings` 校验 | 校验只依赖 `value`; 改动后必须跑 `settings.test.ts` 全量 |
| 英文长标签改变滚动位置 | 验证六分组锚点定位, scrollspy 与焦点边界 |

每个批次是独立提交, 可单独回滚.
