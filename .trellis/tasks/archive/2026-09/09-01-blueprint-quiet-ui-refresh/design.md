# Blueprint Quiet UI 翻新设计

## 产品原则

1. 外壳稳定. 设备、导航和日志上下文在页面切换时保持固定位置.
2. 数据优先. 等宽字体承载设备信息、日志和技术值, 装饰不能压过内容.
3. 现有行为优先. 原型补充交互, 但不得覆盖已验证的业务能力.
4. 状态唯一. 主题、设备、日志流、页面日志开关和选择语义各自只有一个事实源.
5. 高频无动画. 页面切换、主题切换、日志收放和新日志追加瞬时完成.

## 整体布局

```text
┌──────── 168 px ────────┬──────────────────────────────────────────┐
│ ADB GUI                │ 设备选择  刷新  无线            Activity │ 54 px
│ 图号 / 修订            ├──────────────────────────────────────────┤
│                        │ 状态条 / 设备规格条                       │
│ 01 工具                │                                          │
│ 02 应用                │              页面工作区                  │
│ 03 文件                │                                          │
│ 04 生码                ├──────────────────────────────────────────┤
│ 05 解码                │ Logcat 工具栏                             │
│                        │ Logcat 虚拟列表                           │ 320 px 默认
│ 显示/隐藏日志          │                                          │
│ system light dark      │                                          │
└────────────────────────┴──────────────────────────────────────────┘
```

- 左侧索引栏固定 168 px, 顶栏固定 54 px.
- Logcat 默认高 320 px, 拖拽范围为 120 px 到 `viewport height - 220 px`.
- 页面区使用剩余高度, 日志关闭后页面区立即铺满.
- `900x600` 是 P0 最小验证窗口. 索引栏不折叠, 主区剩余 732 px.
- 日志工具栏在 732 px 主区内保持单行. 紧凑模式缩短过滤框、隐藏文字并把低频操作收入现有视图菜单, 不允许把计数单独挤到第二行.

## 视觉基础

### Token

`src/index.css` 继续作为颜色事实源, 将现有通用 token 映射到 Blueprint 语义角色:

- `background/card/foreground/muted/border/ring` 映射到 `paper/surface/ink/ink3/rule/note`.
- 新增 `grid/surface2/hover/onink/shadow/log-bg/log-dim/log-dim2/log-tag/ok/warn/err`.
- 亮暗主题采用附件指定色值. 日志专用 token 不复用外壳低对比度 `ink3`.
- 二维码和条形码继续使用不跟主题变化的 `qr-light` 与 `qr-dark`.

### 字体

- UI 使用 IBM Plex Sans, 数据、按钮文字和日志使用 IBM Plex Mono.
- 字体以本地 `woff2` 或等价离线资源进入构建, 不保留运行时 Google Fonts 请求.
- 系统 sans 和 monospace 只作为显式加载失败 fallback.

### 构件

- 页面区、工具栏和规格条不使用浮动卡片容器.
- 工具模块允许 1 px 描边, 圆角为 0, 硬投影只用于菜单、对话框和 toast.
- 图标按钮使用 `lucide-react`, 不复制原型内联 SVG.

## 状态所有权

### `theme` store

- 保留 `Theme = system | light | dark`.
- store 持久化用户选择, 解析结果只通过一个 `applyTheme` 路径写入根节点.
- `matchMedia` 缺失时明确解析为亮色. system 模式订阅系统变化, 非 system 模式不响应.

### `ui` store

新增轻量持久 UI 状态:

```ts
type PaneId = "tools" | "apps" | "files" | "codegen" | "decoder";

interface UiState {
  activePane: PaneId;
  logOpenByPane: Record<PaneId, boolean>;
  logHeight: number;
  logMaximized: boolean;
  logReadThroughSeq: number | null;
}
```

- `logOpenByPane` 默认 `tools/apps/files = true`, `codegen/decoder = false`.
- 切页先关闭 `logMaximized`, 再使用目标页面的日志开关状态.
- `logReadThroughSeq` 只记录 UI 已读位置, 未读数由 Logcat 当前最新 seq 派生, 不复制日志总数.

### `device` store

