# Logcat 日志功能重构 — 架构总纲 (父任务)

> 这份文档只写**跨子任务的共享内容**: 设计原则, 明确拒绝的方向, 目标文件结构, 共享数据契约, spec 更新总清单.
> 每个子任务的具体设计在各自的 `design.md` 里. 遇到冲突时, 以本文档的共享契约为准.

---

## 一, 设计原则

日志页是一个**长时间驻留的高频数据观察面板**. 它和这个 app 里其他工具卡片的性质完全不同: 其他工具是"点一下, 做一件事, 给个 toast", 日志页是"打开后持续几十分钟, 每秒可能进来上千行".

由此确立五条原则, 4 个子任务都受其约束:

1. **热路径上不做 O(窗口大小) 的工作.** 每来一批日志只允许做与"这批的行数"成正比的工作, 不允许做与"当前窗口总行数"成正比的工作. 这是所有结构选择的第一性依据.
2. **渲染频率与数据频率解耦.** 数据可以每秒来一万行, 但 React 每帧最多更新一次.
3. **观察现场属于用户, 不属于组件.** 日志内容, 查询条件, 滚动位置, 暂停状态, 视图格式都是用户攒出来的现场, 不能因为组件卸载而消失.
4. **状态语义必须正交.** "数据是否在流入"和"视口是否跟着底部跑"是两件独立的事, 用两个独立状态, 两个独立控件表达, 不合并.
5. **查询是唯一的过滤入口.** 一旦引入查询语言 (子任务 C), 就不再保留并行的下拉框/按钮式过滤. 两套过滤共存会产生"到底谁生效"的歧义.

## 二, 明确拒绝的方向

- **拒绝**继续用"每行一个事件 + 每行一次 setState"的通道. 无论前端怎么优化都摊不掉每行的 IPC 序列化成本.
- **拒绝**把日志缓冲存成 React 不可变数组. 定容窗口下的不可变追加必然带来每次 O(容量) 的复制.
- **拒绝**用条件渲染 `{activeTab === "logcat" && <LogcatPanel />}` 承载日志页. 它在语义上等价于"离开即销毁现场".
- **拒绝**把"暂停"和"回到底部"塞进同一个按钮. 现状 `handlePauseToggle` 的三分支就是这个合并的直接后果.
- **拒绝**让"清屏"顺带执行 `adb logcat -c`. 屏幕是前端的, 缓冲区是设备的, 不该由一个按钮同时决定.
- **拒绝**为了实现查询语言而引入解析器生成库. 语法规模很小 (7 个键, 3 个修饰符, 3 个运算符), 手写递归下降更可控, 也更容易单测.
- **拒绝**把 soft-wrap 做成默认开启. AS 默认也是关闭的; 动态行高测量是性能与滚动稳定性的主要风险源, 应由用户显式开启.

---

## 三, 目标文件结构

4 个子任务合计的最终形态. 括号标注由哪个子任务引入或改动.

