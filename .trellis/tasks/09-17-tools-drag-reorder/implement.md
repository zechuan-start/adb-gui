# 工具页模块拖拽排序实施计划

分五步, 每步独立可验证. 第 1-2 步是纯逻辑, 先行落地并测透; 第 3-5 步接 UI.

## 1. 顺序代数与模块身份

- [ ] 新建 `src/lib/toolLayout.ts`: `ToolModuleId`、`DEFAULT_TOOL_ORDER`、`reconcileToolOrder`、`moveTool`、`shiftTool`.
- [ ] 新建 `src/lib/toolLayout.test.ts`.

测试必须覆盖:

- `reconcileToolOrder`: 非数组、元素非字符串、未知 id、缺失 id 按默认下标插回、重复 id 去重、空数组、合法顺序原样返回.
- `moveTool`: 前移、后移、移到首位、移到末位、target 等于自身时无变化.
- `shiftTool`: 首位继续前移无变化、末位继续后移无变化、正常前后移.

验证: `corepack pnpm test src/lib/toolLayout.test.ts`.

## 2. 拖拽状态机

- [ ] 新建 `src/lib/toolDragController.ts`: `beginToolDrag` / `updateToolDrag` / `commitToolDrag` / `cancelToolDrag`.
- [ ] 新建 `src/lib/toolDragController.test.ts`, 用构造矩形数组驱动, 不依赖 DOM.

测试必须覆盖:

- 位移未过 4 px 阈值时 `active` 为 false 且 `previewOrder` 等于原顺序.
- 过阈值后指针移到另一模块中心, `previewOrder` 发生预期换位.
- 指针落在两模块之间的 gap 里仍解析出最近模块, 不产生空落点.
- 换位后指针停在原地不触发第二次换位(`lockedTarget` 生效).
- 指针离开锁定矩形后可再次换位.
- `cancelToolDrag` 返回 `originOrder`, `commitToolDrag` 返回 `previewOrder`.

验证: `corepack pnpm test src/lib/toolDragController.test.ts`.

## 3. 持久化

- [ ] `src/store/ui.ts`: 加 `toolOrder`、`setToolOrder`、`resetToolOrder`, 接入 `partialize` 与 `mergePersistedPreferences`.
- [ ] 扩充 `src/store/ui.test.ts`.

测试必须覆盖:

- 初始状态 `toolOrder` 等于 `DEFAULT_TOOL_ORDER`.
- 写入顺序后从 localStorage 读回一致.
- 存储中含脏数据(未知 id / 缺失 id / 非数组)时仍得到完整九项.
- `resetToolOrder` 回到默认.
- 不影响现有 `logHeight` / `logOpenByPane` / `activePane` 的持久化断言.

验证: `corepack pnpm test src/store/ui.test.ts`.

## 4. 注册表与渲染层

- [ ] 新建 `src/lib/toolModules.tsx`, 把 `src/App.tsx:215-241` 的九段 JSX 搬进来, 图号保持现有绑定(剪贴板仍为 `A-09`).
- [ ] `src/App.tsx` 改为按 `toolOrder` 映射注册表渲染, key 用模块 id.
- [ ] `src/components/ToolModule.tsx` 加 `dragHandleProps` / `dragging` / `dragHandleLabel`, header 插入 `GripVertical`.
- [ ] 扩充 `src/components/ToolModule.test.tsx`: 未传 `dragHandleProps` 时不渲染手柄; 传入时渲染且 `<button type="button">`; 现有 class 断言全部保留.

此步结束时顺序已可由 store 驱动, 但还不能拖. 验证:

- 手动改 localStorage 中 `adb-gui-ui` 的 `toolOrder`, 刷新后渲染顺序随之改变.
- 九个工具入口、状态、主要动作没有丢失.
- 切换页签后录屏计时与端口轮询未被打断(确认 key 用的是模块 id 而非下标).

## 5. 交互层

- [ ] 新建 `src/hooks/useToolDrag.ts`: 测量、`setPointerCapture`、边缘自动滚动、rAF 清理.
- [ ] 接入键盘路径: `Ctrl/Cmd + ←/→`、aria-live 播报、移动后焦点回到手柄.
- [ ] 工具页加"恢复默认布局"入口, 仅在顺序非默认时出现.
- [ ] `src/i18n/messages/zh-CN.ts` 与 `en.ts` 同步新增文案: 手柄 aria-label、位次播报、恢复默认.

文案必须进 catalog, 组件内不得出现中文字面量, 否则 `src/i18n/catalog.test.ts` 会失败.

## 集成验证

```bash
corepack pnpm test
corepack pnpm build
```

浏览器冒烟(`corepack pnpm test:browser` 或手动), 逐条对齐 prd 验收标准:

- 拖动改序并松开生效; 刷新后保持.
- header 点击不重排; 模块内按钮、输入框、下拉正常.
- 拖拽中 `Esc` 回滚.
- 边缘自动滚动可把模块拖到首位与末位.
- 手柄聚焦后 `Ctrl/Cmd + ←/→` 移动, 焦点不丢.
- "恢复默认布局"出现与消失的时机正确.
- `1200x800` 与 `900x600` 两档下落点与视觉一致.
- 亮暗主题下手柄、拖拽态、落点提示可辨.

Tauri 打包应用需单独确认 pointer capture 与自动滚动的真实表现: 按 `.trellis/spec/frontend/quality-guidelines.md` 的要求, 用 LaunchServices 启动 `.app`, 不直接执行二进制. 本机无设备时, 依赖设备的工具模块只验证 disabled 态下仍可拖动.

## 回滚点

每步一个提交, 按依赖顺序叠加. 第 1-3 步只新增文件和 store 字段, 单独回滚不影响现有页面; 第 4 步改了 `App.tsx` 的渲染结构, 是风险最高的一步, 回滚时需连同第 5 步一起撤销.

风险文件: `src/App.tsx`、`src/components/ToolModule.tsx`、`src/store/ui.ts`.
不修改: `src-tauri/` 全部、九个工具组件自身、`src/lib/settings.ts`、`src/lib/settingsSections.ts`.
