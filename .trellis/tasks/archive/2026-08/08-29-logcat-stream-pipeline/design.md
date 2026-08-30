# 子任务 A: 数据通道与会话重构 — 技术设计

> 共享契约见父任务 `design.md` 第四节. 本文档只展开本任务负责的实现细节.
> 设计原则 (热路径不做 O(窗口) 工作 / 渲染与数据解耦 / 状态正交) 见父任务 `design.md` 第一节.

---

## 一, 后端

文件: `src-tauri/src/commands/logcat.rs`

### 1.1 协议变更对照

| 项 | 现状 | 变更后 |
|---|---|---|
| 事件通道 | `logcat-line`, 每行一次 | `logcat-batch`, 每批一次 |
| 退出通知 | 无 | `logcat-exit` |
| 进程管理 | 全局单例 `LOGCAT_CHILD` | `HashMap<String, LogcatSession>` |
| `start_logcat` | `-> Result<(), String>` | `-> Result<LogcatSessionInfo, String>` |
| `stop_logcat` | 无参 | `(serial, session_id)`, 校验后才 kill |
| stderr | `Stdio::null()` | `Stdio::piped()`, 保留尾部摘要 |
| `LogcatLine.serial` | 每行携带 | 移除, 上移到批次层 |

### 1.2 批量聚合

```rust
const BATCH_MAX_LINES: usize = 200;
const BATCH_FLUSH_INTERVAL: Duration = Duration::from_millis(50);
```

用 `tokio::time::timeout` 同时表达两个触发条件:

```rust
let mut batch: Vec<LogcatLine> = Vec::with_capacity(BATCH_MAX_LINES);
loop {
    match tokio::time::timeout(BATCH_FLUSH_INTERVAL, lines.next_line()).await {
        Ok(Ok(Some(line))) => {
            batch.push(parse_logcat_line(&line));
            if batch.len() >= BATCH_MAX_LINES {
                flush(&app, &serial, session_id, &mut batch);
            }
        }
        Ok(Ok(None)) => {                       // stdout EOF, 进程结束
            flush(&app, &serial, session_id, &mut batch);
            emit_exit(&app, &serial, session_id, "eof", stderr_tail());
            break;
        }
        Ok(Err(err)) => {                       // 读取失败
            flush(&app, &serial, session_id, &mut batch);
            emit_exit(&app, &serial, session_id, "error", err.to_string());
            break;
        }
        Err(_elapsed) => {                      // 时间窗到期: 有就发, 空则继续等
            flush(&app, &serial, session_id, &mut batch);
        }
    }
}
```

`flush` 在 batch 为空时直接返回, 不 emit 空批次.

**常量取值依据**: 50ms 对应 20 次/秒, 低于 60fps 每帧预算, 人眼感知不到延迟; 200 行是"单批解析与序列化成本仍远小于一帧"的经验值. 高流量由行数上限主导, 低流量由时间窗主导, 保证单行日志最多延迟 50ms. 两个常量与前端窗口容量无耦合.

**退出后清理**: reader 循环 break 之后, 从 `LOGCAT_SESSIONS` 中移除该 serial 的条目, 但仅当其 session_id 仍匹配 (避免误删已经被新会话替换的条目).

### 1.3 会话管理

```rust
struct LogcatSession {
    child: tokio::process::Child,
    session_id: u64,
}

static LOGCAT_SESSIONS: LazyLock<Mutex<HashMap<String, LogcatSession>>> =
    LazyLock::new(|| Mutex::new(HashMap::new()));
static NEXT_SESSION_ID: AtomicU64 = AtomicU64::new(1);
```

`start_logcat`: 分配 session_id -> spawn -> 若同 serial 已有会话则先 kill 再替换 -> spawn reader task -> 返回 `LogcatSessionInfo`.

`stop_logcat` 必须校验 session_id:

```rust
#[tauri::command]
pub async fn stop_logcat(serial: String, session_id: u64) -> Result<(), String> {
    let mut sessions = LOGCAT_SESSIONS.lock().await;
    // session_id 不匹配说明这是一个迟到的停止请求, 静默忽略
    if sessions.get(&serial).is_some_and(|s| s.session_id == session_id) {
        if let Some(mut session) = sessions.remove(&serial) {
            let _ = session.child.kill().await;
        }
    }
    Ok(())
}
```

