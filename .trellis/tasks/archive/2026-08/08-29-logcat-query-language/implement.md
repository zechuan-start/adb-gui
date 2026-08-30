# 子任务 C: 查询语言 — 执行计划

> 前置: 子任务 A 与 B 均已归档.
> 组织方式: 先把纯逻辑做扎实并单测覆盖 (语法是本任务的正确性核心), 再接 UI, 最后才删除旧控件. 删除放最后是为了在切换前始终有可回退的可用状态.

---

## 阶段 0: 准备

- [ ] 确认 `task.py current` 指向 `08-29-logcat-query-language`.
- [ ] 确认 A/B 产出已在: `store/logcat.ts` 的索引维护, `components/logcat/` 四个组件, `hooks/` 两个 hook.
- [ ] 重读 `../08-29-logcat-refactor/research/android-studio-logcat-model.md` 第 2 节, 确认语法细节无记忆偏差.
- [ ] 收集真实崩溃样本备用: 在真机上制造一次 Java 崩溃与一次 ANR, 把 logcat 原始行存成测试夹具 (脱敏后可直接写进单测).

**验证**: `corepack pnpm test && corepack pnpm build` 通过.

---

## 阶段 1: 崩溃启发式 (最小独立单元)

先做这个是因为它完全独立于语法, 且是 `is:` 键的前置.

- [ ] 新建 `src/lib/logcatCrash.ts`: `CrashKind`, `detectCrashKind(level, tag, message)`.
- [ ] 新建 `src/lib/logcatCrash.test.ts`, 用阶段 0 收集的真实样本 + 构造样本覆盖:
  - crash: `FATAL EXCEPTION` / AndroidRuntime 组合 / native tombstone / `ANR in `.
  - stacktrace: `\tat ...(...)` / `Caused by: ` / `... N more` / 异常首行.
  - 不误判: 普通 INFO 日志 / 含 "at " 的普通句子 / 空消息.
  - `is:stacktrace` 与等级无关 (DEBUG 级堆栈也命中).
  - crash 优先级高于 stacktrace (同时满足时返回 crash).
- [ ] 在 `lib/logcat.ts` 的 `normalizeLine` 中调用, 结果存 `LogcatEntry.crashKind`.
- [ ] 补 `lib/logcat.test.ts`: `normalizeLine` 正确写入 `crashKind`.

**验证**: `corepack pnpm test`. 此时 `crashKind` 已入库但无人消费, 运行时行为不变.
**回滚点**: 单独 commit.

---

## 阶段 2: 查询语言纯逻辑 (本任务的正确性核心)

这一阶段不碰任何 UI. 单测是唯一验收手段, 必须详尽 — 语法一旦上线, 错误的优先级或转义处理会直接体现为用户查不到日志.

