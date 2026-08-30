# 子任务 D: 视图呈现 — 执行计划

> 前置: 子任务 A, B, C 均已归档.
> 组织方式: 先做低风险的呈现能力 (视图格式, 高亮), 再做需要后端配合的映射链路, 最后才做高风险的 soft-wrap 动态测量. 把风险最高的一步放最后, 是为了在它出问题时前面的收益已经落袋且可独立回滚.

---

## 阶段 0: 准备

- [ ] 确认 `task.py current` 指向 `08-29-logcat-view-presentation`.
- [ ] 确认 A/B/C 产出已在: `crashKind` 已入库, 查询语言可用, `components/logcat/` 组件齐全.
- [ ] 基线记录: 真机上确认 C 结束后的行高, 列宽, 截断行为, 便于阶段 4 验证"关闭 soft-wrap 时与基线一致".
- [ ] 准备一个**多进程应用** (含 `:remote` 之类子进程) 用于阶段 2/3 验证. 若手边没有, 记录此项无法验证并在 prd 验收中标注.

**验证**: `corepack pnpm test && corepack pnpm build` 通过.

---

## 阶段 1: 视图格式与崩溃高亮 (无新依赖, 低风险)

- [ ] 新建 `src/lib/logcatView.ts`: `ViewFormat`, `LogcatColumn`, `ViewSettings`, `STANDARD_COLUMNS`, `COMPACT_COLUMNS`, `COLUMN_WIDTHS`, `splitTimestamp`, `packageFromProcessName`.
- [ ] 新建 `src/lib/logcatView.test.ts`:
  - [ ] `splitTimestamp` 正确拆分 `MM-DD HH:MM:SS.mmm`; 空字符串与畸形输入的兜底.
  - [ ] `packageFromProcessName`: 无冒号原样返回; `com.x:remote` 返回 `com.x`; 空字符串兜底.
  - [ ] `STANDARD_COLUMNS` 与现状显示字段一致 (回归护栏).
- [ ] store 扩展: `softWrap`, `viewFormat`, `columns` 及 setters.
- [ ] 新建 `src/components/logcat/LogcatViewMenu.tsx`: 格式单选 + 列开关 + soft-wrap 开关; 自定义态下两个格式按钮均不高亮.
- [ ] `LogcatToolbar`: 接入视图菜单按钮 + soft-wrap 工具栏快捷开关 (`WrapText` 图标).
- [ ] `LogcatRow`: props 加 `columns`; 按 `columns` 条件渲染各列; 时间列改用 `splitTimestamp` 取代 `slice(6)`; 加崩溃高亮 (crash 背景+左边框, stacktrace 弱左边框, 默认态 `border-l-2 border-transparent`).
- [ ] 此阶段 `softWrap` 状态已存在但**不接测量**, 开关暂时无视觉效果 (阶段 4 才接).

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
真机:
- [ ] Standard/Compact 切换即时生效, Compact 下 message 明显更宽.
- [ ] 七个列开关逐一生效; 全关后 message 占满且不错位.
- [ ] 默认视图与阶段 0 基线一致 (字段, 列宽, 行高).
- [ ] 制造真实崩溃: crash 行可被快速滚动扫到, stacktrace 行有弱标记且与 crash 可区分.
- [ ] 亮色/暗色下高亮均可读; E/F 级红字叠加 crash 背景仍清晰.
- [ ] 有无高亮时内容起始位置一致 (无列错位).
- [ ] 切换视图格式不影响查询与滚动位置.

**回滚点**: 单独 commit.

---

## 阶段 2: PID -> 进程名映射 (后端 + 缓存)

