# 子任务 D: 视图呈现 — 技术设计

> 共享契约见父任务 `design.md`. AS 呈现层依据见 `../08-29-logcat-refactor/research/android-studio-logcat-model.md` 第 3 节.
> 前置: A (行结构/缓冲), B (列表与行组件/锚定), C (查询语言/`crashKind`).

---

## 一, Soft-Wrap 与动态行高

这是本任务唯一的高风险改动, 单独放在最前面.

### 1.1 双路径设计

```
softWrap === false  ->  estimateSize: () => ROW_HEIGHT (20)   固定行高快路径
softWrap === true   ->  measureElement 动态测量
```

AS 默认关闭 soft-wrap, 本项目沿用. 这不是偷懒, 而是把动态测量的风险关进"用户显式开启"的门里: 绝大多数时间日志页跑在固定行高的快路径上, 性能与滚动稳定性与子任务 C 结束时完全一致.

**硬约束**: `softWrap === false` 时不得调用任何测量逻辑. 验收标准里"关闭后立即回到固定行高快路径"就是在验证这一点.

### 1.2 动态测量的实现

`@tanstack/react-virtual` 的动态高度靠 `measureElement`:

```tsx
<div
  ref={softWrap ? virtualizer.measureElement : undefined}
  data-index={virtualItem.index}
  data-seq={entry.seq}
>
```

注意两点:
- `data-index` 必须存在, virtualizer 依赖它把测量结果关联回行.
- 关闭 soft-wrap 时 ref 传 `undefined`, 彻底断开测量.

行的 message 列在 soft-wrap 开启时从 `whitespace-pre` + `text-ellipsis` 改为 `whitespace-pre-wrap` + `break-words`, 并去掉行容器的固定 `height`.

### 1.3 三个具体风险与对策

**风险 1: 跟随底部时的抖动.**
新行追加在底部, 测量发生在挂载后, 会先按估算高度布局再修正. 处于 `follow` 时视口一直在底部, 修正后重新吸底即可, 抖动基本不可见.
对策: 吸底逻辑 (B 的 `useFollowScroll`) 在 soft-wrap 开启时需要在测量回调后再执行一次吸底, 而不只在 `revision` 变化后.

**风险 2: ring buffer 淘汰造成 detached 视口漂移.**
淘汰移除顶部行, 总高度减少, `scrollTop` 的语义位置随之改变. 固定行高可由索引直接求 offset; 动态高度不能累加已淘汰行的测量值, 因为未渲染行只有估算高度.
最终对策: 点击时以稳定 `seq` 记录锚定行及其视口内偏移; 每次 revision 或测量完成后, 用 virtualizer 当前的 rendered-item start / `getOffsetForIndex` 重新计算该 `seq` 的绝对偏移, 再以 offset 差恢复相同视口位置. detached 锚定修正在 `useLayoutEffect` 中完成, 避免先绘制旧 `scrollTop`; 未锚定的普通浏览只保留最后 `scrollTop`.

**风险 3: 锚定行位置补偿失效.**
B 的实现在固定行高下由索引位置直接算出 offsetTop. soft-wrap 开启后必须改为基于 virtualizer 的测量结果.
对策: B 的 implement 已要求"把计算入口收敛到一处便于 D 替换". 本任务把该入口改为查询 virtualizer 的 `getOffsetForIndex` 或测量缓存.

### 1.4 回退方案 (真机不稳定时启用)

按优先级:

1. **限高多行**: soft-wrap 开启时行高固定为 N 行 (如 3 行 = 60px), 超出仍截断. 保留固定行高的所有优势, 代价是超长堆栈仍读不全.
2. **点击展开浮层**: 保持固定单行行高, 点击行时在浮层/侧栏展示完整消息并支持复制. 完全避开动态测量, 且这个交互本身对"复制单条异常"很实用.

启用任一回退必须在 `implement.md` 记录现象与决定, 并同步修订本节.

**注意**: 回退方案 2 与 journal Session 4 记录的"行展开复制"诉求高度吻合, 若动态测量代价过高, 它并不是降级而是另一条同样合理的路.

---

## 二, 视图格式

文件: `src/lib/logcatView.ts` + `src/lib/logcatView.test.ts`

### 2.1 模型

