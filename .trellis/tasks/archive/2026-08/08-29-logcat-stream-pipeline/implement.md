# 子任务 A: 数据通道与会话重构 — 执行计划

> 按"可验证的中间状态"组织阶段, 不按文件顺序. 每个阶段结束时项目应处于可编译, 可测试的状态.
> 阶段 1-2 是纯新增与后端改造, 阶段 3 是切换点 (前端从旧通道切到新通道), 阶段 4-5 是收尾.

---

## 阶段 0: 准备

- [ ] 确认 `python3 ./.trellis/scripts/task.py current` 指向 `08-29-logcat-stream-pipeline`.
- [ ] 记录改动前基线: 在真机上打开日志页, 主观记录初始 dump 的冻结时长与高频日志下的卡顿程度, 便于阶段 5 对比.
- [ ] 确认 `git status` 干净, 便于回滚.

**验证**: `cargo test --manifest-path src-tauri/Cargo.toml` 与 `corepack pnpm test` 在改动前均通过 (建立基线, 避免把既有失败误认为本次引入).

---

## 阶段 1: 前端纯逻辑层 (纯新增, 不接线)

先做纯逻辑是因为它完全可单测, 且不影响运行时行为. 这一阶段结束时 app 行为与改动前完全一致.

- [ ] 新建 `src/lib/logcat.ts`: `LogLevel`, `LEVELS`, `LogcatEntry`, `LOGCAT_CAPACITY`, `normalizeLine`, `LogcatRingBuffer`, `LogcatFilter`, `matchesFilter`.
- [ ] 新建 `src/lib/logcat.test.ts`, 覆盖:
  - ring buffer: 未满追加 / 恰好满 / 溢出淘汰 / `bySeq` 命中 / `bySeq` 越界 (已淘汰与未来 seq) / `clear` 后复用 / 容量为 1 的边界 / `at(0)` 是最老.
  - `normalizeLine`: `searchKey` 由 tag 与 message 小写拼接且用 `\u0000` 分隔 / 不跨边界伪命中 / seq 正确写入.
  - `matchesFilter`: 等级阈值 (选 W 时保留 W/E/F, 排除 V/D/I) / 关键字命中 tag / 关键字命中 message / tag 精确匹配 / PID 集合 / 多条件叠加 / 空过滤放行全部.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
**预期**: 新单测全绿, build 通过, app 运行时行为无任何变化.

**回滚点**: 本阶段纯新增文件, 直接删除即可回滚.

---

## 阶段 2: 后端批量协议与会话管理

- [ ] `logcat.rs`: 加入 `BATCH_MAX_LINES`, `BATCH_FLUSH_INTERVAL` 常量.
- [ ] 加入 `LogcatSession` 结构, `LOGCAT_SESSIONS: HashMap`, `NEXT_SESSION_ID: AtomicU64`, 移除 `LOGCAT_CHILD`.
- [ ] 加入 `LogcatSessionInfo`, `LogcatBatch`, `LogcatExit` 三个载荷结构体.
- [ ] `LogcatLine` 移除 `serial` 字段; `parse_logcat_line` 签名改为 `(raw: &str)`.
- [ ] 改造 `start_logcat`: 分配 session_id, kill 同 serial 旧会话, stderr 改 `Stdio::piped()` 并起 stderr 收集 task, reader 循环改为 `timeout` 批量聚合, 退出时 emit `logcat-exit` 并清理 HashMap 条目, 返回 `LogcatSessionInfo`.
- [ ] 改造 `stop_logcat` 为 `(serial, session_id)` 并加 session_id 校验.
- [ ] 更新 `lib.rs` 的 `generate_handler!` (签名变化的 command 无需增删, 但确认无遗漏).
- [ ] 调整既有 6 个 `#[cfg(test)]` 单测: 去掉 `serial` 参数与断言, 其余断言逐条保留.

