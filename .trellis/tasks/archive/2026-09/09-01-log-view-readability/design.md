# Blueprint Logcat 工作区设计

## 架构变化

当前 `App.tsx` 只在用户访问独立 Logcat 页后挂载 `LogcatPanel`. 新外壳移除独立页签, 因此拆分为:

```text
AppShell
├── PageContent
└── LogcatWorkspace
    ├── LogcatRuntime        始终挂载, 调用 useLogcatStream
    └── LogcatPanel          仅展开时渲染视图
        ├── LogcatToolbar
        ├── DisconnectStrip
        └── LogcatList
```

`LogcatRuntime` 与面板显隐解耦后, 收起日志不会停止 adb stream. 页面关闭和设备切换仍由现有 controller 清理 session.

## 工作区状态

- `ui.activePane` 决定当前页.
- `ui.logOpenByPane[activePane]` 决定面板可见.
- `ui.logHeight` 决定普通面板高度.
- `ui.logMaximized` 决定是否隐藏页面区.
- `ui.logReadThroughSeq` 与 `logcat.nextSeq` 派生隐藏未读数.

展开面板时, effect 在可见 revision 上推进 `logReadThroughSeq`. 收起时不订阅逐行视图, 但 runtime 继续更新 buffer.

## 工具栏布局

### 普通模式

```text
logcat | query | level | pause | fold wrap cozy slim follow | clear max hide more | count/status
```

### compact 模式

- 隐藏 `logcat` 标签和按钮文字.
- query 使用 `minmax(160px, 1fr)`.
- 保留 level、pause、fold、wrap、follow 和 count.
- cozy、slim、列配置、Restart、导出和清空进入 More/View 菜单, destructive 清空仍需清晰确认.
- 不使用 `flex-wrap`. 工具栏高度固定, 由容器 `ResizeObserver` 切换模式.

## 行模型

`LogcatEntry` 不增加视图字段. 新增纯派生模型:

```ts
type LogcatRenderItem =
  | { kind: "entry"; seq: number }
  | { kind: "crash-head"; seq: number; traceSeqs: number[]; expanded: boolean };
```

`groupCrashTraces` 按当前过滤后序列扫描. crash 后连续 stacktrace 归入该 crash, 遇到下一条非 stacktrace 或新 crash 结束. 无 crash 首行的孤立 stacktrace 继续作为普通行显示.

折叠只变换 virtualizer 的 render items. 查询索引、filtered count 和原始 buffer 不改变. 展开 map 以 crash seq 为 key, 缓冲淘汰后清理不存在的 key.

## 行布局与 token

- 日志容器使用不透明 `log-bg`.
- 元数据使用 `log-dim`, stacktrace 使用 `log-dim2`, Tag 使用 `log-tag`.
- I/V/D message 使用 `ink`, W 使用 `warn`, E/F 使用 `err`.
- W/E/F 左侧 3 px 色条不占列宽, 使用 inset 或固定外层位置.
- 行无分隔线, hover 使用弱 surface, 单行选中使用 note 20% surface.
- fixed path 总高保持 20 px. 宽行距只在显式开启时进入更高固定值或动态路径, 不能无意改变默认 fast path.

## 选择状态机

```text
pointerdown on message
  -> detach follow
  -> allow native selection

pointerup
  -> native selection non-empty: keep selection, do not select row
  -> native selection empty: toggle clicked row selection

Cmd/Ctrl+C
  -> editable target: leave default
  -> native selection non-empty: leave default
  -> selected row exists: prevent default, copy full formatted row
  -> otherwise: leave default
```

`selectedSeq` 属于 Logcat view state, 可以进入 `logcat` store 的 UI 部分或 Logcat panel local state. 为了跨面板暂时隐藏后仍保留选择, 建议放在现有 `logcat` store, 但不得与 scroll `anchoredSeq` 复用: anchored 表示视口锚点, selected 表示复制目标, 两者语义不同.

## 快捷键

- `Cmd/Ctrl+J`: 切换当前页面日志.
- `Cmd/Ctrl+F`: 面板展开时聚焦查询; 收起时先展开当前页再聚焦.
- `Cmd/Ctrl+C`: 按选择状态机处理.
- `Esc`: 查询框内清空并失焦; 否则关闭菜单或弹层.

## 设备边界

- online: 正常 stream.
- unauthorized/offline/none: runtime 停止或标记断开, 保留已有 buffer.
- sticky 断流提示使用实色背景, 文案说明下方为断开前缓冲.
- 切换设备继续走现有 reset/session generation, 不合并不同 serial 的日志.

## 测试边界

- `groupCrashTraces` 的连续、孤立、过滤、淘汰和多 crash.
- `formatLogLine` 的列顺序和制表分隔.
- `resolveCopyAction` 的 editable、原生选区、单行选择优先级.
- `ui` store 的逐页开关、铺满退出和未读 seq.
- 现有 logcat store、follow controller 和 virtual list 测试必须保持通过.
