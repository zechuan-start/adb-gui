# Logcat 日志功能重构 (父任务)

> 这是父任务, 拥有源需求集合, 子任务地图和跨子任务验收标准.
> 父任务本身**没有直接实现工作**, 不要 `task.py start` 这个任务; 实现发生在 4 个子任务里.

## 产品形态

ADB GUI 是 Android 开发测试用的桌面工具 app. 日志页是这个工具里唯一的"长时间驻留观察面板": 用户接上设备, 打开日志页, 一边操作手机一边盯着日志流, 出问题时暂停, 查询, 定位, 导出给同事.

本次重构的目标形态: **把日志页从"自制的简易过滤器"改造成 Android Studio Logcat V2 那样的查询驱动观察面板**, 同时把支撑它的数据通道和状态结构换掉.

### 这个页面不是什么

- 不是终端模拟器. 不暴露裸 `logcat` 命令输入框, 不让用户自己拼 adb 参数. (查询框是产品化的查询语言, 不是命令行)
- 不是日志分析平台. 不做聚合统计, 不做图表, 不做跨设备日志比对.
- 不是日志归档系统. 前端只持有有限的滚动窗口, 不承诺保存整个会话的全部历史.
- 不是 Android Studio 的完整克隆. 多标签页与分屏明确不做, 见"不做范围".

---

## 源需求

来自用户的三轮输入, 按提出顺序:

1. **"日志功能用起来并不舒服, 想重构"** — 起点是体感问题, 不是功能缺失.
2. **"spec 可以改动, 主要是正向优化都可以改动"** — 解除了结构类约定的束缚: 目录结构, hook 约定, 事件协议契约都可以为了正向优化而改写, 但必须同步更新 spec.
3. **"原有的滚动时暂停并不是好方案, 想复刻 Android Studio 的日志方案"** — 从"性能与结构重构"扩展为"交互模型对齐 Android Studio Logcat V2".

### 需求澄清结论

第 3 条经调研后有一个重要澄清 (依据 `research/android-studio-logcat-model.md`):

AS 的滚动行为与本项目现状**其实是同一个行为** — 上滚只关闭自动滚动, 数据继续流入. 现状代码里数据也没有停. 真正的问题是**现状把三个独立机制合并进了一个按钮**: 只有一个暂停键, 且仅"未跟随"时它也显示为 Play 图标, 使用户误判数据已停. AS 是三个独立控件: `Pause` (真停数据), `Scroll to the End` (只管视口), `Restart` (清空重连). 另外 AS 中在日志区域点击任意位置也会停止跟随, 现状只监听滚轮与触摸.

因此"复刻 AS"在交互层的落点是**控件解耦**, 而不是改变数据流行为.

---

## 现状问题 (已确认事实)

以下均为读代码确认, 非推测. 详细代码位置见各子任务 design.

1. **每行日志一次 IPC + 一次 setState.** 后端 reader 循环每行 `emit("logcat-line")`; 前端每行 `setLines`. 每次 setState 重渲染 616 行组件并对全部 5000 行重算 4 个过滤条件 (搜索分支每次对每行重新 `toLowerCase()`), 同时 `[...prev, ...entries]` 复制整个数组. 启动时 `-T 5000` 在几十毫秒内灌入 5000 行.
2. **切换顶部 tab 就丢失全部日志.** `{activeTab === "logcat" && <LogcatPanel />}` 条件渲染, 离开即卸载, cleanup 杀子进程, 日志/过滤条件/滚动位置全部重置.
3. **日志状态完全没有进 store.** 项目已有 `src/store/` 约定, 但日志页把 11 个 `useState` 和 6 个 `useRef` 全放组件内, 其中 `paused`/`following`/`pendingCount`/`autoScrollRef`/`programmaticScrollRef` 五者语义纠缠.
4. **切换设备存在杀错进程的竞态.** 后端全局单例 `LOGCAT_CHILD`, `stop_logcat()` 无参数. 前端 cleanup 的异步 stop 可能在新 `startLogcat` 之后抵达, 杀掉新进程. 表现为切设备后日志不出现, 需再切一次.
5. **子进程异常退出后前端无感知.** `stderr` 被 `Stdio::null()` 丢弃, reader 循环静默结束, `active` 仍为 true, 绿点继续亮.
6. **清屏连带清空设备缓冲区且无确认.** `handleClear` 同时清前端 `lines` 与执行 `adb logcat -c`, UI 上只有一个图标按钮.
7. **组件文件名与内容错位.** `LogcatViewer.tsx` 里实际是 `QuickKeysTool`.
8. **过滤能力远弱于 AS.** 四套控件 (等级按钮/应用下拉/关键字输入/tag chip) 不支持否定, 正则, 精确匹配, OR, 括号分组, 崩溃语义.
9. **长消息无法查看完整内容.** 固定 20px 行高 + `whitespace-pre` + ellipsis, 堆栈看不全, 无 soft-wrap, 无行展开.