```
src/
├── App.tsx                          # (B) 日志页改懒挂载 + 常驻; import 路径更新
├── components/
│   ├── logcat/                      # (B) 新建 feature 目录
│   │   ├── LogcatPanel.tsx          # (B) 容器: 空状态, 组装, 挂 hooks
│   │   ├── LogcatToolbar.tsx        # (B) 动作区; (C) 查询框接入; (D) 视图格式菜单接入
│   │   ├── LogcatActions.tsx        # (B) 清屏, 清设备缓冲, Restart, 导出动作
│   │   ├── LogcatQueryInput.tsx     # (C) 查询输入框 + 补全 + 错误提示
│   │   ├── LogcatQuerySuggestions.tsx # (C) 查询补全面板
│   │   ├── LogcatList.tsx           # (B) 虚拟滚动 + 回到底部浮标; (D) 动态行高
│   │   ├── LogcatRow.tsx            # (B) 单行 memo 化; (D) soft-wrap, 列配置, 高亮
│   │   └── LogcatViewMenu.tsx       # (D) Standard/Compact 与字段开关
│   └── QuickKeys.tsx                # (B) 原 LogcatViewer.tsx 改名, 内容不变
├── hooks/                           # (A) 新建目录
│   ├── useLogcatStream.ts           # (A) 订阅 + rAF 批量 flush + 会话生命周期
│   ├── logcatStreamController.ts    # (A) 可测试的事件/session controller
│   ├── useFollowScroll.ts           # (B) 视口跟随 React 绑定
│   ├── followScrollController.ts    # (B) 锚定与跟随状态机
│   ├── followScrollModel.ts         # (B) 纯滚动模型
│   ├── activityPollingController.ts # (C/D) 前台 Activity + 进程共享轮询
│   ├── useLogcatPackageResolution.ts # (C/D) 包/进程补全与状态
│   └── useLogcatQueryCompletions.ts # (C) 查询补全采样
├── lib/
│   ├── logcat.ts                    # (A) LogcatEntry, LogcatRingBuffer, 常量, normalizeLine
│   ├── logcat.test.ts               # (A)
│   ├── logcatQuery.ts               # (C) tokenizer, parser, AST, evaluator
│   ├── logcatQuery.test.ts          # (C)
│   ├── logcatQueryCompletion.ts     # (C/D) 补全与安全文本替换
│   ├── logcatCrash.ts               # (C) is:crash / is:stacktrace 启发式
│   ├── logcatCrash.test.ts          # (C)
│   ├── logcatView.ts                # (D) 视图格式模型与列配置
│   ├── logcatView.test.ts           # (D)
│   └── tauri.ts                     # (A) 事件与 command 封装更新; (D) PID->包名 command
└── store/
    ├── logcat.ts                    # (A) 建立; (B/C/D) 各自扩展字段
    └── logcat.test.ts               # (A) 建立; (B/C/D) 各自补测

src-tauri/src/commands/logcat.rs     # (A) 批量 emit, 会话管理, stderr; (D) PID->包名映射
```

**被删除的文件**: `src/components/Logcat.tsx` (内容迁入 `components/logcat/`), `src/components/LogcatViewer.tsx` (改名为 `QuickKeys.tsx`). 两者都在子任务 B 完成时消失.

---

## 四, 共享数据契约

这一节是 4 个子任务的接口面. 任何子任务要改这里的内容, 必须先更新本文档.

### 4.1 后端事件协议 (A 建立)

| 通道 | 载荷 | 说明 |
|---|---|---|
| `logcat-batch` | `LogcatBatch { serial, session_id, lines: Vec<LogcatLine> }` | 取代现状每行一次的 `logcat-line` |
| `logcat-exit` | `LogcatExit { serial, session_id, reason, detail }` | `reason` 为 `"eof"` 或 `"error"`, `detail` 为 stderr 尾部摘要 |

| command | 签名 |
|---|---|
| `start_logcat` | `(app, serial) -> Result<LogcatSessionInfo, String>`, `LogcatSessionInfo { serial, session_id }` |
| `stop_logcat` | `(serial, session_id) -> Result<(), String>`, **必须校验 session_id** |
| `clear_logcat` | `(app, serial) -> Result<(), String>`, 不变 |
| `export_logcat` | `(app, serial, content) -> Result<ExportResult, String>`, 不变 |
| `get_package_pids` | `(app, serial, pkg) -> Result<Vec<String>, String>`, 保留兼容 API, 不再用于 Logcat 查询 |
| `list_device_processes` | `(app, serial) -> Result<Vec<ProcessEntry>, String>`, `ProcessEntry { pid, name }` |

`LogcatLine` 移除现状的 `serial` 字段 (批次层已携带, 逐行重复在 5000 行初始 dump 时是纯浪费), 保留 `time / level / tag / pid / tid / message / raw`.

同一 serial 的 Restart 必须由 serial-scoped lock 串行化: 先从会话表移除旧 child, 完成 kill + wait, 再 spawn 并注册新 child. mDNS transport 禁止旧流与新流重叠; 旧 child 停止失败时必须中止 Restart, 不得继续创建新流. 不同 serial 的启动锁相互独立.

### 4.2 前端行结构 (A 建立, C/D 扩展)

