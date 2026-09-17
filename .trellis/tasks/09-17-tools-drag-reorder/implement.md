# 工具页模块拖拽排序实施计划

分五步, 每步独立可验证. 第 1-2 步是纯逻辑, 先行落地并测透; 第 3-5 步接 UI.

## 1. 顺序代数与模块身份

- [x] 新建 `src/lib/toolLayout.ts`: `ToolModuleId`、`DEFAULT_TOOL_ORDER`、`reconcileToolOrder`、`moveTool`、`shiftTool`.
- [x] 新建 `src/lib/toolLayout.test.ts`.

测试必须覆盖:

- `reconcileToolOrder`: 非数组、元素非字符串、未知 id、缺失 id 按默认下标插回、重复 id 去重、空数组、合法顺序原样返回.
- `moveTool`: 前移、后移、移到首位、移到末位、target 等于自身时无变化.
- `shiftTool`: 首位继续前移无变化、末位继续后移无变化、正常前后移.

验证: `corepack pnpm test src/lib/toolLayout.test.ts`.

## 2. 拖拽状态机

- [x] 新建 `src/lib/toolDragController.ts`: `beginToolDrag` / `updateToolDrag` / `commitToolDrag` / `cancelToolDrag`.
- [x] 新建 `src/lib/toolDragController.test.ts`, 用构造矩形数组驱动, 不依赖 DOM.

测试必须覆盖:

- 位移未过 4 px 阈值时 `active` 为 false 且 `previewOrder` 等于原顺序.
- 过阈值后指针移到另一模块中心, `previewOrder` 发生预期换位.
- 指针落在两模块之间的 gap 里仍解析出最近模块, 不产生空落点.
- 换位后指针停在原地不触发第二次换位(`lockedTarget` 生效).
- 指针离开锁定矩形后可再次换位.
- `cancelToolDrag` 返回 `originOrder`, `commitToolDrag` 返回 `previewOrder`.

验证: `corepack pnpm test src/lib/toolDragController.test.ts`.

## 3. 持久化

- [x] `src/store/ui.ts`: 加 `toolOrder`、`setToolOrder`、`resetToolOrder`, 接入 `partialize` 与 `mergePersistedPreferences`.
- [x] 扩充 `src/store/ui.test.ts`.

测试必须覆盖:

- 初始状态 `toolOrder` 等于 `DEFAULT_TOOL_ORDER`.
- 写入顺序后从 localStorage 读回一致.
- 存储中含脏数据(未知 id / 缺失 id / 非数组)时仍得到完整九项.
- `resetToolOrder` 回到默认.
- 不影响现有 `logHeight` / `logOpenByPane` / `activePane` 的持久化断言.

验证: `corepack pnpm test src/store/ui.test.ts`.

## 4. 注册表与渲染层

- [x] 新建 `src/lib/toolModules.tsx`, 把 `src/App.tsx:215-241` 的九段 JSX 搬进来, 图号保持现有绑定(剪贴板仍为 `A-09`).
- [x] `src/App.tsx` 改为按 `toolOrder` 映射注册表渲染, key 用模块 id.
- [x] `src/components/ToolModule.tsx` 加 `dragHandleProps` / `dragging` / `dragHandleLabel`, header 插入 `GripVertical`.
- [x] 扩充 `src/components/ToolModule.test.tsx`: 未传 `dragHandleProps` 时不渲染手柄; 传入时渲染且 `<button type="button">`; 现有 class 断言全部保留.

此步结束时顺序已可由 store 驱动, 但还不能拖. 验证:

- 手动改 localStorage 中 `adb-gui-ui` 的 `toolOrder`, 刷新后渲染顺序随之改变.
- 九个工具入口、状态、主要动作没有丢失.
- 切换页签后录屏计时与端口轮询未被打断(确认 key 用的是模块 id 而非下标).

## 5. 交互层

- [x] 新建 `src/hooks/useToolDrag.ts`: 测量、`setPointerCapture`、边缘自动滚动、rAF 清理.
- [x] 接入键盘路径: `Ctrl/Cmd + ←/→`、aria-live 播报、移动后焦点回到手柄.
- [x] 工具页加"恢复默认布局"入口, 仅在顺序非默认时出现.
- [x] `src/i18n/messages/zh-CN.ts` 与 `en.ts` 同步新增文案: 手柄 aria-label、位次播报、恢复默认.

文案必须进 catalog, 组件内不得出现中文字面量, 否则 `src/i18n/catalog.test.ts` 会失败.

## 集成验证

```bash
corepack pnpm test        # 502 passed
corepack pnpm build       # tsc + vite build
corepack pnpm test:browser
```

`scripts/screenshots/toolDragSmoke.mjs` 是本任务新增的冒烟脚本, 已接进 `test:browser`(跑在既有 `smoke.mjs` 之后), 六个用例逐条对齐 prd 验收标准:

- 拖动改序并松开生效; 刷新后保持.
- header 点击不重排; 模块内按钮、输入框、下拉正常.
- 拖拽中 `Esc` 回滚.
- 边缘自动滚动可把模块拖到首位与末位.
- 手柄聚焦后 `Ctrl/Cmd + ←/→` 移动, 焦点不丢.
- "恢复默认布局"出现与消失的时机正确; 拖拽过程中不出现, 避免中途把网格下推.
- `1200x800` 与 `900x600` 两档下落点与视觉一致.
- 亮暗主题下手柄、拖拽态、落点提示可辨(截图人工确认).
- 重排不卸载模块: 拖走一个填过内容的模块后输入框仍保留原值.

既有 `smoke.mjs` 的八档矩阵(中英 × 明暗 × `900x600` / `1400x880`)全部通过, 说明网格改造没有引入横向溢出.

未覆盖: Tauri 打包应用下的真实 WKWebView / WebView2 表现. 本环境是 Linux 容器, 无法按 `.trellis/spec/frontend/quality-guidelines.md` 要求用 macOS LaunchServices 启动 `.app`. 需要在 macOS 上补一次: 指针拖拽跟手程度、边缘自动滚动、`touch-none` 对触控板的影响. 本机无设备时, 依赖设备的工具模块只验证 disabled 态下仍可拖动.

## 回滚点

每步一个提交, 按依赖顺序叠加. 第 1-3 步只新增文件和 store 字段, 单独回滚不影响现有页面; 第 4 步改了 `App.tsx` 的渲染结构, 是风险最高的一步, 回滚时需连同第 5 步一起撤销.

风险文件: `src/App.tsx`、`src/components/ToolModule.tsx`、`src/store/ui.ts`.
不修改: `src-tauri/` 全部、九个工具组件自身、`src/lib/settings.ts`、`src/lib/settingsSections.ts`.

## 实施中与计划的偏差

- 第 4 步没有把网格留在 `App.tsx`, 而是新建 `src/components/ToolWorkbench.tsx` 承载滚动容器、网格、恢复入口与播报区. 边缘自动滚动需要滚动容器的 ref.
- `TOOL_MODULES` 用 `Record<ToolModuleId, _>` 而非数组, 省掉单独的穷尽性断言.
- 事件层用 window 监听取代 `setPointerCapture`; 理由见 design.md 事件层一节.
- `moveTool` 的插入下标改为在移除前读取, 否则"往后拖到相邻模块"是空操作.
- `ToolDragState` 增加 `grab` 字段, `offset` 锚定当前槽位而非按下点, 否则换位后模块会飞离指针.
- `ToolModule` 的拖拽 props 收成单个可选 `drag` 对象(见 design.md), 不是第 4 步写的三个平铺 props; 这样"不可拖时不渲染手柄"只是一次 `drag &&`.
- "恢复默认布局"的显隐取已提交的 `toolOrder` 而非拖拽预览顺序. 该行在滚动流里, 跟着预览出现会在第一次换位时把整个网格下推一行, 落点随之在指针下漂移.
- `useToolDrag` 的 window 监听在工具页变为非激活时解绑并回滚当前手势, 对齐 `hook-guidelines.md` 的 Persistent Hidden Panes 一节.
- 新增 `scripts/screenshots/toolDragSmoke.mjs` 并接进 `pnpm test:browser`.

## 迭代 2 实施

1. [x] `lib/toolDragController.ts`: 包含式命中, 包围盒夹取, `pending` + `settleToolDrag`, 删除 `lockedTarget`; 重写对应单测(缝隙不动, 自身不动, 待确认换位, 确认, 撤回, 网格外夹取, 尺寸不一时不翻转).
2. [x] `lib/motion.ts`, `lib/layoutFlip.ts` 及单测(阈值, 同目标不重启, 反向差值).
3. [x] `hooks/useLayoutFlip.ts`; `hooks/useToolDrag.ts` 改为 offset 测量, `flushSync`, layout effect 确认, 接入 FLIP 与 store 订阅, 键盘跳过动画.
4. [x] `ToolModule` 拆分浮起外观与抓取光标; `ToolWorkbench` 删除恢复行, 网格 `relative`.
5. [x] 设置页 `toolLayout` 行, 快照与分组重置计划; 中英文案; 相关单测. 侧栏图标按钮对比后移除.
6. [x] `toolDragSmoke.mjs`: 入口只在设置页, 宽模块横扫无翻转无跳动, 动画出现与结束, 减少动态效果无动画.
7. [x] 规范更新, 构建安装, macOS 实机走查.

验证: `pnpm test`, `pnpm build`, `pnpm test:browser`, `pnpm tauri build --bundles app`.

### 迭代 2 走查记录

- Chromium 冒烟 9 组全部通过; 宽模块横扫只出现 4 种顺序, 被拖模块最大偏差 0.6 px. 同一探针在改动前测得 8/39/33 帧偏离一整列或一整行.
- macOS 实机: 可见窗口里拖过宽模块并松手, 落位动画播放完毕, 顺序正确; 设置页"Tools layout"行显示 MODIFIED 与恢复按钮.
- 已知现象: 窗口被其他窗口完全遮挡时, WebKit 暂停 WAAPI 动画, 画面停在第一帧, 回到前台后继续. 真实用户无法在被遮挡的窗口里拖拽, 不做处理; 后台自动化走查需先把窗口切到前台.