不同 serial 可并存会话, 为将来多设备同时观察留出空间; 本任务前端仍只观察选中设备.

### 1.4 载荷

```rust
#[derive(serde::Serialize, Clone)]
pub struct LogcatSessionInfo { pub serial: String, pub session_id: u64 }

#[derive(serde::Serialize, Clone)]
pub struct LogcatBatch {
    pub serial: String,
    pub session_id: u64,
    pub lines: Vec<LogcatLine>,
}

#[derive(serde::Serialize, Clone)]
pub struct LogcatExit {
    pub serial: String,
    pub session_id: u64,
    pub reason: String,   // "eof" | "error"
    pub detail: String,   // stderr 尾部摘要, 可为空
}
```

`LogcatLine` 保留 `time / level / tag / pid / tid / message / raw`, 移除 `serial`. `parse_logcat_line` 签名简化为 `fn parse_logcat_line(raw: &str) -> LogcatLine`.

**解析语义完全不变**: 正则仍是文件级 `LazyLock`, 仍在首个 `: ` 处分割, 无法解析仍 fallback 为 level `I` + `message = raw`. 既有 6 个单测只去掉 `serial` 参数与断言, 其余断言逐条保留.

### 1.5 stderr

`Stdio::piped()`, 由独立 task 读取, 只保留尾部约 2KB 到 `Arc<Mutex<String>>`. 退出时作为 `LogcatExit.detail`. 这样 "device unauthorized", "device offline" 之类原因能真正到达用户.

**注意**: stderr task 必须能随子进程结束而自然退出, 不得持有会阻止进程回收的句柄.

---

## 二, 前端纯逻辑层

文件: `src/lib/logcat.ts` + `src/lib/logcat.test.ts`

### 2.1 行结构

```ts
export type LogLevel = "V" | "D" | "I" | "W" | "E" | "F";
export const LEVELS: readonly LogLevel[] = ["V", "D", "I", "W", "E", "F"];

export interface LogcatEntry {
  seq: number;
  time: string;
  level: LogLevel;
  tag: string;
  pid: string;
  tid: string;
  message: string;
  raw: string;
  searchKey: string;   // (tag + "\u0000" + message).toLowerCase(), 入库算一次
}

export function normalizeLine(line: BackendLogcatLine, seq: number): LogcatEntry;
```

`seq` 取代现状的 `lineIdRef` 自增 id, 但用途更重: 同时是虚拟列表 key, 过滤索引的元素, 以及从索引反查行的地址.

`searchKey` 是 R6 的落点. 用 `\u0000` 连接而非空格, 避免"跨越 tag 与 message 边界的伪命中"(例如 tag 结尾 + message 开头恰好拼成关键字).

### 2.2 定容环形缓冲

```ts
export const LOGCAT_CAPACITY = 10000;

export class LogcatRingBuffer {
  private readonly slots: (LogcatEntry | undefined)[];
  private start = 0;     // 最老元素的物理下标
  private length = 0;
  private baseSeq = 0;   // slots[start] 那一行的 seq

  constructor(capacity?: number);
  push(entry: LogcatEntry): void;                 // 满则覆盖最老, O(1), 无复制
  at(index: number): LogcatEntry | undefined;     // index 0 = 最老
  bySeq(seq: number): LogcatEntry | undefined;    // O(1)
  get count(): number;
  get oldestSeq(): number;
  clear(): void;
}
```

`bySeq` 的 O(1) 依据: seq 连续递增且淘汰严格 FIFO, 故 `物理下标 = (start + (seq - baseSeq)) % capacity`, 只要 `0 <= seq - baseSeq < length` 就命中, 否则该行已被淘汰.

**容量 5000 -> 10000 的理由**: 现状 5000 与后端 `-T 5000` 相等, 意味着初始 dump 一进来窗口就满, 之后每来一行就淘汰一行历史. 提到 10000 让初始 dump 之后仍有等量空间容纳新日志.

### 2.3 过滤谓词 (过渡结构)