```ts
export type ViewFormat = "standard" | "compact";

export type LogcatColumn = "date" | "time" | "pid" | "tid" | "packageName" | "tag" | "level";

export interface ViewSettings {
  format: ViewFormat;
  columns: Record<LogcatColumn, boolean>;
  softWrap: boolean;
}

export const STANDARD_COLUMNS: Record<LogcatColumn, boolean> = {
  date: false, time: true, pid: true, tid: false,
  packageName: false, tag: true, level: true,
};

export const COMPACT_COLUMNS: Record<LogcatColumn, boolean> = {
  date: false, time: true, pid: false, tid: false,
  packageName: false, tag: false, level: true,
};

export const COLUMN_WIDTHS: Record<LogcatColumn, string> = {
  date: "w-10", time: "w-[5.5rem]", pid: "w-12", tid: "w-12",
  packageName: "w-44", tag: "w-40", level: "w-3",
};
```

`STANDARD_COLUMNS` 精确对应现状显示 (时间/等级/tag/pid/message), 保证"默认视图不变".

Compact 按 AS 的意图 (减少字段让 message 成焦点): 只留短时间, 等级, message.

**时间列的拆分**: 现状把 `MM-DD HH:MM:SS.mmm` 用 `line.time.slice(6)` 截掉日期显示. 本任务把它显式建模为 `date` 与 `time` 两列, 由 `logcatView.ts` 提供纯函数拆分并单测, 取代硬编码的 `slice(6)`.

```ts
export function splitTimestamp(time: string): { date: string; clock: string };
```

### 2.2 切换语义

- 切 `format` 时用对应预设覆盖 `columns`.
- 之后用户单独改某个字段开关, `format` 变为"自定义"状态 (UI 上两个格式按钮都不高亮), 但不新增第三个枚举值 — 通过"当前 columns 是否等于某预设"来判断显示.
- 切换不影响查询与滚动位置.

### 2.3 UI

文件: `src/components/logcat/LogcatViewMenu.tsx`

工具栏上一个图标按钮 (`Settings2` 或 `Columns3`) 打开下拉面板:

```
视图格式
  ( ) Standard    ( ) Compact
显示列
  [x] 时间   [ ] 日期   [x] PID   [ ] TID
  [ ] 包名   [x] Tag    [x] 等级
[x] Soft-Wrap 换行显示
```

soft-wrap 同时在工具栏上有独立快捷开关 (`WrapText` 图标), 因为它是高频切换项, 藏在菜单里不合适. AS 也是把它放在工具栏.

---

## 三, PID -> 进程名正向映射

### 3.1 后端 command

文件: `src-tauri/src/commands/logcat.rs`

```rust
#[derive(serde::Serialize, Clone)]
pub struct ProcessEntry {
    pub pid: String,
    pub name: String,     // 完整进程名, 可能含 ":suffix"
}

#[tauri::command]
pub fn list_device_processes(app: AppHandle, serial: String) -> Result<Vec<ProcessEntry>, String>
```

实现: `adb -s <serial> shell ps -A -o PID,NAME`, 经 `run_adb_output_with_serial`, 保留退出状态与诊断文本供兼容性判定.

**解析要点**:
- 从表头定位 `PID` 与 `NAME` / `CMD` / `COMMAND` 列, 不按固定列序猜测.
- PID 必须是纯数字, 进程名必须非空; 畸形数据行跳过, 缺少受支持表头时整次快照失败.
- 老设备明确报告 `-o` 不支持时回退到 `ps -A`; 任一阶段明确报告 `-A` 不支持时回退到裸 `ps`. offline, unauthorized, transport, 重复 serial 与权限错误不回退.
- 内核线程名形如 `[kworker/0:1]`, 保留原样, 不特殊处理.

**安全**: `serial` 经 `run_adb_output_with_serial` 传递, 命令参数是固定字面量, 无用户输入拼接. 不使用 `adb shell` 拼接字符串.

### 3.2 前端缓存与失效

store 扩展:

```ts
processMap: Map<string, string>;        // pid -> 进程名
processMapUpdatedAt: number;
processMapLoading: boolean;
processMapError: string | null;
```

刷新时机:
- 会话开始时一次.
- 扩展现有 `activityPollingController` 的 5 秒周期, 在同一轮内独立读取 Activity 与进程表, 不新增第二个定时器. 两项结果分别发布, 一项失败不得吞掉另一项成功.
- 手动 `Restart` 时重建.
- 切设备时**清空** (PID 不可跨设备复用).

**失效策略 (R3 的核心)**:
- 刷新成功: 用新映射**整体替换**, 不做 merge. 即使内容相同也更新 `processMapUpdatedAt`, 但不触发无意义的渲染修订.
- 刷新失败: 保留旧映射用于诊断, 不更新 `processMapUpdatedAt`; 超出一个轮询周期后不得再用于新日志行归属.
- 查不到或快照已过期的 PID: 在新入库行上固化为空, 不显示任何猜测值.
- 切设备或 Restart: 清空映射及其时间戳, 重建共享轮询生命周期并用 generation 拒绝 A -> B -> A 的晚到响应.