### 推测

- 用户感知的"卡"主要来自问题 1 与 2, 而非功能缺失. 依据是重算规模与复现频率, 但未做过 profiling 量化.

---

## 用户价值

- **盯日志时不卡**: 复现 bug 时日志刷得最快, 恰好也最需要看清. 这段时间界面必须保持可交互.
- **中途去做别的事不丢现场**: 复现步骤常需切到应用页强停应用, 切到文件页取文件, 再回来. 这个动作现在的代价是丢掉全部现场.
- **一个查询框解决过滤**: 从"在四套控件之间来回配"变成"打一行查询". `package:mine level:WARN -tag:InputMethodManager` 这类表达是现状根本做不到的.
- **崩溃一键定位**: `is:crash` 取代在几千行里肉眼找红色 `FATAL EXCEPTION`.
- **堆栈能看全**: soft-wrap 之后不再需要把日志导出去才能读完一条异常.
- **切设备不用切两次**, **流断了立刻知道**, **清屏不误伤设备缓冲**.

---

## 子任务地图

4 个子任务, 每个都可独立规划, 实现, 检查和归档. 依赖顺序 A -> B -> C -> D, 该顺序写在各子任务的 prd/implement 中, 不由父子结构隐含.

| 子任务 | 目录 | 交付物 | 依赖 |
|---|---|---|---|
| **A. 数据通道与会话重构** | `08-29-logcat-stream-pipeline` | 后端批量 emit + per-serial 会话 + session_id 校验 + stderr 摘要与退出事件; 前端 ring buffer, 过滤索引, rAF 批量 flush, `useLogcatStore` 基础 | 无 |
| **B. AS 式交互外壳** | `08-29-logcat-shell-interaction` | 组件与 hook 拆分; 切 tab 常驻不丢现场; `Pause`/`Scroll to the End`/`Restart` 三控件解耦; 视图内点击停止跟随; 断开提示条; 清屏与清设备缓冲分离 | A |
| **C. 查询语言** | `08-29-logcat-query-language` | tokenizer + parser + AST evaluator; 键 `tag`/`message`/`level`/`package`/`is`; 修饰符 `~`/`=`/`-`; `&`/`\|`/括号; `is:crash`/`is:stacktrace` 启发式; 查询框 UI 与补全; 替换现有四套过滤控件 | A, B |
| **D. 视图呈现** | `08-29-logcat-view-presentation` | Soft-Wrap 动态行高; Standard/Compact 视图与字段开关; PID -> 进程名/包名正向映射; 包名列; `process:` 查询键; 崩溃/堆栈高亮 | A, B, C |

**`process:` 键的归属**: 归 D 而非 C. 原因是 `package:` 可以用现有的 `pidof` 反向解析 (包名 -> PID 集合 -> 匹配行的 pid), 不需要新能力; 而 `process:` 必须有 PID -> 进程名的**正向**映射, 那个映射由 D 建立. C 完成时查询语言不支持 `process:`, 输入该键应给出明确的"暂不支持"提示而非静默失败.

### 为什么这样切

- **A 是地基**: 它决定了"追加一批日志"的成本模型. B/C/D 全部建立在 A 的 store 与索引结构之上, 先做 A 才不会返工.
- **B 先于 C**: 查询框要替换现有工具栏控件, 而工具栏在 B 里才被拆出来. 反序会导致 C 在一个 616 行的旧组件里动刀.
- **C 先于 D**: D 的崩溃高亮复用 C 的 `is:crash`/`is:stacktrace` 判定逻辑, 视图格式配置也要与查询框共存于同一工具栏.
- **D 单独成任务**: soft-wrap 的动态行高测量是唯一会推翻"固定 20px 行高"这一性能前提的改动, 风险独立, 必须能独立回滚.

---

## 范围

### 做

见子任务地图. 逐条验收标准在各子任务 prd 中.

### 不做范围

- **多标签页与分屏**: 需要多会话并存加一套布局系统, 成本远高于收益.
- **`age:` 查询键**: threadtime 时间戳不含年份, 跨年处理与时区假设的成本不划算. 结构上不阻碍后续补.
- **查询历史与收藏**: 现有 store 均无持久化中间件, 引入持久化是独立决策. 结构上不阻碍后续补.
- **`is:firebase`**: 与本项目无关.
- **Up/Down the Stack Trace 导航**: 依赖堆栈块聚合, 待 `is:stacktrace` 稳定后再评估.
- **Print / Screen Capture / Screen Record**: 本项目已有独立的截图与录屏工具.
- **把过滤下推到 adb 侧** (`logcat --pid=` 等): 查询语言的表达力远超 adb 侧过滤能力, 下推会导致语义分裂. 过滤保持在前端.
- **缓冲容量的用户可配置 UI**: 本次提为常量 (见子任务 A), 可配置留待后续.
- **设备上线自动重连**: 只做"退出可见 + 手动 Restart".
- **PID 轮询改事件驱动**: 现状 5 秒轮询保留. 但子任务 D 引入的 PID -> 包名映射会部分改善这块, 见 D 的 design.
- **改动 quick bug report 的一次性 `-v brief` dump 路径**: 见 backend spec 的 bug report 场景, 与流式通道无关.

