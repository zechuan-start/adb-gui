# 研究: Android Studio Logcat V2 交互模型

> 目的: 为"复刻 AS 日志方案"提供准确依据, 避免凭记忆设计.
> 来源: [官方文档 View logs with Logcat](https://developer.android.com/studio/debug/logcat) 为主, 辅以 [alexzh.com](https://alexzh.com/new-logcat-5-features-for-effective-android-app-debugging/), [dev.to](https://dev.to/mohitrajput987/new-android-studio-logcat-2d8g), [ktdevlog](https://ktdevlog.com/android-studio-logcat-filter/) 交叉验证.
> 调研日期: 2026-08-29

---

## 1. 滚动与跟随模型 (直接回应"滚动时暂停不是好方案")

官方原文: *"By default, Logcat scrolls to the end. Clicking in the Logcat view or scrolling up using your mouse wheel turns this feature off. To turn it back on, click Scroll to the End from the toolbar. You can also use the toolbar to clear, pause, or restart Logcat."*

拆解出的模型:

| 概念 | AS 的行为 | 触发方式 | 恢复方式 |
|---|---|---|---|
| 自动滚到底 | 默认开启 | — | 点工具栏 `Scroll to the End` |
| 关闭自动滚到底 | **数据继续流入**, 只是视口不动 | 鼠标滚轮上滚, **或在视图内点击** | 同上 |
| Pause | 真正暂停日志输出 | 工具栏独立按钮 | 再点一次 |
| Restart | 清空并重连 logcat | 工具栏独立按钮 | — |
| 锚定某行 | 点击某一行可让该行保持可见 | 点击行 | 滚回底部 |

**关键结论**: AS 里"滚动"和"暂停"是**两个完全独立的机制**, 各自有独立控件. 滚动离开底部只影响视口, 绝不停止数据. 这与本项目现状最大的差异不在于行为本身 (现状数据也没停), 而在于**现状把两者塞进同一个按钮** (`handlePauseToggle` 的三分支), 导致图标语义混乱: 仅"未跟随"时按钮也变成 Play, 让用户误以为数据停了.

另一个现状缺失: AS 里"在视图内点击"也会停止跟随, 因为用户点击通常意味着要看某一行. 现状只监听滚轮与触摸.

---

## 2. 查询语言 (AS Logcat V2 的核心)

搜索与过滤合并进一个常驻查询框. 支持 `Ctrl + Space` 补全提示.

### 2.1 键

| 键 | 匹配对象 |
|---|---|
| `tag` | 日志条目的 tag 字段 |
| `package` | 产生日志的应用包名 |
| `process` | 产生日志的进程名 |
| `message` | 日志条目的消息正文 |
| `level` | 日志等级, **匹配该等级及更高** |
| `age` | 条目时间戳距今多近, 值形如 `5m` (`s`/`m`/`h`/`d`) |
| `is` | 特殊谓词, 见 2.4 |

裸文本 (不带键) 视为对 message 的匹配. 消息中含空格时用 `\` 连接, 例如 `message:This\is\sample`.

### 2.2 修饰符

| 写法 | 语义 | 示例 |
|---|---|---|
| `key:value` | 包含匹配 | `tag:Activity` |
| `key~:value` | 正则匹配 | `tag~:Activity` |
| `key=:value` | 精确匹配 | `tag=:Activity` |
| `-key:value` | 否定 (NOT) | `-tag:InputMethodManager` |

否定可与其他修饰符组合 (如 `-tag~:`).

### 2.3 逻辑运算

| 写法 | 语义 |
|---|---|
| 空格 | 隐式 AND, `package:mine tag:Foo` 等价于 `package:mine & tag:Foo` |
| `&` | AND |
| `\|` | OR |
| `( )` | 分组 |

官方示例: `(tag:foo | level:ERROR) & package:mine`.
注意优先级: 官方同时给出 `tag:foo | level:ERROR & package:mine` 作为对比示例, 说明 `&` 优先级高于 `|`.

### 2.4 `level` 的确切语义

*"The `level` query matches against the log level of the Logcat message, where the log entry level is greater or equal to the query level."*

合法值 (大小写不敏感): `VERBOSE`, `DEBUG`, `INFO`, `WARN`, `ERROR`, `ASSERT`.
`level:INFO` 匹配 INFO / WARN / ERROR / ASSERT.

**与本项目的映射**: 设备端 threadtime 输出的等级字母是 `V D I W E F`. AS 的 `ASSERT` 对应 logcat 的 `F` (Fatal). 需要建立 `VERBOSE->V ... ASSERT->F` 的名称到字母映射, 并保持"该等级及更高"的阈值语义 (与现状等级按钮语义一致).

### 2.5 `package` 的特殊值 `mine`

*"The package key supports a special value `mine`. This special value matches any package names that are contained in the open project."*

AS 的 `mine` 依赖"当前打开的工程", 这个概念在本项目不存在. **本项目的等价物是"当前前台应用"** (`useDeviceStore.currentPackage`, 已由 `App.tsx` 每 5 秒轮询 `getCurrentActivity` 得到), 正好对应现状应用过滤下拉里的 `APP_FILTER_AUTO` 选项.

### 2.6 `is` 键

- `is:crash` — 表示应用崩溃的条目 (native 或 Java)
- `is:stacktrace` — 任何看起来像 Java 堆栈的条目, **与日志等级无关**
- `is:firebase` — 第三方来源相关 (社区文档提及, 与本项目无关)

AS 的实现是基于消息内容的启发式判断, 不是 adb 提供的字段.

### 2.7 查询历史与收藏

常用查询可存为 favorite, 并保留查询历史. 属于易用性增强, 非核心机制.

---

## 3. 视图呈现

### 3.1 Soft-Wrap

官方原文: *"By default, message lines are not wrapped in the log view but you can use the Soft-Wrap option from the Logcat toolbar."*

**关键**: AS 默认**不**换行, soft-wrap 是用户主动开启的开关.

对本项目的技术影响: 现状虚拟滚动用固定 `estimateSize: () => 20`. soft-wrap 意味着行高可变, 需要 `@tanstack/react-virtual` 的动态测量 (`measureElement`). 因为 AS 默认关闭, 可以做成"默认固定行高快路径, 开启 soft-wrap 才切到动态测量", 把动态测量的性能与滚动抖动风险限制在用户显式开启时.

### 3.2 视图格式

- Standard 视图显示: date, time, process/thread ID, tag, package name, priority, message.
- Compact 视图减少字段, 让 message 成为焦点.
- `Modify Views` 可自定义去掉不需要的字段 (如 process ID, date).

**对本项目的影响**: 现状固定显示 `时间 / 等级 / tag / pid / message`, 无包名列. 要显示包名需要 PID -> 包名映射, 而现状只有反向的包名 -> PID (`pidof`). 需要用 `adb shell ps -A` 建立并缓存正向映射.

### 3.3 其他工具栏能力

社区文档列出的工具栏项: Clear Logcat, Scroll to the End, Up/Down the Stack Trace, Use Soft Wraps, Print, Restart, Logcat Header (格式配置), Screen Capture, Screen Record.

其中与本项目相关的: Clear, Scroll to the End, Soft Wraps, Restart, 格式配置. 无关或已在别处实现的: Print, Screen Capture, Screen Record (本项目已有独立的截图/录屏工具).

### 3.4 多标签与分屏

支持多个 logcat tab 与分屏, 用于同时观察不同设备或不同进程. 每个 tab 有独立查询.

---

## 4. 对本项目的可复刻性评估

| AS 能力 | 可复刻性 | 依赖 / 风险 |
|---|---|---|
| 滚动跟随模型 (含视图内点击停止跟随) | 高 | 无新依赖, 现有 hook 拆分即可 |
| 独立 Pause | 高 | 现状已有数据暂停能力, 只需与跟随解耦 |
| Restart | 高 | 复用 stop + start + 清空 |
| 查询语言 (键/修饰符/逻辑/括号) | 高 | 需自写 tokenizer + parser + AST evaluator, 纯逻辑易单测 |
| `level:` 阈值语义 | 高 | 需名称 -> 字母映射 |
| `package:mine` | 中 | 映射为"当前前台应用"; 语义与 AS 不同, 需在 UI 上说明 |
| `package:` / `process:` 任意值 | 中 | 需 PID -> 包名映射 (`ps -A`) 与缓存失效策略 |
| `age:` | 中 | threadtime 时间戳无年份, 跨年需处理; 需设备时区假设 |
| `is:crash` / `is:stacktrace` | 中 | 需自写启发式 (`FATAL EXCEPTION`, `Caused by:`, `\tat x.y.Z(...)`), 准确率不可能等同 AS |
| Soft-Wrap | 中 | 与虚拟滚动固定行高冲突, 需动态测量; 默认关闭可控制风险 |
| 视图格式配置 (Standard/Compact/字段开关) | 中 | 需列布局参数化; 包名列依赖 PID -> 包名映射 |
| 查询历史 / 收藏 | 中 | 需持久化 (现有 store 均无持久化中间件) |
| 多 tab / 分屏 | 低 | 需要多会话并存 + 布局系统, 收益低于成本 |
| Up/Down the Stack Trace | 低 | 依赖堆栈块识别, 建议在 `is:stacktrace` 之后再考虑 |

---

## 5. 与现状的关键差异清单

1. 现状用 6 个等级按钮 + 应用下拉 + 关键字输入 + tag chip 四套控件表达过滤; AS 用**一个查询框**表达全部.
2. 现状不支持否定, 正则, 精确匹配, OR, 括号分组.
3. 现状不支持崩溃/堆栈语义查询.
4. 现状暂停与跟随共用一个按钮; AS 完全分离且多了 Restart.
5. 现状长消息 ellipsis 截断且无法展开; AS 有 soft-wrap.
6. 现状列固定; AS 列可配置且有 Compact 视图.
7. 现状无查询历史/收藏.
8. 现状"在视图内点击"不会停止跟随; AS 会.
