# 子任务 C: 查询语言 — 技术设计

> 共享契约见父任务 `design.md`. AS 语法依据见 `../08-29-logcat-refactor/research/android-studio-logcat-model.md` 第 2 节.
> 前置: A 的过滤索引架构 (谓词可替换), B 的工具栏拆分.

---

## 一, 语法定义

### 1.1 文法 (EBNF)

```ebnf
query      = or_expr ;
or_expr    = and_expr { "|" and_expr } ;
and_expr   = unary { [ "&" ] unary } ;        (* 省略 & 即隐式 AND *)
unary      = [ "-" ] primary ;
primary    = "(" query ")" | term ;
term       = key_term | bare_text ;
key_term   = key [ modifier ] ":" value ;
key        = "tag" | "message" | "level" | "package" | "is" ;
modifier   = "~" | "=" ;
value      = quoted | unquoted ;
quoted     = '"' { any_char_except_quote } '"' ;
unquoted   = { any_char_except_space_and_operators }   (* "\" 表示空格 *) ;
bare_text  = unquoted ;
```

**优先级**: 括号 > 否定 > AND > OR. 官方文档用 `tag:foo | level:ERROR & package:mine` 与 `(tag:foo | level:ERROR) & package:mine` 的对比确认了 `&` 高于 `|`.

**隐式 AND 的解析要点**: `and_expr` 中相邻两个 `unary` 之间没有运算符时视为 AND. 这要求 tokenizer 保留空白信息或 parser 能识别"下一个 token 是新的 term 起始". 采用后者: parser 在 `and_expr` 循环里检查下一个 token 是否可以开始一个 `unary` (即不是 `|`, `)`, EOF), 若可以就继续按 AND 组合.

### 1.2 值的空格处理

- `\` 表示空格 (AS 的做法): `message:This\is\sample` -> 值 `"This is sample"`.
- `"..."` 包裹 (本项目扩展): `message:"This is sample"` 等价. 加这个是因为 `\` 连接对中文用户不直观; 属纯增量, 不与 AS 冲突.

### 1.3 键的语义

| 键 | 匹配对象 | 默认匹配方式 |
|---|---|---|
| `tag` | `entry.tag` | 包含 (大小写不敏感) |
| `message` | `entry.message` | 包含 (大小写不敏感) |
| `level` | `entry.level` | **阈值** (该等级及更高), 忽略修饰符 |
| `package` | 由包名解析出的 PID 集合与 `entry.pid` 比对 | 集合成员判定, 忽略修饰符 |
| `is` | `entry.crashKind` | 枚举相等, 忽略修饰符 |

裸文本等价于 `message:<文本>`.

**修饰符适用性**: `~` (正则) 与 `=` (精确) 只对 `tag` 与 `message` 有意义. 用在 `level` / `package` / `is` 上应产生编译错误, 而非静默忽略 — 静默忽略会让用户以为生效了.

### 1.4 level 映射

```ts
const LEVEL_NAMES: Record<string, LogLevel> = {
  VERBOSE: "V", DEBUG: "D", INFO: "I", WARN: "W", ERROR: "E", ASSERT: "F",
  V: "V", D: "D", I: "I", W: "W", E: "E", F: "F",   // 本项目扩展: 直接接受字母
};
```

大小写不敏感. 阈值语义: `LEVELS.indexOf(entry.level) >= LEVELS.indexOf(queryLevel)`, 与 A 阶段等级按钮语义一致.

注意 AS 用 `ASSERT`, 设备端字母是 `F` (Fatal). 这个错位要在补全提示里说明.

---

## 二, 实现结构

文件: `src/lib/logcatQuery.ts` + `src/lib/logcatQuery.test.ts`

### 2.1 三段式

```
查询文本 --tokenize--> Token[] --parse--> QueryNode (AST) --evaluate--> boolean
         (低频)                (低频)                    (高频)
```

编译 (tokenize + parse) 只在查询变更时发生; 求值在每行入库与索引重建时发生. 这个分界决定了所有性能相关的取舍.

### 2.2 Token

```ts
type TokenKind = "key" | "text" | "and" | "or" | "not" | "lparen" | "rparen";