```ts
export interface LogcatFilter {
  minLevel: LogLevel | "";            // "" = 不限, 否则保留 >= 该等级
  search: string;                     // 已 debounce 且已 toLowerCase
  tag: string | null;                 // 精确匹配
  pidWhitelist: Set<string> | null;   // null = 不限
}

export function matchesFilter(entry: LogcatEntry, filter: LogcatFilter): boolean;
```

语义与现状**逐条对齐**, 本任务不改变过滤语义, 只改变执行成本:
- 等级为阈值语义 (`LEVELS.indexOf(entry.level) >= LEVELS.indexOf(minLevel)`).
- 搜索命中 tag 或 message, 改为对 `entry.searchKey` 做一次 `includes`.
- tag 精确匹配.
- 应用过滤按 PID 集合.

`LogcatFilter` 是**过渡结构**, 子任务 C 引入查询 AST 后应当删除. 这一点记入父任务集成评审检查项.

---

## 三, store

文件: `src/store/logcat.ts` + `src/store/logcat.test.ts`

### 3.1 形状 (本任务负责的字段)

```ts
interface LogcatStore {
  // 会话身份
  serial: string | null;
  sessionId: number | null;
  streamState: "idle" | "starting" | "live" | "disconnected";
  disconnectDetail: string;

  // 数据: 可变对象 + revision 驱动渲染
  buffer: LogcatRingBuffer;
  filteredSeqs: number[];
  filteredHead: number;
  totalCount: number;
  filteredCount: number;
  revision: number;

  // 流控
  streamMode: "live" | "paused";
  pausedBacklog: number;

  // 过滤 (过渡)
  filter: LogcatFilter;
  searchInput: string;      // 未 debounce 的输入值

  // actions
  beginSession(serial: string, sessionId: number): void;
  appendBatch(lines: BackendLogcatLine[], sessionId: number): void;
  markDisconnected(sessionId: number, detail: string): void;
  setStreamState(state: LogcatStore["streamState"]): void;
  setMinLevel(level: LogLevel | ""): void;
  setSearchInput(value: string): void;
  commitSearch(value: string): void;      // debounce 到期后调用
  setTagFilter(tag: string | null): void;
  setPidWhitelist(pids: Set<string> | null): void;
  pause(): void;
  resume(): void;
  clearScreen(): void;
  reset(): void;
}
```

子任务 B/C/D 会往这个 store 追加字段 (视口 / 查询 / 视图三组), 各自只增不改他人字段. 分组见父任务 `design.md` 第 4.4 节.

### 3.2 为什么用 revision 而不是不可变数组

zustand 默认按引用比较. `buffer` 与 `filteredSeqs` 都是被原地修改的可变对象, 引用不变, 因此必须靠 `revision` 这个不可变数字触发订阅者更新. 组件只订阅 `revision` 与几个计数字段, 拿到通知后通过 `buffer.bySeq(...)` 现场取值.

这是项目里第一次出现"可变数据 + version 驱动"模式, 属于对 `state-management.md` 的补充, Phase 3.3 必须写进 spec, 否则后续维护者会误以为可以直接对 `buffer` 做不可变替换 —— 那会抵消整个重构.

### 3.3 过滤索引维护

```
filteredSeqs: number[]   严格升序
filteredHead: number     逻辑起点偏移
逻辑长度 = filteredSeqs.length - filteredHead
```

- **追加一批**: 只对新行逐个判定谓词, 通过的 `push(seq)`. 成本 O(批次大小).
- **buffer 淘汰**: 淘汰使 `oldestSeq` 上升, 索引头部出现失效 seq. **不做 slice** (O(n) 复制), 而是推进 `filteredHead`; 仅当 `filteredHead` 超过容量一半时才真正压缩一次, 均摊 O(1).
- **过滤条件变更**: 全量重建, 遍历 buffer 的 `count` 行. 用户操作触发的低频路径, O(容量) 可接受.

**回退点**: 若增量维护在实现中暴露出难以收敛的边界问题 (淘汰与过滤变更交错), 允许退化为"每批之后全量重算索引". 因为 R7 已把更新频率压到每帧一次, 全量重算量级是每秒 60 次 x 10000 行判定, 仍然可用, 只是不够漂亮. 退化必须记入 `implement.md` 并保留 `searchKey` 与 debounce 优化.

### 3.4 会话校验与暂停语义