- [ ] 新建 `src/lib/logcatQuery.ts`:
  - [ ] `LEVEL_NAMES` 映射 (含单字母扩展).
  - [ ] tokenizer: 键/修饰符/值/运算符/括号/否定/裸文本, 记录 `start`/`end`; 处理 `\` 转义空格与 `"..."` 包裹.
  - [ ] parser: 递归下降, 优先级 `括号 > 否定 > AND > OR`, 支持隐式 AND.
  - [ ] `Matcher` 构造: 编译期完成小写化与正则构造; 非法正则报编译错误.
  - [ ] 修饰符适用性校验: `~`/`=` 用于 `level`/`package`/`is` 时报错.
  - [ ] `process:` 识别为"暂不支持"专用错误.
  - [ ] `compileQuery` 返回 `CompileSuccess`(含 `packageRefs`/`tagRefs`) 或 `CompileFailure`(含位置).
  - [ ] `evaluate(entry, ast, ctx)`: 递归 + 短路, 零分配.
- [ ] 新建 `src/lib/logcatQuery.test.ts`, 覆盖 prd 验收标准"语法正确性"全部条目, 特别注意:
  - [ ] 优先级: `tag:foo | level:ERROR & package:mine` 必须解析为 `tag:foo | (level:ERROR & package:mine)`.
  - [ ] 括号覆盖优先级: `(tag:foo | level:ERROR) & package:mine`.
  - [ ] 否定分组 `-(tag:a | tag:b)`.
  - [ ] `message:This\is\sample` 与 `message:"This is sample"` 等价.
  - [ ] `level:WARN` 与 `level:W` 等价, 大小写不敏感, 阈值语义.
  - [ ] `tag=:Activity` 不命中 `ActivityManager`, `tag:Activity` 命中.
  - [ ] 空查询放行全部.
  - [ ] 各类语法错误的错误信息与位置.
  - [ ] `evaluate` 的 `package` 分支在"解析中"与"已解析无 PID"下都返回 false, 且两者可区分.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
**预期**: 单测全绿; 运行时行为仍不变 (尚未接线).
**回滚点**: 单独 commit. 这是本任务最有价值的可复用产出, 即使后续 UI 方案调整也不需重做.

---

## 阶段 3: store 接入 (双轨并存的过渡态)

本阶段让查询与旧过滤**临时并存**, 目的是能在真机上验证查询正确性而不失去可用状态. 并存是过渡手段, 阶段 5 必须消除.

- [ ] store 扩展: `queryInput`, `activeQuery`, `compiledQuery`, `queryError`, `packagePids`, `resolvedPackages`, `packageResolving` 及 actions (`setQueryInput`, `commitQuery`, `appendToQuery`, `beginPackageResolution`, `completePackageResolution`, `failPackageResolution`).
- [ ] `commitQuery` 编译失败时只写 `queryError`, 不动 `compiledQuery`, 不重建索引.
- [ ] 索引维护的谓词调用点改为: `compiledQuery` 存在时用 `evaluate`, 否则回落到旧 `matchesFilter`.
- [ ] 包名解析: 编译成功后按 `packageRefs` 异步解析 (`mine` 先替换为 `currentPackage`), 结果写入 `packagePids`; 接入现状的 5 秒轮询刷新; 解析完成触发索引重建.
- [ ] store 单测补充:
  - [ ] `commitQuery` 成功后索引按新 AST 重建.
  - [ ] `commitQuery` 失败后 `compiledQuery` 与索引均不变, `queryError` 有值与位置.
  - [ ] `appendToQuery` 不重复追加已存在的片段.
  - [ ] 包名解析结果写入后索引重建.
  - [ ] 切设备后 `packagePids` / `resolvedPackages` 被清空 (PID 不可跨设备复用).

**验证**: `corepack pnpm test && corepack pnpm build`.
**风险行为**: 双轨期间要确保两条路径不会同时生效 (有 `compiledQuery` 就完全走 AST). 若出现"过滤结果像是两者交集"的现象, 说明回落逻辑写错了.
**回滚点**: 单独 commit.

---

## 阶段 4: 查询框 UI

- [ ] 新建 `src/components/logcat/LogcatQueryInput.tsx`: 输入框, 清空按钮, 错误提示 (边框 + 描述), 包名解析状态.
- [ ] 输入 debounce 后调 `commitQuery`.
- [ ] 补全面板: 候选来源按 design 6.2; 触发为输入时自动 + `Ctrl/Cmd + Space`; 键盘上下/Enter/Esc 完整可用.
- [ ] tag 候选按需采样 (打开补全时遍历 buffer, 上限 200), 不维护实时索引.
- [ ] `LogcatToolbar` 接入查询框 (此时与旧控件并存, 布局可临时拥挤).

**验证** (真机):
- [ ] `package:mine level:WARN` 生效.
- [ ] `-tag:<噪音 tag>` 排除生效.
- [ ] `is:crash` 在制造真实崩溃后能定位.
- [ ] `tag~:Activ` 正则命中多个 tag.
- [ ] 输入 `tag:foo & ` 这类中间态时列表保持上一个有效结果并显示错误提示; 修正后立即更新.
- [ ] 补全四类上下文逐一验证; 纯键盘可完成一次查询输入.
- [ ] 包名解析中有提示, 完成后自动刷新.
- [ ] 高频日志下连续输入查询不掉字.

**回滚点**: 单独 commit.

---

## 阶段 5: 删除旧控件 (消除双轨)

必须做, 否则违反父任务设计原则 5, 且会成为父任务集成评审的阻塞项.

- [ ] `LogcatToolbar` 移除: 等级按钮组, 应用过滤下拉, 关键字搜索框, tag chip.
- [ ] store 移除: `filter`, `searchInput`, `setMinLevel`, `setSearchInput`, `commitSearch`, `setTagFilter`, `setPidWhitelist`.
- [ ] `lib/logcat.ts` 移除: `LogcatFilter`, `matchesFilter`; 同步删除其单测 (语法覆盖已由 `logcatQuery.test.ts` 承担).
- [ ] 索引维护移除回落分支, 只走 `evaluate`; 无 `compiledQuery` 时用 `{ type: "always" }` 节点.
- [ ] 行内 tag 点击改为 `appendToQuery("tag:" + tag)`.
- [ ] 全仓搜索 `matchesFilter` / `LogcatFilter` / `setMinLevel` 确认无残留.
- [ ] 工具栏布局收拾: 查询框占主要宽度, 动作控件与统计区排布回归清爽.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
真机:
- [ ] 旧控件已消失, 全部过滤经查询框完成.
- [ ] 行内点击 tag 后查询框追加且列表过滤.
- [ ] 空状态区分"暂无日志"与"没有匹配当前查询的日志".
- [ ] 布局在 1200x800 与 900x600 下不重叠; 亮色暗色均可读.

**回滚点**: 单独 commit.

---

## 阶段 6: 质量门与 spec 同步

- [ ] 派发 `trellis-check`.
- [ ] 全量验证:
```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
corepack pnpm test
corepack pnpm build
```
- [ ] 性能冒烟: 含正则的查询在满窗口 (10000 行) 下重建无可感知冻结. 若有, 记录现象并在"继续实现前需要确认"中提出.
- [ ] 回归 B 的能力: 暂停 / Scroll to the End / Restart / 断开提示 / 清屏 / 清设备缓冲 / 切 tab 不丢现场.
- [ ] 新增 `.trellis/spec/frontend/quality-guidelines.md` 的 "Scenario: Logcat Query Language" (按 design 第九节的模板与内容).
- [ ] 提交.

---

## 收口声明

**本任务显式不做**:

- `process:` 键 —— 子任务 D (需 PID -> 进程名正向映射). 本任务只给"暂不支持"提示.
- `age:` 键, 查询历史与收藏, `is:firebase` —— 父任务"不做范围".
- 崩溃行的视觉高亮 —— 子任务 D. 本任务只产出 `crashKind` 字段, 不改渲染.
- Soft-wrap, 动态行高, 视图格式配置, 包名列 —— 子任务 D.
- 后端改动 —— `package:` 复用现有 `get_package_pids`.
- 解决 `pidof` 多进程覆盖不全 —— 记录为已知限制, D 有机会改善.

**特别提醒**: 阶段 1 做完崩溃判定后会很想顺手把崩溃行标红 (数据已经有了, 改一行样式就行). 不要做. 高亮涉及配色与视图格式的整体决策, 归 D 统一处理.

---

## 已确认的决策 (无需再问)

- 键名沿用 AS 英文, 不做本地化; 中文只出现在提示与补全说明中.
- 保留引号包裹值 `message:"foo bar"` 作为扩展, 与 `\` 转义空格并存. 两种写法都要有单测.

## 继续实现前需要确认

- 若阶段 6 发现含正则查询的满窗口重建明显卡顿, 是否引入分帧重建. 本任务默认**不做**, 需显式决策后另行处理.
