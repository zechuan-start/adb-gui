# 子任务 C: Logcat 查询语言

> 父任务: `.trellis/tasks/08-29-logcat-refactor`
> 依赖: **子任务 A 与 B 必须先完成**. A 提供过滤索引架构 (谓词可替换), B 提供拆分后的工具栏 (查询框要放进去).
> 后续: 子任务 D 的崩溃高亮复用本任务的 `is:crash` / `is:stacktrace` 判定结果; D 新增 `process:` 键.

## 目标

用一个 Android Studio 式的查询框, 取代现有的四套过滤控件 (等级按钮 / 应用下拉 / 关键字输入 / tag chip).

这是"复刻 AS 日志方案"里价值最高的一块: 它把现状根本无法表达的过滤需求变成一行文本. 例如 `package:mine level:WARN -tag:InputMethodManager` 在现状下需要三个控件配合且**仍然做不到排除**.

## 范围边界

### 做

支持以下语法 (依据 `../08-29-logcat-refactor/research/android-studio-logcat-model.md` 第 2 节):

| 能力 | 语法 |
|---|---|
| 键 | `tag:` `message:` `level:` `package:` `is:` |
| 裸文本 | 不带键的词视为 `message` 匹配 |
| 正则修饰符 | `tag~:Activity` |
| 精确修饰符 | `tag=:Activity` |
| 否定 | `-tag:foo`, 可与修饰符组合 `-tag~:foo` |
| 逻辑 AND | 空格 (隐式) 或 `&` |
| 逻辑 OR | `\|` |
| 分组 | `( )` |
| 等级阈值 | `level:INFO` 匹配 I/W/E/F |
| 当前应用 | `package:mine` |
| 崩溃 | `is:crash` |
| 堆栈 | `is:stacktrace` |

以及: 查询框 UI, 语法错误提示, 输入补全, 查询编译与求值, 删除四套旧控件.

### 不做

- **`process:` 键** —— 归子任务 D (需要 PID -> 进程名正向映射). 本任务遇到该键要给出明确的"暂不支持"提示, 不静默失败.
- **`age:` 键** —— 父任务"不做范围" (threadtime 时间戳无年份, 跨年与时区成本不划算).
- **查询历史与收藏** —— 父任务"不做范围" (需引入持久化, 是独立决策).
- **`is:firebase`** —— 与本项目无关.
- **崩溃行的视觉高亮** —— 归子任务 D. 本任务只产出判定结果 (`crashKind`), 不改渲染.
- **Soft-wrap, 行高, 列布局** —— 归子任务 D.
- 不改后端 (`package:` 复用现有 `get_package_pids` command).

---

## 需求

### R1 查询语法完整实现

按上表实现. 运算符优先级: `&` 高于 `|`, 括号最高. 依据官方文档同时给出 `(tag:foo | level:ERROR) & package:mine` 与 `tag:foo | level:ERROR & package:mine` 作为对比示例.

### R2 查询编译与求值分离

查询文本先编译成 AST, 求值时只走 AST. 编译只在查询变更时发生 (低频), 求值在每行入库与索引重建时发生 (高频). 正则对象必须在编译期创建并缓存在 AST 节点上, 不允许每行重新构造.

### R3 语法错误不破坏当前视图

查询有语法错误时, **保持上一个有效查询继续生效**, 同时在查询框上给出错误提示与出错位置. 不允许因为用户输入到一半就把列表清空或全部放行.

### R4 `package:` 的语义与实现

- `package:mine` 匹配**当前前台应用** (`useDeviceStore.currentPackage`). AS 的 `mine` 指"当前打开的工程", 本项目无工程概念, 前台应用是最接近的等价物, 需在补全提示里说明这一差异.
- `package:<包名>` 匹配指定包名.
- 两者都通过 `get_package_pids` (即 `pidof`) 把包名解析成 PID 集合, 再与行的 `pid` 比对. 不需要新的后端能力.
- 解析是异步的. 解析未完成时该谓词的行为必须明确定义 (见 design), 且 UI 上要有"解析中"提示.
- 已知限制: `pidof` 对多进程应用 (`:remote` 等) 覆盖不全. 这是继承现状的限制, 本任务不解决, 但要在 spec 中记录.