- `appendBatch` 首先校验 `sessionId`, 与当前不符直接丢弃. 这是"切设备不串行"的前端保障, 与后端 1.3 形成双保险.
- `markDisconnected` 同样校验 sessionId, 避免旧会话的退出事件把新会话标成断开.
- `streamMode === "paused"` 时, 批次写入 store 内部 pending 数组而不进 buffer, 只累加 `pausedBacklog`; `resume()` 一次性倒入并追加索引. pending 数组需有上限 (超过容量则丢弃最老), 避免长时间暂停导致内存无界增长.

---

## 四, 流生命周期 hook

文件: `src/hooks/useLogcatStream.ts` (新建 `hooks/` 目录)

单一职责: 把后端事件安全地喂进 store, 并管好子进程生命周期.

```
selectedDevice 变化
  -> store.reset()
  -> store.setStreamState("starting")
  -> 先注册 logcat-batch / logcat-exit 监听          [顺序关键]
  -> startLogcat(serial) 得到 { serial, session_id }
  -> store.beginSession(serial, session_id)
  -> store.setStreamState("live")

批次事件回调
  -> 只 push 进 ref 缓冲, 不碰 store
  -> 若无待执行帧, requestAnimationFrame(flush)

flush (每帧最多一次)
  -> 取出 ref 缓冲全部批次, 合并为一次 store.appendBatch()

退出事件回调
  -> store.markDisconnected(session_id, detail)

cleanup / 设备切换
  -> 取消待执行 rAF
  -> unlisten()
  -> stopLogcat(serial, sessionId)
```

**监听必须先于 `startLogcat` 注册.** 这是现状代码已踩过并写了注释的坑: `-T 5000` 会在毫秒级灌入数千行, 先起进程会丢掉整个初始 burst. 注释要保留并在 Phase 3.3 升级为 spec 条目.

**用 rAF 而非 setInterval**: rAF 与渲染帧天然对齐, 且页面不可见时被浏览器降频, 符合"切走后不浪费渲染". 代价是页面隐藏时 rAF 可能完全暂停, 因此 ref 缓冲必须有上限保护 (超过 `LOGCAT_CAPACITY` 时丢弃最老), 避免长时间隐藏后一次性 flush 巨量数据.

---

## 五, 桥接层

文件: `src/lib/tauri.ts`

```ts
export interface LogcatLine { time, level, tag, pid, tid, message, raw }   // 去掉 serial
export interface LogcatSessionInfo { serial: string; session_id: number }
export interface LogcatBatch { serial: string; session_id: number; lines: LogcatLine[] }
export interface LogcatExit { serial: string; session_id: number; reason: string; detail: string }

export async function startLogcat(serial: string): Promise<LogcatSessionInfo>;
export async function stopLogcat(serial: string, sessionId: number): Promise<void>;
export async function onLogcatBatch(cb: (b: LogcatBatch) => void): Promise<UnlistenFn>;
export async function onLogcatExit(cb: (e: LogcatExit) => void): Promise<UnlistenFn>;
```

移除 `onLogcatLine`. `clearLogcat` / `exportLogcat` / `getPackagePids` 签名不变.

字段名沿用后端 serde 输出的 `session_id` 蛇形命名, 与项目既有做法一致 (参考 `DeviceDetail.android_version`, `ForwardRule.local_port`).

---

## 六, 现有组件的最小改造

文件: `src/components/Logcat.tsx` (保持单文件, 不拆分)

改造范围严格限定为"换数据来源":

| 现状 | 改为 |
|---|---|
| `useState<LogcatEntry[]>` + `appendLogEntries` | 订阅 store 的 `revision` / `filteredCount` / `totalCount` |
| `onLogcatLine` 内联订阅与 cleanup | 调用 `useLogcatStream()` |
| `filtered` useMemo 全量重算 | 读 store 的过滤索引 |
| `virtualizer` 的 `count` / `getItemKey` / 行取值 | 改为基于 `filteredSeqs` 与 `buffer.bySeq` |
| `lineIdRef` | 由 store 内部的 seq 分配取代 |
| 四套过滤控件的本地 state | 改为读写 store 的 `filter` 与 `searchInput` |
| 搜索输入直接进过滤 | 输入进 `searchInput`, debounce 后 `commitSearch` |