---

## 全局约束

### 不可让步的约束

- 遵循 `.trellis/spec/frontend/quality-guidelines.md` 质量红线: 禁止 `any`, 禁止组件内直接 import `@tauri-apps/api/*`, 所有 `invoke`/`listen` 收在 `lib/tauri.ts`, `<button>` 必带 `type="button"`, 监听与定时器必须 cleanup, 条件 class 用 `cn()`, 颜色只用语义 token.
- 遵循 `.trellis/spec/backend/quality-guidelines.md`: command 返回 `Result<T, String>`, 禁止在 handler 中 `panic!`, 正则用文件级 `LazyLock`, 新 command 必须注册进 `lib.rs` 的 `generate_handler!`.
- 子进程必须继续走 `adb::prepare_async_command`, 保住 Windows `CREATE_NO_WINDOW`. 绕过它会让 Windows release 重新出现闪烁控制台窗口.
- `parse_logcat_line` 的解析语义不得回退: 无法解析的行仍须 fallback 为 level `I` 且 `message = raw`, 绝不丢弃.
- Rust 载荷结构体与 `src/lib/tauri.ts` 的 TS interface 必须字段逐一对应.
- 纯逻辑必须可单测, 单测与被测文件同目录并用 `*.test.ts` 命名.

### 可以随本任务演进的约定

结构类约定不构成约束, 只要是正向优化即可调整, 但**必须在对应子任务的 Phase 3.3 把 spec 一并改掉**, 不允许代码与 spec 不一致. 完整清单见 `design.md` 第七节.

---

## 跨子任务验收标准

以下是**只有 4 个子任务全部完成后才能验证**的标准, 属于父任务的集成评审范围. 各子任务自身的验收标准在其 prd 中.

### 集成后的端到端行为

- [ ] 连接真机, 在查询框输入 `package:mine level:WARN`, 列表只显示当前前台应用的 WARN 及以上日志; 追加 `-tag:<某噪音 tag>` 后该 tag 消失; 全过程无可感知卡顿.
- [ ] 触发一次应用崩溃, 查询 `is:crash` 能定位到崩溃条目; 开启 Soft-Wrap 后能在列表内读完整条堆栈, 无需导出.
- [ ] 在日志区域点击某一行, 跟随停止且该行保持可见; 点击 `Scroll to the End` 恢复跟随并回到底部.
- [ ] `Pause` 期间列表完全静止并显示积压计数; `Restart` 清空并重连, 查询条件保留.
- [ ] 设置好查询后切到"应用"页再切回, 查询条件, 日志内容, 滚动位置, 视图格式全部保持, 期间新日志继续进入缓冲.
- [ ] 连续快速切换两台在线设备 (A -> B -> A), 每次都在 2 秒内出日志, 不需二次切换, 列表不含上一台设备的行.
- [ ] 拔掉设备后 2 秒内出现断开提示条并显示原因, 已有日志仍可查询; `Restart` 后恢复.
- [ ] 切到 Compact 视图后字段减少且 message 成为焦点, 切回 Standard 恢复.

### 集成后的一致性

- [ ] 工具栏在 1200x800 与 900x600 两种宽度下均不重叠, 亮色与暗色模式下均可读.
- [ ] 4 个子任务各自的 spec 更新累积后, `.trellis/spec/` 中不存在与最终代码矛盾的 logcat 描述 (逐条核对 `design.md` 第七节清单).
- [ ] `src/components/Logcat.tsx` 与 `src/components/LogcatViewer.tsx` 均已不存在, `App.tsx` 无残留 import.
- [ ] 全量验证通过: `cargo test`, `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`, `corepack pnpm test`, `corepack pnpm build`.

### 集成评审

- [ ] 4 个子任务全部归档后, 由父任务做一次集成评审: 确认没有子任务为了自身验收而留下临时兼容代码 (例如 C 为过渡保留的旧过滤控件, A 为过渡保留的单行事件通道).

---

## 备注

- 架构总纲与跨子任务共享契约见 `design.md`. 父任务不写 `implement.md`, 因为父任务没有直接实现工作.
- AS 交互模型调研见 `research/android-studio-logcat-model.md`, 含官方语法表与逐项可复刻性评估.
- 现状"未做"项来源: `.trellis/workspace/qi/journal-1.md` Session 4 (2026-07-26) 记录的"搜索增强, 行展开复制, 跟随 UX 三组改进未做". 本次由 C 和 D 覆盖.