**验证**:
```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```
**预期**: 后端全绿. 此时前端仍在监听 `logcat-line`, **日志页会没有数据** — 这是阶段 2 到 3 之间的已知中间状态, 不要误判为 bug.

**风险文件**: `src-tauri/src/commands/logcat.rs` 是本任务改动最集中的文件.
**风险行为**: 子进程 kill 与 HashMap 清理的顺序; stderr task 若持有句柄会阻止进程回收.
**回滚点**: 阶段 2 单独成一个 commit. 若阶段 3 出现无法收敛的问题, 可回退到阶段 1 结束状态.

---

## 阶段 3: 接线 (切换点)

这是唯一会让前端短暂不可用的阶段, 尽量在一个连续工作段内完成.

- [ ] 更新 `src/lib/tauri.ts`: `LogcatLine` 去 `serial`, 新增 `LogcatSessionInfo` / `LogcatBatch` / `LogcatExit` 接口, `startLogcat` 返回值, `stopLogcat` 加参, 新增 `onLogcatBatch` / `onLogcatExit`, 移除 `onLogcatLine`.
- [ ] 新建 `src/store/logcat.ts`: 按 design 第三节实现会话身份, 数据, 流控, 过滤四组字段与 actions; 实现过滤索引增量维护与 `filteredHead` 惰性压缩; `appendBatch` / `markDisconnected` 校验 sessionId; pending 数组加上限.
- [ ] 新建 `src/store/logcat.test.ts`, 覆盖:
  - `appendBatch` 丢弃 sessionId 不匹配的批次.
  - `markDisconnected` 丢弃 sessionId 不匹配的退出事件.
  - 索引增量追加后 `filteredCount` 正确.
  - 追加超过容量后头部失效 seq 被跳过, 逻辑长度正确.
  - `filteredHead` 超过阈值后压缩, 压缩前后逻辑长度一致.
  - 过滤条件变更触发全量重建, 结果与逐行 `matchesFilter` 一致.
  - `pause` 期间批次进积压区且 buffer 不变; `resume` 后一次性补入且 `pausedBacklog` 归零.
  - 积压区超过上限时丢弃最老.
  - `reset` 归零全部字段.
  - `clearScreen` 清 buffer 与索引但不动会话身份.
- [ ] 新建 `src/hooks/useLogcatStream.ts`: 按 design 第四节实现. 注意监听先于 start 注册, ref 缓冲 + rAF 合并, ref 缓冲上限保护, cleanup 取消 rAF 并带 sessionId 停止.
- [ ] 最小改造 `src/components/Logcat.tsx`: 按 design 第六节的对照表换数据来源. 严格保持工具栏结构, 样式, 列宽, 行高, 暂停三分支行为, 跟随实现, PID 轮询, 导出与清屏行为不变. 仅允许状态指示器新增 `disconnected` 表达.
- [ ] 搜索输入接 debounce: 输入进 `searchInput`, 到期后 `commitSearch`.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
**预期**: 全绿, 且日志页恢复出数据.

**风险行为**:
- 忘记在 cleanup 里取消 rAF, 导致卸载后 flush 访问已废弃状态.
- `getItemKey` 与行取值改用 seq 后, 若与 `filteredHead` 配合有偏移错误, 表现为行内容错位或重复 key 警告.
- debounce 若未在卸载时清理定时器, 会有悬挂定时器.

**回滚点**: 阶段 3 单独成一个 commit.

---

## 阶段 4: 真机冒烟

必须在真实设备上执行, build 通过不能替代. 每项都记录结果.

