# 子任务 B: AS 式交互外壳 — 技术设计

> 共享契约见父任务 `design.md`. AS 行为依据见 `../08-29-logcat-refactor/research/android-studio-logcat-model.md`.
> 前置: 子任务 A 已完成数据通道, store 基础与 `useLogcatStream`.

---

## 一, 状态模型

### 1.1 两个正交状态

```ts
streamMode: "live" | "paused"       // A 已建立: 数据是否进入 buffer
followMode: "follow" | "detached"   // B 新增: 视口是否跟随底部
anchoredSeq: number | null          // B 新增: 被点击锚定的行
```

### 1.2 行为矩阵 (四种组合必须全部定义)

| streamMode | followMode | 数据 | 视口 | 工具栏表达 |
|---|---|---|---|---|
| `live` | `follow` | 进入 buffer | 吸底 | 绿点; Pause 显示暂停图标 |
| `live` | `detached` | **进入 buffer** | 停在原处 (或锚定行) | 绿点; Pause 仍显示暂停图标; 列表右下角浮标显示新增计数 |
| `paused` | `follow` | 进积压区 | 无新内容可跟随, 保持底部 | 琥珀色暂停徽标 + 积压计数; Pause 显示播放图标 |
| `paused` | `detached` | 进积压区 | 停在原处 | 暂停徽标 + 积压计数; 浮标显示"回到底部" (无新增计数, 因为数据没进) |

**关键**: `live + detached` 时数据照常增长, 这是与 `paused` 的本质区别, 也是现状最容易被误解的一格. `Pause` 图标只由 `streamMode` 决定, 绝不掺入 `followMode`.

### 1.3 状态迁移

| 触发 | 迁移 |
|---|---|
| 点 `Pause` (当前 live) | `streamMode = paused` |
| 点 `Pause` (当前 paused) | `streamMode = live`, 积压补入, `followMode = follow`, 滚到底 |
| 滚轮上滚 / 触摸上滑 | `followMode = detached` |
| 滚动到底部 (阈值内) | `followMode = follow`, 清零新增计数, 解除锚定 |
| 点列表空白处 | `followMode = detached` |
| 点某一行 | `followMode = detached`, `anchoredSeq = 该行 seq` |
| 点 `Scroll to the End` | `followMode = follow`, `anchoredSeq = null`, 滚到底 |
| 点 `Restart` | 清 buffer 与索引, 停旧会话, 起新会话; 过滤条件保留; `followMode = follow` |
| 切设备 | `store.reset()` (A 已实现), `followMode = follow` |

---

## 二, 组件拆分

### 2.1 文件与行数预算

| 文件 | 职责 | 预算 |
|---|---|---|
| `components/logcat/LogcatPanel.tsx` | 容器: 空状态, 挂 hooks, 组装三段式布局 | ~90 行 |
| `components/logcat/LogcatToolbar.tsx` | 过滤控件 + 三个动作控件 + 更多菜单 + 统计区 | ~200 行 |
| `components/logcat/LogcatList.tsx` | 虚拟滚动容器 + 回到底部浮标 + 两种空状态 | ~120 行 |
| `components/logcat/LogcatRow.tsx` | 单行渲染, memo 化 | ~70 行 |
| `hooks/useFollowScroll.ts` | 视口跟随与锚定 | ~110 行 |
| `components/QuickKeys.tsx` | 原 `LogcatViewer.tsx` 纯改名 | 不变 |

`LogcatToolbar` 预算偏大是因为它同时承载 A 阶段的四套过滤控件; 子任务 C 用查询框替换它们之后会显著缩小.

### 2.2 Props 契约

组件间只传"该组件无法从 store 自取"的东西, 其余一律用 selector 自取 (遵循 `component-guidelines.md` 的"顶层工具面板通过 store 获取数据").

```ts
// LogcatList
interface LogcatListProps {
  scrollRef: RefObject<HTMLDivElement>;   // 来自 useFollowScroll
  onScroll(): void;
  onSurfaceClick(seq: number | null): void;   // null = 点在空白处
}

// LogcatRow
interface LogcatRowProps {
  entry: LogcatEntry;
  onTagClick(tag: string): void;
}
```

`LogcatRow` 不订阅 store, 只吃 props, 这是 memo 生效的前提.

---

## 三, `useFollowScroll`

把现状纠缠的 `autoScrollRef` / `programmaticScrollRef` / `following` / `handleScroll` / `handleUserScrollIntent` 收敛为一个 hook.