### R5 `level:` 的名称与阈值

接受 AS 的名称 `VERBOSE` / `DEBUG` / `INFO` / `WARN` / `ERROR` / `ASSERT` (大小写不敏感), 映射到设备端字母 `V` / `D` / `I` / `W` / `E` / `F`. 语义为"该等级及更高".

同时接受单字母输入 (`level:W`) 作为本项目扩展 —— 因为列里显示的就是字母, 用户会自然想输字母.

### R6 `is:crash` 与 `is:stacktrace`

基于消息内容的启发式判定, 在行入库时算一次并存进 `LogcatEntry.crashKind`, 求值时 O(1) 查字段.

**明确接受准确率低于 AS**: 这不是 adb 提供的字段, AS 也是靠内容猜. 判定规则与已知误判情形必须写进 spec.

### R7 查询框 UI 与补全

- 常驻单行输入框, 占据工具栏主要宽度.
- 支持补全: 键名, `level` 与 `is` 的枚举值, 当前 buffer 中出现过的 tag, 已加载的包名列表.
- 补全触发: 输入时自动 + `Ctrl/Cmd + Space` 手动 (对齐 AS).
- 语法错误提示与出错位置.
- 清空按钮.

### R8 替换旧过滤控件

删除等级按钮组, 应用过滤下拉, 关键字搜索框, tag chip. 删除 A 阶段的过渡结构 `LogcatFilter` 与 `matchesFilter`.

**不允许两套过滤并存** (父任务设计原则 5: 查询是唯一的过滤入口). 并存会产生"到底谁生效"的歧义.

点击行内 tag 的快捷过滤保留, 但行为改为**向查询框追加 `tag:<被点击的 tag>`**, 而不是维护一个独立的 tag 状态.

---

## 验收标准

### 语法正确性 (单测, 必须详尽)

- [ ] 单键: `tag:Foo`, `message:hello`, `level:WARN`, `package:mine`, `is:crash` 各自正确.
- [ ] 裸文本: `hello` 等价于 `message:hello`; 多个裸词之间为 AND.
- [ ] 隐式 AND: `tag:Foo level:WARN` 等价于 `tag:Foo & level:WARN`.
- [ ] 显式 AND / OR: `tag:A & tag:B`, `tag:A | tag:B`.
- [ ] 优先级: `tag:foo | level:ERROR & package:mine` 解析为 `tag:foo | (level:ERROR & package:mine)`.
- [ ] 括号改变优先级: `(tag:foo | level:ERROR) & package:mine`.
- [ ] 否定: `-tag:foo`; 与修饰符组合 `-tag~:foo`; 否定分组 `-(tag:a | tag:b)`.
- [ ] 正则: `tag~:Activ.*` 命中; 非法正则不使整个查询崩溃, 报编译错误.
- [ ] 精确: `tag=:Activity` 不命中 `ActivityManager`; 对应的 `tag:Activity` 命中.
- [ ] 值中空格: `message:This\is\sample` 匹配 "This is sample"; 引号形式 `message:"This is sample"` 等价 (本项目扩展).
- [ ] `level` 名称与字母均可: `level:WARN` 与 `level:W` 等价; 大小写不敏感; 阈值语义 (`level:INFO` 命中 I/W/E/F, 不命中 V/D).
- [ ] 空查询放行全部.
- [ ] 语法错误: 未闭合括号, 悬空运算符, 未知键, 空值, 各自产生带位置的错误.
- [ ] `process:` 产生"暂不支持"提示而非未知键错误.

### 崩溃判定 (单测, 用真实样本)