- [ ] **初始 dump**: 连接设备, 打开日志页. 期望初始 5000 行加载不出现整秒级冻结, 列表可立即滚动.
- [ ] **高频日志**: 启动一个大型 app 制造高频日志. 期望持续滚动期间在搜索框连续输入不掉字, 无可感知卡顿.
- [ ] **低流量延迟**: 设备静置至日志稀疏, 手动触发一条日志 (如按 home 键). 期望观感上立即出现, 不明显滞后.
- [ ] **切设备**: 连接两台设备, 快速 A -> B -> A 切换. 期望每次 2 秒内出日志, 不需二次切换, 列表不含上一台设备的行.
- [ ] **连续切换后无孤儿进程**: 快速切换 5 次后, 用 `ps aux | rg "logcat"` (macOS/Linux) 确认没有残留的 logcat 子进程堆积.
- [ ] **拔线断开**: 日志流进行中拔掉 USB (或执行 `adb kill-server`). 期望 2 秒内流状态变为断开, 指示器不再显示正常, 已有日志保留.
- [ ] **断开原因**: 确认 `disconnectDetail` 有内容 (可临时在 console 打印验证), 不是空字符串.
- [ ] **启动失败**: 用一个 offline 状态的设备 serial 触发启动失败, 期望 toast 报错可见.
- [ ] **回归四套过滤**: 等级按钮, 应用下拉 (含"当前前台应用"), 关键字搜索, 点击 tag 过滤与 chip 清除, 逐个验证并两两叠加, 行为与改动前一致.
- [ ] **回归暂停**: 暂停后列表静止并显示积压计数, 恢复后补入并吸底; 向上滚动后数据继续流入.
- [ ] **回归导出**: 导出后确认文件落在 `Documents/ADB GUI/logs`, 文件名带时间戳, 自动 reveal, toast 显示路径.
- [ ] **回归清屏**: 清屏后列表清空 (本任务仍保留连带清设备缓冲的现状行为).
- [ ] **回归空状态**: 断开所有设备, 期望显示"请先连接设备以查看 Logcat".
- [ ] **回归分隔行**: 确认 `--------- beginning of main` 之类的行仍出现在列表中.

**若任一项失败**: 停下修复, 不要进入阶段 5.

---

## 阶段 5: 质量门与 spec 同步

- [ ] 派发 `trellis-check` 做质量检查.
- [ ] 全量验证:
```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
corepack pnpm test
corepack pnpm build
```
- [ ] 更新 `.trellis/spec/backend/quality-guidelines.md` 的 "Scenario: Streaming Logcat Format and Parsing" (按 design 第九节).
- [ ] 更新 `.trellis/spec/frontend/state-management.md` (store 清单 + 可变数据模式).
- [ ] 更新 `.trellis/spec/frontend/hook-guidelines.md` 的 `hooks/` 目录最小说明.
- [ ] 与阶段 0 记录的基线对比, 把性能改善的主观结论写进 journal.
- [ ] 提交.

---

## 收口声明

以下内容**本任务显式不做**, 不允许在实现过程中顺手扩大范围:

- 组件拆分, `components/logcat/` 目录, `LogcatViewer.tsx` 改名 —— 子任务 B.
- 暂停与跟随解耦, `Scroll to the End` / `Restart` 控件, 视图内点击停止跟随, 断开提示条与重连按钮, 清屏与清设备缓冲分离, 切 tab 常驻 —— 子任务 B.
- 查询语言, 否定/正则/精确匹配/OR/括号, `is:crash` / `is:stacktrace` —— 子任务 C.
- Soft-wrap, 动态行高, 视图格式配置, 包名列, 崩溃高亮 —— 子任务 D.
- 缓冲容量可配置 UI, 设备上线自动重连, PID 轮询改事件驱动, 过滤下推到 adb —— 父任务"不做范围".

如果实现中发现某项收口内容是本任务验收的**硬前置**, 不要直接做, 先回到 Phase 1 修订 prd 与本计划.

---

## 继续实现前需要确认

- 缓冲容量 10000 与 `-T 5000` 的配比在真机上是否合适. 阶段 4 冒烟时留意历史是否够用, 若明显不足, 在阶段 5 前提出调整.
- 若增量过滤索引在阶段 3 出现难以收敛的边界问题, 是否启用 design 3.3 的回退点 (退化为每批全量重算). 启用时必须在此处记录决定与原因.