```ts
interface UseFollowScrollOptions {
  followMode: "follow" | "detached";
  setFollowMode(mode: "follow" | "detached"): void;
  revision: number;        // 数据变化信号, 用于决定是否吸底
  bottomThreshold?: number;   // 默认 40, 与现状一致
}

interface UseFollowScrollResult {
  scrollRef: RefObject<HTMLDivElement>;
  onScroll(): void;
  scrollToBottom(): void;
  measureNow(): void;      // 供 tab 切回时显式重测
}
```

内部规则:
- **程序化滚动打标记**: 自己设置 `scrollTop` 时置位一个 ref, 随后的 scroll 事件被识别为非用户意图并跳过判定. 这是现状 `programmaticScrollRef` 的作用, 必须保留 — 否则吸底动作会自己把自己判定成"用户离开底部".
- **吸底时机**: 在 `revision` 变化后的 `requestAnimationFrame` 中执行, 避免在 DOM 未更新时读到旧的 `scrollHeight`.
- **底部判定**: `scrollHeight - scrollTop - clientHeight < bottomThreshold`.
- **不负责数据流**: 这个 hook 只读写 `followMode`, 绝不触碰 `streamMode`.

### 3.1 行锚定的实现

`anchoredSeq` 不为 null 且处于 `detached` 时, 每次数据变化后需要保持锚定行在视口中的位置:

```
数据变化前: 记录 anchoredSeq 对应行的 offsetTop 与容器 scrollTop 的差 (视口内相对位置)
数据变化后: 在 rAF 中重新计算该行的 offsetTop, 调整 scrollTop 使相对位置不变
```

由于 buffer 是 FIFO 淘汰, 锚定行可能被淘汰. 处理: `buffer.bySeq(anchoredSeq)` 返回 undefined 时清除锚定并保持当前 `scrollTop` 不做补偿.

**注意**: 本任务的行高固定 20px, 所以"某行的 offsetTop"可以由索引位置直接算出, 不需要 DOM 测量. 子任务 D 引入 soft-wrap 动态行高后这个计算要改为基于 virtualizer 的测量结果, 届时需要回看这一节.

---

## 四, 挂载方式: 切 tab 不丢现场

### 4.1 App.tsx 改造

**懒挂载 + 挂载后常驻**:

```tsx
const [logcatMounted, setLogcatMounted] = useState(false);

useEffect(() => {
  if (activeTab === "logcat") setLogcatMounted(true);
}, [activeTab]);

// ...
{logcatMounted && (
  <div className={cn("h-full", activeTab !== "logcat" && "hidden")}>
    <LogcatPanel />
  </div>
)}
```

- **懒**: 从未打开日志页时不挂载, 不起子进程, 不浪费设备与 IPC.
- **常驻**: 打开过之后切走只是 `hidden`, DOM 与 store 都在, 滚动位置天然保留, 子进程不停, 新日志继续进缓冲.

其余 tab 保持现有的条件渲染, 不做统一改造 — 它们没有"现场"需要保留.

### 4.2 权衡

另一个方案是"组件照常卸载, 数据放 store, 订阅提到 App 层". 它避开 `display:none` 的测量问题, 但需要把流订阅搬到 App 层 (导致未打开日志页也在抓取, 或引入额外的"曾激活过"标记), 且虚拟列表重建后滚动位置要手动存取恢复. 选常驻方案是因为它对"现场属于用户"这条原则的实现最直接, 代价集中在一个可验证的点上.

### 4.3 代价与对策 (必须冒烟)

`display:none` 时容器 `clientHeight` 为 0, `@tanstack/react-virtual` 依赖 `observeElementRect` 测量, 切回时需要重新测量, 可能出现一帧空白或滚动位置漂移.

对策: `LogcatPanel` 监听"从隐藏变为可见"的转换, 在 `requestAnimationFrame` 中调用 `measureNow()`, 然后按 `followMode` 决定是恢复原 `scrollTop` 还是吸底.

可见性判断不依赖 CSS 查询 (禁止 `document.querySelector`), 而是由 `App.tsx` 通过 prop 传入 `visible`, 或由 `LogcatPanel` 自行读取 activeTab. 倾向前者: `LogcatPanel` 接一个 `visible: boolean` prop, 语义明确且可测.

**这一条必须列入手工冒烟项, build 通过不能替代.**

---

## 五, 工具栏

### 5.1 布局

单行, `flex-wrap`, 沿用现有 `border-b border-border bg-card px-4 py-2`:

```
[V][D][I][W][E][F]  [应用过滤 ~220px]  [搜索框 flex-1 min-220px]  [tag chip?]
   [Pause] [ScrollToEnd] [Restart] [导出] [清屏] [更多 ▾]        [统计区 ml-auto]
```

相对 A 阶段的变化:
1. 新增 `Scroll to the End` 与 `Restart` 两个按钮.
2. `Pause` 图标只随 `streamMode` 变化.
3. "清屏"职责收窄为只清前端.
4. 新增"更多 ▾", 内含破坏性动作.

图标 (lucide-react, 统一 `h-3.5 w-3.5` 与现状一致):

| 控件 | 图标 | tooltip |
|---|---|---|
| Pause (live) | `Pause` | 暂停日志流 |
| Pause (paused) | `Play` | 恢复日志流 |
| Scroll to the End | `ArrowDownToLine` | 回到底部并跟随 |
| Restart | `RotateCcw` | 清空并重连 |
| 导出 | `Download` | 导出当前过滤结果 |
| 清屏 | `Eraser` | 清屏 (只清当前视图) |
| 更多 | `MoreHorizontal` | 更多操作 |

`Scroll to the End` 在 `followMode === "follow"` 时禁用 (已经在底部跟随, 无操作可做), 这给用户一个额外的状态线索.

现状"清屏"用的是 `Trash2`; 改为 `Eraser` 以在视觉上与破坏性的"清空设备缓冲区"区分开.

### 5.2 统计区

```
{filteredCount}/{totalCount}  [流状态]  [暂停/积压]  [PID 状态]
```

流状态四态:

| streamState | 表达 |
|---|---|
| `idle` | 不显示 |
| `starting` | 灰点 + "连接中" |
| `live` | 绿点 |
| `disconnected` | 红点 + "已断开" |

### 5.3 破坏性动作: 清空设备日志缓冲区

复用项目既有的内联二次确认模式 (`ActivityMonitor.tsx` 的 `confirmAction` 状态机), 不引入新 dialog:

- 平时: "更多 ▾" 菜单中一项 `清空设备日志缓冲区`, 文字用 `text-destructive`.
- 首次点击: 文案变为 `确认清空设备缓冲区?`, 菜单内出现一行小字 `再次点击以执行, 该操作不可恢复。`
- 再次点击: 执行 `clearLogcat(serial)`, 成功与失败都出 toast, 确认态复位.
- 菜单关闭或点击其他项: 确认态复位, 不产生任何 adb 调用.

"清屏"保持单击直接生效, 无确认 — 它只丢弃前端窗口, 不可恢复性远低于设备侧清空, 加确认会妨碍高频使用.

---

## 六, 断开提示条

仅当 `streamState === "disconnected"` 时, 在工具栏与列表之间插入 `h-7` 提示条:

```
[!] 日志流已断开: <detail 摘要>                              [重连]
```

- 样式: `bg-destructive/10 text-destructive`, 语义 token.
- `detail` 为空时文案退化为 `日志流已断开`.
- `detail` 过长时截断并用 `title` 展示全文.
- "重连"复用 `Restart` 的处理函数, 期间 `streamState = "starting"`.

---

## 七, 列表

### 7.1 回到底部浮标

`followMode === "detached"` 时在列表右下角显示浮动 pill (`absolute bottom-4 right-4`):

| 条件 | 文案 |
|---|---|
| `detachedNewCount > 0` | `↓ 新增 {n} 行` |
| `detachedNewCount === 0` | `↓ 回到底部` |

点击 = `Scroll to the End` 的同一处理函数.

把这个动作从暂停按钮里独立出来, 是 R1/R2 在 UI 上的落点.

### 7.2 点击停止跟随

容器绑 `onClick`: 通过事件目标向上查找带 `data-seq` 的祖先元素来判定点在哪一行. 命中则 `onSurfaceClick(seq)`, 否则 `onSurfaceClick(null)`.

用 `data-seq` 属性而非 DOM 查询 (`quality-guidelines.md` 禁止 `document.querySelector`), 通过 React 事件对象的 `target` 遍历是允许的.

注意与现有 tag 按钮的点击冲突: tag 按钮的 handler 需要 `stopPropagation`, 否则点 tag 会同时触发行锚定. 但**行为上更合理的是两者都发生** (点 tag 既过滤又停止跟随), 因此不 stopPropagation, 只需确认过滤与锚定同时生效不产生矛盾.

### 7.3 两种空状态