interface Token {
  kind: TokenKind;
  start: number;      // 在原文中的位置, 用于错误提示定位
  end: number;
  // key token 专属:
  key?: QueryKey;
  modifier?: "regex" | "exact" | null;
  value?: string;     // 已解转义与去引号
  // text token 专属:
  text?: string;
}
```

`start` / `end` 是 R3 (带位置的错误提示) 的基础, tokenize 阶段就要记录.

### 2.3 AST

```ts
type QueryNode =
  | { type: "and"; children: QueryNode[] }
  | { type: "or"; children: QueryNode[] }
  | { type: "not"; child: QueryNode }
  | { type: "tag"; match: Matcher }
  | { type: "message"; match: Matcher }
  | { type: "level"; min: LogLevel }
  | { type: "package"; name: string }        // "mine" 或具体包名
  | { type: "is"; kind: "crash" | "stacktrace" }
  | { type: "always" };                      // 空查询

type Matcher =
  | { kind: "contains"; lowered: string }    // 编译期已 toLowerCase
  | { kind: "exact"; value: string }
  | { kind: "regex"; regex: RE2JS };         // 编译期已构造并缓存, 保证线性时间
```

**关键**: `Matcher` 把"编译期能算的东西"全部前移 — 小写化与正则构造都在这里完成. 求值时 `contains` 直接用 `entry.searchKey.includes(lowered)` 或对应字段, `regex` 直接 `regex.test(...)`, 绝不重新构造.

### 2.4 编译结果

```ts
interface CompileSuccess {
  ok: true;
  ast: QueryNode;
  packageRefs: string[];   // 查询中出现的所有 package 名 (含 "mine"), 供异步解析
  tagRefs: string[];       // 供补全与提示
}

interface CompileFailure {
  ok: false;
  message: string;         // 中文错误描述
  start: number;           // 出错位置
  end: number;
}

export function compileQuery(input: string): CompileSuccess | CompileFailure;
```

`packageRefs` 让调用方知道需要异步解析哪些包名, 不必再遍历 AST.

### 2.5 求值

```ts
export function evaluate(entry: LogcatEntry, ast: QueryNode, ctx: EvalContext): boolean;

interface EvalContext {
  packagePids: Map<string, Set<string>>;   // 包名 -> PID 集合, "mine" 已解析为具体包名后存入
  resolvedPackages: Set<string>;           // 已完成解析的包名, 用于区分"解析中"与"无进程"
}
```

递归求值, 短路: `and` 遇 false 立即返回, `or` 遇 true 立即返回. 节点顺序保持用户书写顺序 (不做代价重排, 避免行为不可预测).

---

## 三, `package:` 的异步解析

这是本任务唯一的异步复杂度来源.

### 3.1 流程

```
查询编译成功 -> 得到 packageRefs
  -> "mine" 替换为 useDeviceStore.currentPackage (为空则该谓词恒 false 并提示"暂无前台应用")
  -> 对每个未解析的包名调用 getPackagePids(serial, pkg)
  -> 结果存入 store 的 packagePids Map, 标记进 resolvedPackages
  -> 解析完成后触发一次索引重建
  -> 复用现状的 5 秒轮询刷新 (应用重启后 PID 会变)