- [ ] `logcat.rs` 新增 `ProcessEntry` 与 `list_device_processes` command: 优先 `ps -A -o PID,NAME`, 按 `PID` 与 `NAME` / `CMD` / `COMMAND` 表头定位列, 非数字 PID 跳过; 仅在明确不支持选项时依次兼容 `ps -A` 或裸 `ps`.
- [ ] 注册进 `lib.rs` 的 `generate_handler!`.
- [ ] Rust 单测: `-o PID,NAME` 标准输出解析; `ps -A` 回退解析; 表头跳过; 非数字 PID 行跳过; 内核线程名 `[kworker/0:1]` 原样保留; 进程名含 `:remote` 保留完整.
- [ ] `lib/tauri.ts`: 加 `ProcessEntry` 接口与 `listDeviceProcesses(serial)`.
- [ ] store 扩展: `processMap`, `processMapUpdatedAt`, `processMapLoading`, `processMapKey`, `processMapError` 与 generation-scoped begin/complete/fail actions (成功时**整体替换, 不 merge**).
- [ ] 刷新接入: 会话开始一次; 复用现状 5 秒轮询 (不新增定时器); `Restart` 时重建; 切设备清空.
- [ ] 扩展现有 Activity polling controller, 在同一个 5 秒调度周期内独立读取 Activity 与进程表; 使用 `{serial, generation}` 拒绝 A -> B -> A 晚到响应, 刷新失败保留快照但不续可信期, 禁止新增第二个 timer.
- [ ] 进程快照成功发布不重建历史索引; 成功后整体替换, 内容相同也只更新成功时间.
- [ ] `normalizeLine`: 仅使用仍在可信期内的 `processMap`, 入库时一次性固化 `entry.processName` / `entry.packageName` (均可能为 null).
- [ ] `LogcatRow`: 包名列只渲染 `entry.packageName`; null 显示空, 禁止现场查最新 `processMap`.
- [ ] store/shared-polling 单测: 整体替换语义; Activity/进程结果独立; 失败不续期; 切设备/Restart 清空; A -> B -> A 晚到响应被拒绝; 历史行在 PID 复用后不变; 未知历史行不回填.

**验证**:
```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
corepack pnpm test
corepack pnpm build
```
真机:
- [ ] 开启包名列, 应用日志行显示正确包名.
- [ ] 系统进程行显示进程名或空, 无错误的应用包名.
- [ ] 强停应用后重启, 新 PID 的行显示新包名, 无陈旧映射.
- [ ] 未知 PID 显示空.
- [ ] 断开设备使刷新失败, 确认已有映射保留且不显示错误内容.
- [ ] 切设备后映射完全重建, 无上一台设备残留.
- [ ] 稳态下观察 5 秒轮询期间无周期性卡顿 (证明未做无条件重建).

**风险行为**: `ps` 输出格式跨 Android 版本差异较大, 回退路径必须实测. 若手头设备只覆盖一种格式, 记录未覆盖的情形.
**回滚点**: 单独 commit.

---

## 阶段 3: `process:` 与 `package:` 升级

- [ ] `lib/logcatQuery.ts`: 键集合加 `process`; AST 加 `{ type: "process"; match: Matcher }`; 支持 `~`/`=`/否定; 移除"暂不支持"专用错误.
- [ ] `EvalContext` 改为 `{ currentPackage }`, 移除 `packagePids` / `resolvedPackages`.
- [ ] `process:` 求值匹配行上固化的 `processName`; `package:` 匹配行上固化的 `packageName`; `mine` 用 `currentPackage`.
- [ ] 当前前台包变化时, 若活动查询含 `package:mine`, 原子重建一次索引.
- [ ] 移除 store 的 `packagePids` / `resolvedPackages` / `packageResolving` / `setPackagePids` 及 C 阶段按包名的异步解析路径 (**保留** `get_package_pids` command 本身, 它是现状 API).
- [ ] 查询框旁的状态提示简化为 `读取进程表...`.
- [ ] 补全候选: `process:` 后提示当前 `processMap` 中的进程名.
- [ ] 单测: `process:` 各修饰符与否定; 映射未知时返回 false; `package:` 基于正向映射的命中 (含 `:remote` 子进程同包名命中); `package:mine`.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
真机 (需阶段 0 准备的多进程应用):
- [ ] `process:<完整进程名>` 命中; `:remote` 子进程可单独定位.
- [ ] `process~:` / `process=:` / `-process:` 均生效.
- [ ] **关键验证**: 进程表已就绪后让同一应用主进程与 `:remote` 子进程同时产生日志, `package:<包名>` 两者都命中.
- [ ] `package:mine` 语义不变.
- [ ] 映射建立前的历史未知行保持未知, 不被未来 PID 快照错标.
- [ ] C 阶段的 `process:` 暂不支持提示已消失.

**回滚点**: 单独 commit.

---

## 阶段 4: Soft-Wrap 动态行高 (最高风险, 放最后)

