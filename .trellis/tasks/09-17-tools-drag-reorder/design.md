# 工具页模块拖拽排序设计

## 现状

`src/App.tsx:214-242` 直接把九个 `<ToolModule>` 写在一个网格里:

```text
grid-cols-[repeat(auto-fill,minmax(min(240px,100%),1fr))] gap-3.5
A-01 截图  A-02 录屏  A-03 安装 APK  A-04 Deep Link
A-05 端口转发 (wide, ≥1180px 跨两列)
A-06 快捷按键  A-09 剪贴板  A-07 当前应用  A-08 Bug Report
```

顺序即 JSX 书写顺序, 没有中间层可以重排. 所以第一步是把"有哪些模块"和"按什么顺序渲染"分开.

## 模块边界

```text
lib/toolLayout.ts         顺序代数: 身份 / 协调 / 移动   纯函数
lib/toolModules.tsx       注册表: 模块是什么             无状态, 无 DOM
lib/toolDragController.ts 拖拽状态机: 指针 -> 预览顺序   纯函数, 不碰 DOM
hooks/useToolDrag.ts      事件与测量: DOM -> 控制器      唯一接触 DOM 的层
store/ui.ts               持久化顺序
components/ToolModule.tsx 呈现手柄与拖拽态
components/ToolWorkbench.tsx 工具页外壳: 滚动容器, 网格, 恢复入口, 播报区
App.tsx                   只渲染 ToolWorkbench
```

工具页外壳单独成组件而不是留在 `App.tsx`: 滚动容器的 ref 要交给 `useToolDrag` 做边缘滚动, `App.tsx` 已经承担设备轮询与 Logcat 生命周期, 不适合再持有拖拽状态.

分层的硬约束来自测试环境: 项目没有 jsdom, `vite.config.ts:29` 只挂了 setup 文件, 组件测试全部走 `renderToStaticMarkup`. 因此所有判定逻辑必须下沉到前三层的纯函数, `useToolDrag` 只做"读矩形、绑事件、转发", 保持薄到不需要单测.

这与 `hooks/followScrollController.ts` + `hooks/useFollowScroll.ts` 的既有分法一致, 不是为本任务新造的结构.

## 工具注册表

```typescript
export type ToolModuleId = "screenshot" | "recording" | "install" | "deeplink"
  | "ports" | "keys" | "clipboard" | "currentApp" | "bugReport";

interface ToolModuleContext {
  active: boolean;                // 工具页是否为当前页签
}

interface ToolModuleDefinition {
  id: ToolModuleId;
  reference: string;              // "A-01", 绑定工具身份, 不随位置变
  wide?: boolean;
  icon: () => ReactNode;
  title: (t: Messages) => string;
  render: (context: ToolModuleContext) => ReactNode;
}

export const TOOL_MODULES: Readonly<Record<ToolModuleId, ToolModuleDefinition>>;
```

用 `Record<ToolModuleId, _>` 而非数组: 联合类型新增成员时 TypeScript 直接报缺键, 不需要额外的穷尽性断言. 九个工具里只有录屏、安装 APK、端口转发需要 `active`, 设备信息条不是模块, 所以 context 只有这一个字段.

`title` 取 `(t: Messages) => string` 而非预先翻译好的字符串, 与 `SettingsRowMeta.label` 和 `STARTUP_OPTIONS` 的既有写法一致, 满足 `.trellis/spec/frontend/i18n.md` 中"不得在模块加载期冻结翻译文本"的要求. `Deep Link` 是产品名, 保持字面量不进 catalog.

`render` 接收 context 透传 `active` 与活动刷新回调, 各工具组件签名不变.

## 顺序代数

```typescript
reconcileToolOrder(persisted: unknown, defaults: readonly ToolModuleId[]): ToolModuleId[]
moveTool(order: readonly ToolModuleId[], moved: ToolModuleId, target: ToolModuleId): ToolModuleId[]
shiftTool(order: readonly ToolModuleId[], moved: ToolModuleId, delta: 1 | -1): ToolModuleId[]
```

`reconcileToolOrder` 是持久化边界上的唯一入口, 必须处理四类脏数据:

| 输入 | 结果 |
| --- | --- |
| 非数组 / 非字符串元素 | 整体回落到 `defaults` |
| 含已删除模块 id | 丢弃该 id |
| 缺少某个现有模块 id | 按它在 `defaults` 中的下标插回 |
| 含重复 id | 只保留首次出现 |

"缺失补回"这条是版本兼容的关键: 老用户存了九个 id, 下个版本新增 `A-10`, 不做补回就会永久看不到新工具. 这与 `store/ui.ts:139` `restoreLogOpenByPane` 逐 pane 回填的策略同源.