- [ ] `FATAL EXCEPTION: main` 行判定为 crash.
- [ ] native crash tombstone 标志行判定为 crash.
- [ ] `ANR in <package>` 判定为 crash.
- [ ] `\tat com.example.Main.run(Main.java:1)` 判定为 stacktrace.
- [ ] `Caused by: java.lang.NullPointerException` 判定为 stacktrace.
- [ ] `... 12 more` 判定为 stacktrace.
- [ ] 普通 INFO 日志不被误判.
- [ ] 消息中恰好含 "at " 的普通句子不被误判为 stacktrace.
- [ ] `is:stacktrace` 与日志等级无关 (DEBUG 级的堆栈也命中).

### 行为 (真机)

- [ ] `package:mine level:WARN` 只显示当前前台应用的 WARN 及以上日志.
- [ ] 追加 `-tag:<噪音 tag>` 后该 tag 的行消失.
- [ ] `is:crash` 能在制造一次真实崩溃后定位到崩溃条目.
- [ ] `tag~:Activ` 正则命中多个相关 tag.
- [ ] 输入语法错误的中间态 (如 `tag:foo & `) 时列表保持上一个有效结果, 不清空不全放行, 且显示错误提示.
- [ ] 修正语法后列表立即更新.
- [ ] 点击行内 tag 后查询框追加 `tag:<该 tag>`, 且列表相应过滤.
- [ ] 补全: 输入 `lev` 提示 `level:`; 输入 `level:` 提示六个等级值; 输入 `is:` 提示两个值; 输入 `tag:` 提示当前 buffer 中出现过的 tag.
- [ ] `Ctrl/Cmd + Space` 手动触发补全可用.
- [ ] 包名解析中时 UI 有提示, 解析完成后结果自动刷新.
- [ ] 切换设备后查询条件保留, 但包名 -> PID 解析结果重新计算.

### 性能

- [ ] 含正则的查询在 10000 行满窗口下重建索引不出现可感知冻结.
- [ ] 高频日志下输入查询不掉字 (查询编译需 debounce).
- [ ] `is:crash` / `is:stacktrace` 判定不在求值时重复计算 (通过 `crashKind` 字段验证).

### 结构

- [ ] 等级按钮组, 应用过滤下拉, 关键字搜索框, tag chip 四者已从工具栏移除.
- [ ] `LogcatFilter` 与 `matchesFilter` 已删除, 无残留引用.
- [ ] `lib/logcatQuery.ts` 与 `lib/logcatCrash.ts` 为纯逻辑, 不 import React 或 Tauri.

### 回归

- [ ] 暂停 / Scroll to the End / Restart / 断开提示 / 清屏 / 清设备缓冲 / 切 tab 不丢现场, 全部行为不变.
- [ ] 导出仍导出当前查询结果的 `raw`.
- [ ] 空状态文案区分"暂无日志"与"没有匹配当前查询的日志".
- [ ] `cargo test`, `cargo fmt --check`, `cargo clippy -- -D warnings`, `corepack pnpm test`, `corepack pnpm build` 全部通过.

### spec 同步 (Phase 3.3)

- [ ] `frontend/quality-guidelines.md` 新增 "Scenario: Logcat Query Language": 完整语法契约, 运算符优先级, 错误处理策略, `package:mine` 的语义差异, `pidof` 多进程限制, 崩溃启发式规则与已知误判, 必需单测矩阵.

---

## 约束

继承父任务全局约束. 本任务特别相关的:

- **禁止引入解析器生成库.** 语法规模很小 (5 个键, 2 个修饰符, 3 个运算符), 手写递归下降更可控也更易单测.
- 禁止在求值路径上构造正则对象或做 `toLowerCase()`, 一律编译期或入库期算好.
- 禁止保留任何形式的旧过滤控件 (设计原则 5).
- 禁止让语法错误清空列表或放行全部.
- `lib/logcatQuery.ts` 与 `lib/logcatCrash.ts` 必须是纯函数模块, 可在 Node 环境单测.

---

## 已确认的决策

- **键名沿用 AS 英文** (`tag`, `message`, `level`, `package`, `is`), 中文只出现在提示文案与补全说明里. 不做键名本地化.
- **保留引号包裹值** (`message:"foo bar"`) 作为本项目扩展, 与 AS 的 `\` 转义空格并存.