- [ ] `LogcatList`: `estimateSize` 在 `softWrap` 关闭时返回固定 20, 开启时返回估算值.
- [ ] `LogcatRow`: props 加 `softWrap`; 开启时 ref 传 `virtualizer.measureElement` 并去掉固定 height, message 列改 `whitespace-pre-wrap break-words`; 关闭时 ref 传 `undefined` 且完全走原固定行高路径; 保留 `data-index` 与 `data-seq`.
- [ ] `useFollowScroll`: soft-wrap 开启时在测量回调后追加一次吸底 (风险 1 对策).
- [ ] ring buffer 淘汰的滚动补偿: 用 virtualizer 测量缓存累加被移除行高度, 未测量的用估算值 (风险 2 对策).
- [ ] 锚定行位置补偿入口 (B 收敛的那一处) 改为基于 virtualizer 偏移查询 (风险 3 对策).

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
真机, 逐项 (这一阶段的冒烟最关键, 不可省略):
- [ ] **关闭状态与基线一致**: 行高, 列宽, 截断行为与阶段 0 基线完全相同.
- [ ] **关闭状态不测量**: 确认关闭时不调用测量 (可临时插桩计数).
- [ ] 开启后一条完整 Java 异常堆栈可在列表内读完.
- [ ] 开启 + 跟随底部 + 高频日志: 滚动稳定, 无持续抖动.
- [ ] 开启 + detached + 向上浏览历史: 视口无明显跳动.
- [ ] 开启 + 触发 ring buffer 淘汰 (让日志超过 10000 行) + detached: 无明显漂移.
- [ ] 开启状态下点击行锚定, 该行在后续流入中保持可见.
- [ ] 反复开关 soft-wrap 10 次: 滚动位置不丢失, 列表不空白.
- [ ] 开启 + 切 tab 走开再回来: 测量恢复正常, 无空白帧.

**若稳定性不达标**: 启用 design 1.4 的回退方案 (优先"限高多行", 其次"点击展开浮层"), 在此处记录现象与决定, 并同步修订 design 1.4 与 prd 的对应验收标准. 注意"点击展开浮层"同时满足 journal Session 4 记录的"行展开复制"诉求, 不是单纯降级.

**回滚点**: 单独 commit. 本阶段是唯一可能需要整体回退的阶段, 前三个阶段的收益不受影响.

---

## 阶段 5: 质量门与 spec 同步

- [ ] 派发 `trellis-check`.
- [ ] 全量验证:
```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
corepack pnpm test
corepack pnpm build
```
- [ ] 布局冒烟: 工具栏新增了 soft-wrap 开关与视图菜单, 在 1200x800 与 900x600 下重新验证不重叠.
- [ ] 回归 A/B/C 全部能力: 数据通道, 暂停/ScrollToEnd/Restart, 断开提示, 清屏与清设备缓冲, 切 tab 不丢现场, 查询语言全部语法.
- [ ] 导出内容不受视图格式与 soft-wrap 影响 (仍是 `raw`).
- [ ] 更新四处 spec (按 design 第九节): `backend/quality-guidelines.md`, `frontend/quality-guidelines.md`, `frontend/component-guidelines.md`, `frontend/directory-structure.md`.
- [ ] 提交.

---

## 阶段 6: 移交父任务集成评审

本任务是最后一个子任务, 完成后需要触发父任务的集成评审.

- [ ] 按父任务 prd 的"跨子任务验收标准"逐条执行.
- [ ] 特别确认无临时兼容代码残留:
  - [ ] `LogcatFilter` / `matchesFilter` 已不存在 (C 应已删除).
  - [ ] 旧的四套过滤控件已不存在 (C 应已删除).
  - [ ] `logcat-line` 单行事件通道已不存在 (A 应已删除).
  - [ ] `components/Logcat.tsx` 与 `components/LogcatViewer.tsx` 已不存在 (B 应已删除).
  - [ ] C 阶段的 `packagePids` 相关状态已不存在 (D 阶段 3 应已删除).
- [ ] 逐条核对父任务 design 第七节的 spec 更新总清单, 确认 `.trellis/spec/` 中无与最终代码矛盾的 logcat 描述.
- [ ] 归档四个子任务与父任务.

---

## 收口声明

**本任务显式不做**:

- Up/Down the Stack Trace 导航, 多标签页与分屏, Print / Screen Capture / Screen Record —— 父任务"不做范围".
- 视图格式的持久化 —— 父任务"不做范围", 会话内有效即可.
- 移除 `get_package_pids` command —— 它是现状 API, 可能有其他调用方, 移除不属于本任务.
- 数据通道, 交互模型, 查询语法的任何其他改动.

---

## 继续实现前需要确认

- Compact 视图默认字段. 当前设计为短时间 + 等级 + message. 若希望保留 tag, 需在阶段 1 前确认.
- 若阶段 4 的动态测量稳定性不达标, 选择哪个回退方案. 当前优先级为"限高多行" > "点击展开浮层", 但后者对"复制单条异常"的实用价值更高, 可在真机表现出来后重新权衡.
- 阶段 2 的 `ps` 输出格式若在手头设备上只覆盖一种, 回退路径的实测覆盖不足需要记录为已知风险.