```ts
export type LogLevel = "V" | "D" | "I" | "W" | "E" | "F";

export interface LogcatEntry {
  seq: number;        // (A) 全局单调递增, 永不复用. 同时是虚拟列表 key 与索引地址
  time: string;
  level: LogLevel;
  tag: string;
  pid: string;
  tid: string;
  message: string;
  raw: string;
  searchKey: string;  // (A) 入库时算一次: (tag + "\u0000" + message).toLowerCase()
  // 以下由后续子任务追加, 同样在入库时一次性计算:
  crashKind: "crash" | "stacktrace" | null;   // (C) is: 谓词的判定结果, 入库必算
  processName: string | null;                  // (D) 由可信设备进程快照解析
  packageName: string | null;                  // (D) 从应用式进程名派生
}
```

**规则**: 任何"每行都要用于判定或展示"的派生值, 一律在入库时算一次并存进 `LogcatEntry`, 绝不在过滤或渲染时反复计算. 这是原则 1 在行结构上的体现. `searchKey` / `crashKind` / `processName` / `packageName` 都遵循这条. PID 未来可能复用, 因此后续快照不得回填或重解释历史行.

### 4.3 缓冲与索引 (A 建立)

- `LogcatRingBuffer`: 定容环形缓冲, `push` O(1) 无复制, `bySeq(seq)` O(1) (因 seq 连续且淘汰严格 FIFO). 容量常量 `LOGCAT_CAPACITY = 10000`.
- 过滤结果不物化成行数组, 只物化成升序的 `filteredSeqs: number[]` 加 `filteredHead` 偏移.
- 虚拟列表数据源: `count = filteredSeqs.length - filteredHead`, `getItemKey = i => filteredSeqs[filteredHead + i]`, 取行 `buffer.bySeq(...)`.

**这个 buffer 是可变对象, 不参与 React 不可变比较.** 渲染由 store 的 `revision: number` 驱动. 这是有意为之的例外, 因为不可变追加必然违反原则 1. 属于对 `state-management.md` 的补充, 必须写进 spec.

### 4.4 store 分层 (A 建立, B/C/D 各自扩展)

`useLogcatStore` 的字段按子任务分组, 各子任务只增不改他人字段:

| 组 | 字段 | 归属 |
|---|---|---|
| 会话身份 | `serial`, `sessionId`, `streamState`, `disconnectDetail` | A |
| 数据 | `buffer`, `filteredSeqs`, `filteredHead`, `totalCount`, `filteredCount`, `revision` | A |
| 流控 | `streamMode` (`live`/`paused`), `pausedBacklog` | A |
| 视口 | `followMode` (`follow`/`detached`), `detachedNewCount`, `anchoredSeq` | B |
| 查询 | `queryInput`, `activeQuery`, `compiledQuery`, `queryError`, `packageRefs`, `processRefs`, `currentPackage` | C/D |
| 进程映射 | `processMap`, `processMapUpdatedAt`, `processMapLoading`, `processMapKey`, `processMapError` | D |
| 视图 | `softWrap`, `viewFormat` (`standard`/`compact`), `columns` | D |

**正交性要求**: `streamMode` 与 `followMode` 必须独立可组合, 4 种组合都要有明确定义的行为. 这是原则 4 的落点, 也是"复刻 AS"在交互层的核心.

### 4.5 过滤谓词的演进路径

- **A 阶段**: 保留现状过滤语义 (等级阈值, 关键字, tag 精确, PID 集合), 只把执行成本降下来. 谓词签名 `matchesFilter(entry, filter): boolean`.
- **C 阶段**: 谓词换成编译后的查询 AST, 签名变为 `evaluate(entry, ast): boolean`. 索引维护机制完全复用, 只换谓词实现.

A 阶段的 `LogcatFilter` 是过渡结构, C 完成后应当删除, 不允许两套过滤并存 (原则 5). 这一点是父任务集成评审的检查项.

---

## 五, 跨子任务的关键技术风险