```

### 3.2 "解析中"的语义

必须明确定义, 否则用户会看到列表莫名空掉:

| 状态 | 谓词行为 | UI |
|---|---|---|
| 未解析完成 | 返回 **false** (保守: 不显示无法确认归属的行) | 查询框旁显示 `解析包名 PID...` |
| 解析完成, 有 PID | 集合成员判定 | 显示 `PID 1234, 5678` |
| 解析完成, 无 PID | 返回 false | 显示 `未找到运行中的进程` |
| `mine` 但无前台应用 | 返回 false | 显示 `暂无前台应用` |

选"解析中返回 false"而非 true, 是因为返回 true 会先闪出全部日志再收缩, 视觉上更糟.

### 3.3 已知限制

`pidof` 对多进程应用 (`:remote` 等子进程) 覆盖不全, 继承现状限制. 本任务不解决, 但必须写进 spec. 子任务 D 引入 PID -> 进程名正向映射后可以改善.

---

## 四, 崩溃启发式

文件: `src/lib/logcatCrash.ts` + `src/lib/logcatCrash.test.ts`

### 4.1 判定时机

在 `normalizeLine` (A 阶段建立) 中调用, 结果存 `LogcatEntry.crashKind`. 求值时 O(1) 查字段.

这是父任务共享契约 4.2 那条规则的实例: 任何"每行都要用于判定"的派生值一律入库算一次.

### 4.2 规则

```ts
export type CrashKind = "crash" | "stacktrace" | null;
export function detectCrashKind(level: LogLevel, tag: string, message: string): CrashKind;
```

**crash** (优先级高于 stacktrace):
- `message` 含 `FATAL EXCEPTION`
- `tag === "AndroidRuntime"` 且等级为 `E`/`F` 且含 `Process:` 与 `Exception`
- native tombstone 标志: `tag === "DEBUG"` 且 `message` 含 `*** *** ***`
- ANR: `message` 以 `ANR in ` 开头

**stacktrace**:
- 堆栈帧行: `/^\s+at\s+[\w$.]+\(.*\)/`
- `/^Caused by:\s/`
- `/^\s*\.\.\.\s+\d+\s+more\s*$/`
- 异常首行: `/^[\w.$]+(Exception|Error|Throwable)(:|$)/`
- **与等级无关** (官方明确 `is:stacktrace` 不看 level)

### 4.3 已知误判

必须写进 spec, 让后续维护者知道边界:

- 业务日志里主动打印的异常堆栈会被判为 `stacktrace` — 这是**符合** AS 语义的 (官方: "anything that looks like a Java stacktrace, regardless of the log level").
- 消息正文里出现 `Caused by:` 字样的普通句子会误判.
- Kotlin 协程的堆栈帧格式与 Java 略有差异, 可能漏判.
- 准确率明确低于 AS, 接受.

---

## 五, store 扩展

只增不改 A/B 已有字段:

```ts
queryInput: string;                          // 输入框绑定值
activeQuery: string;                         // 最后一次编译成功的查询文本
compiledQuery: QueryNode;                    // 最后一次编译成功的 AST, 空查询为 always
queryError: CompileFailure | null;
packageRefs: string[];
packagePids: Map<string, Set<string>>;
resolvedPackages: Set<string>;
packageResolving: boolean;
packageResolutionKey: string | null;         // 拒绝旧设备/旧查询的晚到结果
packageResolutionError: string | null;