整体替换是这里的关键决定: 应用重启后 PID 可能被复用, merge 语义下旧条目会把新进程的日志标成旧应用. 快照可信期与 5 秒轮询周期一致; 失败不续期, 新行宁可固化为空.

### 3.3 包名的推导

```ts
export function packageFromProcessName(name: string): string | null;
```

只对可确认的 Android 应用进程名返回包名: `com.example.app:remote` -> `com.example.app`, `com.example.app` -> 原名. `[kworker/0:1]`, `system_server`, `/system/bin/...` 等系统或 native 名称返回 null, 避免把进程名误当包名. 纯函数, 单测.

### 3.4 写入 LogcatEntry

父任务共享契约 4.2 规定"每行都要用于判定或展示的派生值一律入库算一次". 本任务严格沿用: 每行入库时从仍在可信期内的 `processMap` 固化 `entry.processName` 与 `entry.packageName` (均可能为 null).

映射刷新后不回填历史行, 查询求值与渲染也不得现场查最新 Map. 原因不仅是避免 O(容量), 更是 PID 会复用: 未来快照无法证明历史行属于当前占用该 PID 的进程. 因此历史未知值永久保持空, 已固化值也不随快照变化.

---

## 四, `process:` 与 `package:` 的查询实现

### 4.1 `process:` 新增

`lib/logcatQuery.ts` 扩展:

```ts
// AST 节点
| { type: "process"; match: Matcher }
```

- 键名加入 tokenizer 的 `key` 集合.
- 支持 `~` / `=` 修饰符与否定 (与 `tag` / `message` 一致).
- 求值: 对 `entry.processName` 使用 `Matcher`. 入库时映射未知则字段为 null, 正向谓词返回 false, 否定沿 AST 的统一 NOT 语义生效.
- 移除 C 阶段的 "`process:` 暂不支持" 专用错误.

### 4.2 `package:` 升级

C 的实现: 包名 -> `pidof` -> PID 集合 -> 与 `entry.pid` 比对.
D 的实现: 直接匹配入库时固化的 `entry.packageName`; `mine` 先由当前前台包名解析为目标包名.

`EvalContext` 相应变化:

```ts
interface EvalContext {
  currentPackage: string;             // 仅供 package:mine
}
```

**收益**: 解决 C 记录的多进程限制. `pidof com.example.app` 拿不到 `com.example.app:remote` 的 PID, 而正向映射能看到该进程的完整名并推导出同一包名, 于是 `package:com.example.app` 能同时命中主进程与子进程.

**R6 的兼容要求**: 在进程快照已就绪后制造主进程与 `:remote` 子进程日志, 两者必须同时命中. 快照建立前的历史未知行不做猜测性补齐.

**清理**: C 阶段的 `packagePids` / `resolvedPackages` / `packageResolving` 与相关的 `getPackagePids` 调用路径可以移除. 但 `get_package_pids` command 本身**保留** — 它是现状 API 的一部分, 可能有其他调用方; 移除 command 不属于本任务范围.

**"解析中"语义的简化**: C 有一套"解析中返回 false + 显示解析中"的逻辑. 升级后不再有按包名的异步解析, 只有一份进程表. 因此简化为: `processMap` 为空且正在加载时, `package:` / `process:` 谓词返回 false, 查询框旁显示 `读取进程表...`.

---

## 五, 崩溃与堆栈高亮

消费 C 产出的 `entry.crashKind`, 不重新判定.

| crashKind | 视觉 |
|---|---|
| `crash` | 行背景 `bg-destructive/10` + 左侧 `border-l-2 border-destructive` |
| `stacktrace` | 左侧 `border-l-2 border-destructive/30`, 不加背景 |
| `null` | 无 |

设计意图: crash 是"事件", 需要在快速滚动中被扫到, 所以给背景; stacktrace 是"事件的延续", 只需要一条弱化的左侧色带表明归属, 加背景会让整屏堆栈变成一大片色块反而降低可读性.

**与等级配色的关系**: 等级色作用于文字 (`LEVEL_COLORS`), 高亮作用于背景与左边框, 两者不冲突. 但需在亮色/暗色下实际验证 E/F 级红色文字叠加 `bg-destructive/10` 是否仍清晰 — 这是验收标准里的一条.

左边框会占用 2px 宽度, 需确认不导致列错位 (给行容器加 `border-l-2 border-transparent` 作为默认态, 保证有无高亮时内容起始位置一致).

---

## 六, store 扩展

只增不改 A/B/C 已有字段:

```ts
// 视图
softWrap: boolean;
viewFormat: ViewFormat;
columns: Record<LogcatColumn, boolean>;

// 进程映射
processMap: Map<string, string>;
processMapUpdatedAt: number;
processMapLoading: boolean;
processMapKey: string | null;
processMapError: string | null;

setSoftWrap(enabled: boolean): void;
setViewFormat(format: ViewFormat): void;
setColumn(column: LogcatColumn, visible: boolean): void;
beginProcessMapSession(key: string): void;
beginProcessMapRefresh(key: string): void;
completeProcessMapRefresh(key: string, entries: ProcessEntry[], updatedAt: number): void;
failProcessMapRefresh(key: string, error: string): void;
```

**移除** (C 阶段的包名解析): `packagePids`, `resolvedPackages`, `packageResolving`, `setPackagePids`.

进程快照成功发布不重建索引, 因为历史行身份不可变. 映射只影响后续 `normalizeLine`; 新行按当前有效快照正常增量求值. `currentPackage` 变化时, 仅当查询含 `package:mine` 才重建索引.

---

## 七, 组件状态矩阵 (本任务新增部分)

**LogcatViewMenu**

| 状态 | 表现 |
|---|---|
| 默认态 | 当前 format 高亮, 各列开关反映当前 columns |
| 自定义态 | columns 不等于任何预设时, 两个 format 按钮均不高亮 |
| 禁用态 | 无设备时整个菜单禁用 |

**LogcatRow (本任务改动)**

| 状态 | 表现 |
|---|---|
| soft-wrap 关闭 | 固定 20px, message `whitespace-pre` + ellipsis, 无 measure ref |
| soft-wrap 开启 | 高度自适应, message `whitespace-pre-wrap break-words`, 挂 measure ref |
| crash 行 | 背景 + 左边框强调 |
| stacktrace 行 | 弱化左边框 |
| 包名列开启但该行入库时映射未知 | 该列显示空, 不显示占位符文字, 不查询最新快照回填 |

`LogcatRow` 的 props 需要加入 `columns` 与 `softWrap`. 注意这会影响 memo 效果: 这两个值变化时全部行都要重渲染, 但它们只在用户操作时变化, 属低频, 可接受. **不要**为此把它们改成从 store 自取 — 那会让行组件订阅 store 并破坏 memo (B 的设计明确要求行组件只吃 props).

---

## 八, 实现约束

1. **不允许** soft-wrap 默认开启.
2. **不允许**在 soft-wrap 关闭时挂 measure ref 或走任何测量路径.
3. **不允许**用 merge 语义更新 `processMap`, 必须整体替换.
4. **不允许**在映射未知或过期时显示任何猜测的包名.
5. **不允许**让 `package:` 升级后匹配范围缩小.
6. **不允许**在映射刷新后回填历史行, 也不允许渲染或求值现场查最新 Map; `processName` / `packageName` 只在入库时固化.
7. **不允许**让 `LogcatRow` 订阅 store (会破坏 memo), 新增的 `columns` / `softWrap` 走 props.
8. **不允许**因进程表轮询重建历史索引; 只有 `package:mine` 的当前包变化需要重建.
9. **不允许**把 `line.time.slice(6)` 这类硬编码保留, 时间拆分要走 `splitTimestamp` 纯函数.
10. 设备端进程表读取不得拼接用户输入进 shell 命令.
11. 崩溃高亮只用语义 token; 行容器默认态需 `border-l-2 border-transparent` 以避免列错位.

---

## 九, spec 更新 (Phase 3.3)

| 文件 | 改动 |
|---|---|
| `backend/quality-guidelines.md` | logcat 场景补 `list_device_processes` 契约: 命令形态, `-o PID,NAME` 与 `ps -A` 回退解析规则, 表头跳过, 非数字 PID 跳过, 内核线程名保留原样; 补前端缓存失效规则 (整体替换而非 merge, 未知 PID 显示空, 切设备清空) 与其理由 (PID 复用会导致错误归属) |
| `frontend/quality-guidelines.md` | 更新 "Scenario: Logcat Query Language": 加入 `process:` 键; `package:` 实现说明改为基于正向映射; 移除 `pidof` 多进程覆盖不全的限制条目 (已解决); 补 `EvalContext` 的变化 |
| `frontend/component-guidelines.md` | 补两条: "虚拟列表行组件必须 memo 化且只吃 props, 不订阅 store"; "动态行高必须有显式的 measure 时机与关闭时的快路径, 不允许常开测量" |
| `frontend/directory-structure.md` | 目录树补 `lib/logcatView.ts`, `components/logcat/LogcatViewMenu.tsx` |