| 风险 | 影响子任务 | 处置 |
|---|---|---|
| 增量过滤索引在"淘汰与查询变更交错"时出现边界错误 | A (C 放大) | A 的 design 给出显式回退点: 退化为批量后全量重算. 因更新频率已压到每帧一次, 全量重算仍可用 |
| `display:none` 期间虚拟列表测量失效, 切回时空白或滚动漂移 | B (D 放大) | B 切回时在 rAF 中显式 `measure()` 并按 `followMode` 决定恢复 scrollTop 还是吸底; 列入手工冒烟项 |
| soft-wrap 动态行高与高频追加叠加导致滚动抖动 | D | 默认关闭; 开启时才切动态测量; 两条路径都要冒烟 |
| `is:crash` / `is:stacktrace` 启发式误判 | C, D | 只做单行启发式并接受准确率低于 AS; 判定结果存 `crashKind` 避免重复计算; 单测覆盖真实崩溃样本 |
| PID -> 进程快照的缓存失效 (应用重启后 PID 复用) | D | 快照可信期 5 秒, 失败不续期; 逐行入库时固化身份, 未知 PID 保持空且历史行不回填 |

---

## 六, 前后端职责边界

**后端只做**: 起停子进程, 逐行解析, 批量聚合, 退出通知, 会话身份管理, 读取设备 PID -> 进程名快照 (D).

**后端不做**: 过滤 (查询语言的表达力远超 adb 侧过滤, 下推会导致语义分裂), 窗口截断 (容量是前端概念), 排序, 去重, 崩溃判定.

**前端只做**: 缓冲, 索引, 查询编译与求值, 视图, 交互状态.

**前端不做**: 拼接 adb 命令 (一律经 `lib/tauri.ts` 的封装), 直接管理子进程.

---

## 七, spec 更新总清单

代码与 spec 不允许不一致. 每个子任务在自己的 Phase 3.3 更新对应条目, 父任务集成评审时逐条核对.

| spec 文件 | 改动 | 责任子任务 |
|---|---|---|
| `backend/quality-guidelines.md` | 重写 "Scenario: Streaming Logcat Format and Parsing": 事件通道改 `logcat-batch` + `logcat-exit`; 补 `LogcatSessionInfo`/`LogcatBatch`/`LogcatExit` 契约; 补 per-serial + session_id 校验规则; 补批量常量语义; 记录 `LogcatLine` 去掉 `serial`; 补 stderr 摘要要求 | A |
| `frontend/state-management.md` | store 清单补 `useLogcatStore`; 新增"可变数据 + revision 驱动"模式条目, 说明何时允许突破不可变约定及其代价 | A |
| `frontend/directory-structure.md` | 目录树更新 (`components/logcat/`, `QuickKeys.tsx`, `hooks/`, `lib/logcat*.ts`, `store/logcat.ts`); 把"不按 feature 分文件夹"改为"单文件功能保持扁平, 拆成 3 个以上文件的功能建 feature 子目录" | B (D 补充 `logcatView.ts`) |
| `frontend/hook-guidelines.md` | 删除"当前项目无自定义 hooks 文件"; 补 `hooks/` 目录约定与 `use<Feature>` 命名; 补"事件订阅必须先注册后启动进程"与"高频事件用 ref 缓冲 + rAF 合并"两条模式 | B |
| `frontend/quality-guidelines.md` | 新增 "Scenario: Logcat Query Language" 场景: 查询语法契约, 运算符优先级, 错误处理策略, 必需单测矩阵 | C |
| `frontend/component-guidelines.md` | 补"虚拟列表行组件必须 memo 化"与"动态行高需显式 measure 时机"两条 | D |
| `backend/quality-guidelines.md` | 在 logcat 场景中补 PID -> 包名映射 command 的契约与缓存失效规则 | D |

---

## 八, 已确认的决策

- **查询键名沿用 AS 英文** (`tag`, `message`, `level`, `package`, `process`, `is`), 中文只出现在提示文案与补全说明里. 理由是 AS 用户零学习成本; 代价是与界面其余部分的中文风格不一致, 接受.
- **保留引号包裹值作为本项目扩展** (`message:"foo bar"`), 与 AS 的 `\` 转义空格并存. 理由是 `\` 连接对中文用户不直观; 属纯增量, 不与 AS 冲突.

## 九, 继续实现前需要确认

- 缓冲容量 10000 是否满足实际使用. 若真机验证发现历史不够用, 是提前把可配置做进子任务 A, 还是维持常量并另开任务.
- `-T 5000` 初始 dump 行数是否保持. 本设计未改动它, 但它与容量 10000 的配比 (一半窗口给历史) 是一个可讨论的产品选择.