setQueryInput(value: string): void;          // 只更新输入, 不编译
commitQuery(value: string): void;            // debounce 到期后编译 + 重建索引
appendToQuery(fragment: string): void;       // 行内 tag 点击用
beginPackageResolution(key: string): void;
completePackageResolution(key, packagePids, resolvedPackages): void;
failPackageResolution(key: string, error: string): void;
```

**R3 的落点**: `commitQuery` 编译失败时只写 `queryError`, **不动 `compiledQuery`**, 因此索引不重建, 列表保持上一个有效结果.

**删除**: A 阶段的 `filter` / `searchInput` / `setMinLevel` / `setTagFilter` / `setPidWhitelist` / `commitSearch`, 以及 `lib/logcat.ts` 里的 `LogcatFilter` 与 `matchesFilter`. 索引维护的谓词调用点从 `matchesFilter(entry, filter)` 换成 `evaluate(entry, ast, ctx)` — **索引维护机制本身完全复用 A 的实现, 只换谓词**.

---

## 六, 查询框 UI

文件: `src/components/logcat/LogcatQueryInput.tsx`

### 6.1 布局

替换 B 阶段工具栏里的等级按钮组 + 应用下拉 + 搜索框 + tag chip 四者, 占据工具栏主要宽度:

```
[🔍 查询: package:mine level:WARN -tag:Foo            ⓧ]  [解析状态]
```

- 左侧 `Search` 图标 (沿用现状).
- 右侧清空按钮 (`X`), 仅在有内容时显示.
- 输入框右侧或下方显示包名解析状态与错误提示.
- 语法错误时输入框边框用 `border-destructive`, 下方一行 `text-destructive text-xs` 显示错误描述.

### 6.2 补全

下拉面板, 触发条件: 输入时自动 + `Ctrl/Cmd + Space` 手动 (对齐 AS).

候选来源:

| 上下文 | 候选 |
|---|---|
| 词首 | 五个键名 + `-` 提示 |
| `level:` 后 | 六个等级 (显示为 `WARN (W)` 形式, 说明字母对应) |
| `is:` 后 | `crash`, `stacktrace` |
| `tag:` 后 | 当前 buffer 中出现过的 tag (采样统计, 见 6.3) |
| `package:` 后 | `mine` (附说明"当前前台应用") + 已加载的包名列表 (复用现状 `listPackages` 懒加载) |

键盘: 上下选择, Enter 确认, Esc 关闭. 必须可纯键盘操作.

### 6.3 tag 候选的采集

不为补全维护额外的实时索引 (那会给热路径加负担, 违反原则 1). 改为**按需采样**: 打开补全时遍历当前 buffer 收集 distinct tag, 上限若干 (如 200) 后停止. 一次 O(容量) 的用户触发操作, 可接受.

### 6.4 行内 tag 点击

B 阶段是维护独立 tag 状态; 本任务改为向查询框**追加** `tag:<被点击的 tag>`. 已经作为顶层正向 AND 条件存在时不重复追加; 否定项或 OR 分支里的同值 tag 不算重复. 原查询顶层为 OR 时必须先加括号, 让快捷 tag 约束整个表达式, 而不是只约束最后一个 OR 分支. 这样查询框始终是过滤的唯一真相 (原则 5).

---

## 七, 性能设计

| 位置 | 频率 | 措施 |
|---|---|---|
| tokenize + parse | 查询变更 (debounce 后) | 无特殊要求 |
| 正则构造 | 编译期一次 | 缓存在 AST 的 `Matcher` 节点上 |
| 小写化 | 编译期 (查询侧) + 入库期 (行侧 `searchKey`) | 求值时零 `toLowerCase()` |
| 崩溃判定 | 入库期一次 | 存 `crashKind` |
| `evaluate` | 每行入库 + 索引重建 | 短路求值; 无分配 |
| 包名解析 | 查询变更 + 5 秒轮询 | 结果缓存在 store |
| 查询输入 | 每次按键 | debounce 后才 `commitQuery` |

**正则的代价**: 正则匹配显著慢于 substring. 满窗口 10000 行 x 多个正则节点的重建可能到几十毫秒量级. 缓解: 编译期缓存正则对象; 短路求值让廉价节点先判 (保持用户书写顺序, 不重排). 若真机验证发现含正则的查询重建明显卡顿, 记录现象并考虑对重建做分片 (`requestIdleCallback` 或分帧), 但**不要**在本任务内擅自引入分片复杂度.

---

## 八, 实现约束

1. **不允许**引入解析器生成库. 手写递归下降.
2. **不允许**在 `evaluate` 里构造正则, 做 `toLowerCase()`, 或分配数组/对象.
3. **不允许**保留任何旧过滤控件或 `LogcatFilter` / `matchesFilter` 残留 (原则 5).
4. **不允许**语法错误时清空列表或放行全部 (必须保持上一个有效 AST).
5. **不允许**把修饰符 `~` / `=` 用在 `level` / `package` / `is` 上时静默忽略, 必须报编译错误.
6. **不允许**为补全维护实时 tag 索引, 用按需采样.
7. **不允许**在 `lib/logcatQuery.ts` 或 `lib/logcatCrash.ts` 里 import React 或 Tauri (必须可在 Node 下单测).
8. **不允许**实现 `process:` (归 D), 但要给出明确的"暂不支持"提示.
9. **不允许**修改索引维护机制本身, 只替换谓词.
10. 崩溃判定必须在入库期完成并存字段, 不允许在求值时计算.

---

## 九, spec 更新 (Phase 3.3)

`frontend/quality-guidelines.md` 新增 "Scenario: Logcat Query Language", 按既有场景模板 (Scope/Trigger, Signatures, Contracts, Validation & Error Matrix, Good/Base/Bad Cases, Tests Required, Wrong vs Correct) 写:

- **Signatures**: `compileQuery`, `evaluate`, `detectCrashKind` 及其类型.
- **Contracts**: 完整语法表; 优先级 `括号 > 否定 > AND > OR`; 修饰符适用范围; `level` 名称/字母映射与阈值语义; `package:mine` = 当前前台应用 (与 AS 的语义差异); 编译期前移规则 (正则与小写化); 崩溃判定入库期计算.
- **Validation & Error Matrix**: 未闭合括号 / 悬空运算符 / 未知键 / 空值 / 非法正则 / 修饰符误用 / `process:` 暂不支持, 各自的错误与位置; 语法错误时保持上一个有效查询.
- **Good/Base/Bad**: 官方两个优先级对比示例; `pidof` 多进程覆盖不全为 Base; "在 evaluate 里 new RegExp" 为 Bad; "两套过滤并存"为 Bad.
- **Tests Required**: 本任务 prd 验收标准里的语法与崩溃判定两组单测矩阵.