`moveTool` 先读 target 在原数组中的下标, 再移除 moved, 最后插入到该下标. 移除会让下标之后的元素左移一位, 因此向后拖自然落在 target 之后, 向前拖落在 target 之前, 不需要方向分支. 反过来"移除后再取 target 下标"会让"往后拖到相邻模块"变成空操作.

## 拖拽状态机

```typescript
interface ToolDragRect { id: ToolModuleId; left: number; top: number; width: number; height: number }

interface ToolDragState {
  moved: ToolModuleId;
  origin: { x: number; y: number };   // 按下时的指针, 只用于阈值判定
  grab: { x: number; y: number };     // 按下点在模块内的偏移
  offset: { x: number; y: number };   // 要画在模块上的 translate
  originOrder: readonly ToolModuleId[];
  previewOrder: readonly ToolModuleId[];
  active: boolean;            // 位移过阈值前为 false
  lockedTarget: ToolModuleId | null;
}

beginToolDrag(moved, pointer, order, rects): ToolDragState
updateToolDrag(state, pointer, rects): ToolDragState
commitToolDrag(state): readonly ToolModuleId[]     // 返回 previewOrder
cancelToolDrag(state): readonly ToolModuleId[]     // 返回 originOrder
edgeScrollVelocity(pointerY, top, bottom): number  // 负数向上, 0 表示停
```

判定规则:

- **阈值**: 位移未超过 `DRAG_ACTIVATION_DISTANCE`(4 px) 时 `active` 保持 false, `offset` 保持 0, 不产生预览顺序. 这样 header 上的普通点击不会扰动布局.
- **落点**: 取指针坐标到各模块矩形中心的距离, 最近者为 target. 用中心距离而非"矩形包含", 因为网格有 14 px gap, 指针落在缝隙里时必须仍有确定落点.
- **自身死区**: target 等于 `moved` 时不换位. 这条依赖调用方传进来的是被拖模块的**槽位**矩形而非它当前被 translate 后的矩形, 见事件层.
- **防抖动**: 一次换位提交后把 target 写进 `lockedTarget`, 指针仍解析到同一个 target 时不再重算. 指针回到自己槽位上方时解锁, 于是往回拖可以再次换位.
- **跟手**: `offset` 不是"指针 - 按下点", 而是"指针 - 当前槽位左上角 - grab". 换位那一帧用 target 的槽位计算, 因为下一帧被拖模块就会占到那里. 用前者的话, 每次换位后模块都会跳回起始槽位的相对位置, 拖到第三个模块时已经飞出可视区.
- **边缘滚动补偿**: 槽位矩形本身随容器滚动而移动, 所以 `offset` 自动跟上自动滚动, 不需要额外记录 scrollTop 差值.
- **回滚**: `originOrder` 在 `beginToolDrag` 时快照, `Esc`、pointercancel 和窗口失焦都走 `cancelToolDrag`.

状态机不读 DOM, 矩形由调用方测量后传入, 因此可以用构造的矩形数组做完整单测.

## 事件层

`useToolDrag(scrollRef, active)` 负责三件 DOM 相关的事:

1. **测量**: 每次 pointermove 遍历模块 ref 取 `getBoundingClientRect()`, 九个元素成本可忽略. 被拖模块身上有 translate, `getBoundingClientRect` 会算进去, 所以要减掉上一帧画上去的 `offset` 才还原成槽位矩形. 不减的话被拖模块永远离指针最近, 自身死区吃掉全部落点, 一次都换不了位.
2. **事件源**: pointermove / pointerup / pointercancel / keydown / blur 都挂在 `window` 上, 拖拽开始时注册、结束时清理, 而不是照搬 `AppShell.tsx:138` 的 `setPointerCapture`. 应用预览顺序时 React 会把被拖的 `<section>` 在网格里移位, 而被捕获的元素在 DOM 中被移动可能丢失捕获. header 仍加 `touch-none` 防止触控板滚动抢事件.
3. **边缘滚动**: 指针进入滚动容器上下 48 px 内时, 用 `requestAnimationFrame` 循环按 `edgeScrollVelocity` 滚动, 每帧再用最后一次指针位置重算落点(网格在静止的指针下滑动, 目标会变); 指针离开边缘区、拖拽结束或 hook 卸载时取消 rAF.

元素引用通过 React ref map 收集, 不用 `document.querySelector`(`quality-guidelines.md` 明令禁止). ref 回调按 id 缓存后复用, 否则每次 pointermove 重建回调会让 React 把九个模块全部 detach 再 attach.

## 持久化

`store/ui.ts` 扩展:

```typescript
interface PersistedUiPreferences {
  activePane: PaneId;
  logOpenByPane: Record<PaneId, boolean>;
  logHeight: number;
  toolOrder: ToolModuleId[];        // 新增
}

setToolOrder: (order: readonly ToolModuleId[]) => void;
resetToolOrder: () => void;
```

`partialize` 增加 `toolOrder`; `mergePersistedPreferences` 中用 `reconcileToolOrder(persistedState.toolOrder, DEFAULT_TOOL_ORDER)` 落地. 沿用现有 `UI_STORAGE_KEY = "adb-gui-ui"`, 不引入新的 storage key, 也不动 `SETTINGS_VERSION`.

为避免 `store/ui.ts` 反向依赖 `lib/toolModules.tsx`(它会拖进整棵组件树), `ToolModuleId` 与 `DEFAULT_TOOL_ORDER` 定义在 `lib/toolLayout.ts`, 由 `lib/toolModules.tsx` 反过来引用并做穷尽性校验. 这与 `lib/panes.ts` 承载 `PaneId` 的分法一致.

## 呈现

`ToolModule` 新增可选 props, 不破坏现有调用与 `ToolModule.test.tsx` 的 class 断言:

```typescript
interface ToolModuleDragProps {
  handleLabel: string;
  dragging: boolean;
  moduleRef: Ref<HTMLElement>;
  handleRef: Ref<HTMLButtonElement>;
  style?: CSSProperties;
  headerProps: HTMLAttributes<HTMLElement>;   // header 整条的指针处理器
  onHandleKeyDown: (event: KeyboardEvent<HTMLButtonElement>) => void;
}

interface ToolModuleProps {
  // 现有: icon, title, reference, children, wide
  drag?: ToolModuleDragProps;
}
```

七个相关字段收在一个可选对象里, "不可拖时不渲染手柄"就只是一次 `drag &&` 判断.

- header 左侧插入 `GripVertical`(lucide, `h-4 w-4`), 与现有图标同尺寸. 不提供 `drag` 时不渲染手柄, 保持组件可独立使用.
- header 在可拖时加 `cursor-grab`, 拖拽中加 `cursor-grabbing`.
- 被拖模块: `z-10` + `bg-paper` + 描边加深 + 硬阴影 + `translate(dx, dy)`. 换成不透明底色是因为它此时浮在别的卡片和蓝图网格之上, 沿用半透明的 `bg-surface2` 会透出下面的文字, 与 `component-guidelines.md` 的浮层规则冲突. `cn()` 里 tailwind-merge 会自动丢掉被覆盖的 `bg-surface2`.
- 让位靠 CSS Grid 直接重排, 不加 `transition-transform`: 网格换位是布局变化而非 transform 变化, 补一个过渡类不会产生任何动画.
- 落点提示复用 Blueprint 语言的描边, 不引入新的视觉 token.

## 键盘路径

手柄为 `<button type="button">`, `aria-label` 取自 catalog 的位次文案. `Ctrl/Cmd + ArrowLeft/ArrowRight` 调 `shiftTool`. 选用 Ctrl/Cmd 组合而非裸方向键, 是为了不抢走焦点在 header 时的常规导航.

工具页挂一个 `aria-live="polite"` 区域, 移动后写入"标题, 第 N 项, 共 M 项". 顺序是一维的, 所以只用左右键, 不用上下键, 避免在二维网格里产生歧义.

移动后焦点必须仍在该模块的手柄上. React 按 id 作 key 重排时 DOM 节点会移动, 需要在 `useEffect` 中对刚移动的模块重新 `focus()`.

## 恢复默认

工具页顶部, `DeviceSpecStrip` 与网格之间, 顺序非默认时出现一行轻量入口. 判定用 `toolOrder` 与 `DEFAULT_TOOL_ORDER` 逐项比较, 不引入额外 store 字段.

## 风险与边界

- **宽模块空洞**: 端口转发 `wide` 被拖到行尾时, CSS 网格放不下会留空. 接受该行为, 不加 `grid-auto-flow: dense` —— dense 会让视觉顺序与存储顺序脱钩, 拖拽命中随之失真.
- **重排不得有业务副作用**: 各工具组件按 id 作 key, React 重排 DOM 而非卸载重建, 录屏计时与端口轮询不受影响. 除 key 之外还有一层: `ToolWorkbench` 用 `useMemo` 按 `active` 缓存九个模块 body 的 element, 引用不变时 React 会整棵子树 bail out, 拖拽期间每帧 setState 才不会把九个工具重渲染一遍. 浏览器冒烟里用"拖走一个填过内容的模块后输入框仍保留原值"来卡这条.
- **不改的文件**: `src-tauri/` 全部, 九个工具组件自身, `lib/settings.ts`, `lib/settingsSections.ts`.