**保持不变**: 工具栏 DOM 结构与样式, 列宽 (`5.5rem` / `w-3` / `w-40` / `w-12` / flex-1), `LEVEL_COLORS`, 行高 20px, 暂停按钮的三分支行为, `handleScroll` / `handleUserScrollIntent` / `programmaticScrollRef` 的现有跟随实现, PID 5 秒轮询, 应用列表懒加载, 导出与清屏行为.

唯一允许的可见变化: 工具栏状态指示器要能表达 `disconnected` (现状断开时仍显示绿点). 最小实现即可, 完整的断开提示条属于子任务 B.

---

## 七, 数据流

### 7.1 启动

```
selectedDevice 变化
  -> useLogcatStream: reset -> 注册监听 -> invoke start_logcat
       后端: 分配 session_id -> kill 同 serial 旧会话 -> spawn adb logcat -T 5000 -v threadtime
             -> 存入 HashMap -> spawn reader task + stderr task
       返回 { serial, session_id }
  -> beginSession, streamState = "live"
  -> reader task 按 200 行/50ms emit logcat-batch
  -> 回调写 ref 缓冲 -> rAF flush -> appendBatch (校验 sessionId)
  -> normalizeLine x N -> buffer.push x N -> 索引增量追加 -> revision++
  -> 组件重渲染
```

### 7.2 切设备 (A -> B)

```
selectedDevice: A -> B
  -> A 的 cleanup: 取消 rAF, unlisten, invoke stop_logcat { serial: A, session_id: idA }
  -> B 的 effect: reset, 注册监听, start_logcat(B) -> idB
  -> 若 A 的 stop 迟到: HashMap 中 A 已移除或 session_id 不匹配 -> 空操作
  -> 若 A 的残留 batch 迟到: appendBatch 发现 sessionId != idB -> 丢弃
```

### 7.3 流中断

```
adb 断连 / 设备拔出
  -> next_line() 返回 None 或 Err
  -> flush 残余批次 -> emit logcat-exit { reason, detail }
  -> 从 HashMap 移除该会话 (session_id 匹配时)
  -> markDisconnected: streamState = "disconnected"
  -> 工具栏指示器改为断开态, 已有日志保留
```

---

## 八, 实现约束 (防止危险捷径)

1. **不允许**在 `appendBatch` 里做任何与窗口总行数成正比的操作 (除按 3.3 回退点显式降级并记录).
2. **不允许**把 `buffer` 或 `filteredSeqs` 做不可变复制来"顺应" zustand 习惯, 那会直接抵消本任务.
3. **不允许**在事件回调里直接调用 store action, 必须经 ref 缓冲 + rAF.
4. **不允许**先 `startLogcat` 再注册监听.
5. **不允许**用无参或只带 serial 的 `stop_logcat`.
6. **不允许**在本任务内拆分组件, 改名文件, 或改动交互语义 (属于子任务 B, 混做会让两个任务都无法独立验证).
7. **不允许**扩大过滤语义. 本任务的过滤行为必须与现状逐条一致, 新语义留给子任务 C.
8. `parse_logcat_line` 的 fallback 行为不得改动.
9. 移除 `LogcatLine.serial` 必须三处同步 (Rust 结构体, TS interface, 单测).
10. stderr task 不得阻止子进程回收.

---

## 九, spec 更新 (Phase 3.3)

| 文件 | 改动 |
|---|---|
| `backend/quality-guidelines.md` | 重写 "Scenario: Streaming Logcat Format and Parsing": 通道改 `logcat-batch` + `logcat-exit`; 补三个载荷结构体契约; 补 per-serial + session_id 校验规则 (含"只按 serial 停止不安全"的理由); 补批量常量语义; 记录 `LogcatLine` 去掉 `serial`; 补 stderr 摘要要求; 更新"Tests Required" |
| `frontend/state-management.md` | store 清单补 `useLogcatStore`; 新增"可变数据 + revision 驱动"模式条目, 写明适用条件 (定容高频缓冲) 与代价 (失去不可变比较, 必须靠 revision) |
| `frontend/hook-guidelines.md` | 本任务新建了 `hooks/` 目录, 需补最小说明 (完整的 hook 约定由子任务 B 补齐) |