| 条件 | 文案 |
|---|---|
| `totalCount === 0` | `暂无日志` |
| `totalCount > 0 && filteredCount === 0` | `没有匹配当前过滤条件的日志` |

区分二者能让用户意识到是自己的过滤把日志滤光了, 而不是没有日志.

---

## 八, 组件状态矩阵

**LogcatPanel**

| 状态 | 表现 |
|---|---|
| 空状态 | 无选中设备时整页居中 `请先连接设备以查看 Logcat` |
| 加载态 | `streamState === "starting"` 时列表区居中 `正在连接日志流...` |
| 默认态 | 工具栏 + (可选断开条) + 列表 |
| 失败态 | `startLogcat` reject 时 toast 报错, `streamState` 回 `idle` |
| 隐藏态 | `visible === false` 时保持挂载, 不渲染开销敏感的内容变化; 恢复可见时重测量 |

**LogcatToolbar**

| 状态 | 表现 |
|---|---|
| 默认态 | 全部控件可用 |
| 禁用态 | 无设备时整栏禁用; 导出在 `filteredCount === 0` 时禁用; `Scroll to the End` 在 `follow` 时禁用 |
| 加载态 | 应用列表加载中显示 `加载应用列表中...`; PID 解析中显示 `解析 PID...` |
| 确认态 | 更多菜单中破坏性项进入二次确认 |
| 反馈位置 | 统一走 `useFeedbackStore` toast, 工具栏内不做内联结果展示 |

**LogcatList**

| 状态 | 表现 |
|---|---|
| 空状态 | 两种, 见 7.3 |
| 默认态 | 虚拟滚动行, 固定 20px |
| 边界态 | `detached` 时右下角浮标; 锚定行保持位置 |

**LogcatRow**: memo 化, 保持现状列宽 (`5.5rem` / `w-3` / `w-40` / `w-12` / flex-1), `LEVEL_COLORS` 配色, tag 可点击, 长消息 ellipsis (soft-wrap 属子任务 D).

---

## 九, store 扩展 (本任务新增字段)

只增不改 A 已有字段:

```ts
followMode: "follow" | "detached";
detachedNewCount: number;
anchoredSeq: number | null;

setFollowMode(mode: "follow" | "detached"): void;
setAnchoredSeq(seq: number | null): void;
restart(): void;      // 清 buffer 与索引, 保留 filter, 触发重连
```

`appendBatch` (A 实现) 需要小幅调整: 当 `followMode === "detached"` 且 `streamMode === "live"` 时累加 `detachedNewCount`. 这是本任务唯一需要触碰 A 已有 action 的地方, 改动点要在 code review 中明确指出.

`restart()` 只清数据与状态, 实际的停旧起新由 `useLogcatStream` 观察一个 restart 信号 (如 `restartNonce: number`) 后执行, 避免 store 直接调用 Tauri 命令 (store 不应依赖桥接层).

---

## 十, 实现约束

1. **不允许** `Pause` 图标依赖 `followMode`. 这是本任务的核心目的.
2. **不允许**在 `useFollowScroll` 内触碰 `streamMode`.
3. **不允许**用条件渲染承载日志页.
4. **不允许**让"清屏"触发任何 adb 命令.
5. **不允许**引入新的 dialog 组件做确认, 必须复用既有内联确认模式.
6. **不允许**在 store 里直接调用 Tauri 命令 (`restart` 用信号 + hook 执行).
7. **不允许**用 `document.querySelector` 判定点击落在哪一行, 用 `data-seq` + 事件目标遍历.
8. **不允许**扩大过滤语义或引入查询语言 (子任务 C).
9. **不允许**改行高或引入动态测量 (子任务 D).
10. 拆分后每个文件不超过约 200 行; 超出说明职责划分需要再想.

---

## 十一, spec 更新 (Phase 3.3)

| 文件 | 改动 |
|---|---|
| `frontend/directory-structure.md` | 目录树加入 `components/logcat/`, `components/QuickKeys.tsx`, `hooks/`; 移除 `LogcatViewer.tsx`; 把"组件扁平放在 `components/`, 不按 feature 分文件夹"改为"单文件功能保持扁平, 拆成 3 个以上文件的功能建 feature 子目录", 并说明理由 |
| `frontend/hook-guidelines.md` | 删除"当前项目无自定义 hooks 文件"; 补 `hooks/` 目录与 `use<Feature>` 命名约定; 补两条模式: "Tauri 事件订阅必须先注册监听再启动产生事件的进程", "高频事件必须 ref 缓冲 + rAF 合并后再进 store" |