- 继续使用现有 `devices`、`selectedDevice` 和 `isOnlineDevice`.
- UI 通过选中 serial 查找完整 `DeviceInfo`, 不用 serial 非空代替在线判断.
- 设备详情规格条复用一次加载结果, 不让 `DeviceInfoButton` 和工具页各自维护第二份详情.

### `logcat` store

- 保留现有 10,000 行环形缓冲、查询索引、stream state、pause、follow、anchor 和列配置.
- 日志流控制器由外壳持续挂载, 日志面板视图可独立挂载或卸载.
- 堆栈折叠只新增派生分组和展开状态, 不修改后端事件 payload.

## 组件边界

```text
src/components/layout/
  AppShell.tsx
  IndexRail.tsx
  TopBar.tsx
  DevicePicker.tsx
  StatusBanner.tsx
  DeviceSpecStrip.tsx
src/components/logcat/
  LogcatWorkspace.tsx
  LogcatPanel.tsx
  LogcatToolbar.tsx
  LogcatList.tsx
  LogcatRow.tsx
src/store/
  theme.ts
  ui.ts
  device.ts
  logcat.ts
```

- `App.tsx` 负责启动数据监听和组合页面, 不继续承载全部外壳 JSX.
- `AppShell` 组合索引栏、顶栏、页面插槽和 Logcat 插槽.
- `LogcatWorkspace` 负责持续日志生命周期, `LogcatPanel` 只负责可见面板.
- 各业务页面继续复用现有组件, 子任务只调整布局和视图样式.

## 日志选择与复制

原型的单行选择不能破坏当前多行框选:

1. message 保持 `select-text`, 日期、时间、PID、TID、Tag、包名和等级保持 `select-none`.
2. 在 message 开始 pointer selection 时立即进入 detached, 后续日志不得把选区或视口拉走.
3. pointerup 后检查 `window.getSelection()`. 非空选区存在时不切换单行选择.
4. `Cmd/Ctrl+C` 优先让浏览器复制非空原生选区.
5. 只有原生选区为空且存在单行选择时, 才拦截复制并输出制表分隔的完整日志行.
6. 点击空白或已选行可清除单行选择, 不主动清除用户的原生文本选区.

这套优先级由纯函数表达并测试, 避免把复制判断散落在行组件和全局快捷键中.

## 原型修正

真实检查发现两个不能照搬的问题:

- `900x600` 时原型 Logcat 工具栏高度从 37 px 增至 58 px, 计数被挤到第二行. 实现必须通过紧凑模式和低频菜单保持单行.
- 断流提示使用半透明 `surface2` 时, 滚动日志会从 sticky 提示下透出. 实现使用不透明 `log-bg` 混合后的实色 surface, 并保留明确层级.

## 子任务顺序

1. `blueprint-shell-theme` 建立 token、主题、状态和工作区骨架.
2. `log-view-readability` 接入持续 Logcat, 完成面板和选择语义.
3. `blueprint-tools-workbench` 在稳定外壳内重排工具页.
4. 父任务执行跨页面、真实设备和视觉集成回归.

## 当前集成轮次页面设计

- 应用页使用 `minmax(0,1fr) + minmax(268px,32%)` 双栏. 左侧由紧凑搜索栏、34 px 虚拟列表行组成, 右侧详情区始终保留, 破坏性操作在详情区行内确认.
- 文件页保留现有 reducer、异步请求防串线和虚拟列表, 仅把路径、操作、表头、行、传输摘要、预览和新建目录弹层映射到 Blueprint token 与零圆角构件.
- 生码页在宽窗口使用 300 px 输入模块加结果区, 窄窗口改为上下布局. 空结果以虚线工作区呈现, 结果保持真实画布、复制、保存和预览行为.
- 解码页使用同样的 300 px 来源模块加结果区, 但保留其独立拖放、粘贴和批次结果模型. 不增加当前 Tauri contract 未提供的设备截图来源.
- 页面内容背景继续透出蓝图网格, 数据列表和需要连续阅读的结果区域使用 `surface` 或 `surface2`; 不引入新颜色事实源.

## 兼容与回滚

- 每个子任务独立提交, 外壳、日志和工具页分别可回滚.
- 业务 command 和 store 行为在视觉阶段保持原接口, 降低跨子任务耦合.
- 如新外壳未达到 `900x600` 验收, 不进入后续页面内部翻新.
