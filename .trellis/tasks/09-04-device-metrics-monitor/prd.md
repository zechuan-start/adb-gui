# 设备性能实时监控

## Goal

为选中设备提供持续的运行状态监控:实时采集整机 CPU、内存、电池指标与进程占用,保留一段时间的
历史曲线,让开发者在复现问题、跑压测、观察应用启动时能直接在 ADB GUI 内看到设备负载变化,
而不必手工反复敲 `adb shell top` / `dumpsys meminfo`。

## Confirmed Facts (from repository inspection)

采集能力现状:

- `src-tauri/src/commands/device_info.rs:20` 的 `get_device_info` 已按需采集静态规格与电量
  (`dumpsys battery` 解析在 `device_info.rs:63`),但是一次性调用,无历史、无周期。
- `src-tauri/src/commands/logcat.rs:418` 的 `list_device_processes` 已能拿到 `ps -A` 进程表
  (含 `Formatted → All → Plain` 三级降级),但只有 PID/NAME,不含 CPU/内存占用。
- `src/App.tsx:145` 已在设备在线时常驻运行 activity 轮询(5s),其中 `loadProcesses` 会持续把
  PID→进程名映射写入 `useLogcatStore` 的 process map。**这个映射本任务可以直接复用,零额外设备开销。**
- 暂无任何采集 `/proc/stat`、`/proc/meminfo`、`/proc/<pid>/stat` 的代码。

可复用基建:

- 常驻流式会话:`src-tauri/src/commands/logcat.rs` 已实现 `tokio::process::Child` + `app.emit` +
  `session_id` 校验(`logcat.rs:85`)+ start lock(`logcat.rs:71`)+ 关闭期拒绝 +
  `start_after_stopping`(`logcat.rs:122`)+ `stop_all_sessions`(`logcat.rs:93`)+ stderr tail 限长
  (`logcat.rs:665`)的完整模式,退出时由 `lib.rs:240` 的 `shutdown_logcat_sessions` 收尾。
- ADB 异步进程构建:`adb::prepare_async_command`(`adb.rs:152`,已处理 Windows `CREATE_NO_WINDOW`
  与 Linux `LD_LIBRARY_PATH`)。
- 前端桥接层 `src/lib/tauri.ts`;工作区 pane 定义 `src/store/ui.ts:4`,导航 `IndexRail.tsx:24`。

约束:

- `package.json` 无图表库;曲线需手写 SVG(与项目现有手写 UI 风格一致),不引入新依赖。
- Android 9+ `/proc` 以 `hidepid=2` 挂载,但 `shell` 用户属于 `readproc` 组,`/proc/<pid>/stat` 可读。
- 后端 spec 要求:command 返回 `Result<T, String>`、禁止 `unwrap()`、新 command 必须注册进
  `lib.rs` 的 `generate_handler!`、ADB 参数不得拼接用户输入为 shell 命令。

## Decisions

- **D1 界面落点**:新增独立「性能」工作区(`PaneId` 增加一项,IndexRail 第 06 项)。面板内含
  指标卡、手写 SVG 历史曲线、Top N 进程占用表。
  否决:tools 工具卡片(240px 放不下曲线)、仅在 DeviceSpecStrip 加字段(无历史)。
- **D2 指标范围**:整机指标 + Top N 进程占用。不做选定应用的 `dumpsys meminfo` PSS 分解与
  `gfxinfo` 帧率(留作后续任务)。
- **D3 采集架构**:后端常驻 `adb shell` 采样会话 + 双频帧。轻量帧 1s,重量帧 5s。
  否决:前端定时轮询(每次 spawn adb 进程,长时间监控在宿主机上产生可见 CPU 占用)。
- **D4 用户附加硬约束(本次明确提出)**:长时间运行不得持续堆积内存,且采集本身不得制造明显
  CPU 占用。这条升级为下方的 NFR-1 / NFR-2,并写入验收标准。

## Requirements

### 功能需求

- **FR-1 工作区**:新增「性能」工作区,可从 IndexRail 切换;沿用现有 pane 持久化机制。
- **FR-2 整机指标**:展示并按时间累积以下指标
  - CPU 总利用率(`/proc/stat` 首行两帧差分,`(Δtotal − Δidle − Δiowait) / Δtotal`)
  - 内存:总量 / 已用 / 可用(`/proc/meminfo`,`MemAvailable` 缺失时回退 `MemFree+Buffers+Cached`)
  - 电池:电量百分比、充放电状态、电池温度(`dumpsys battery` 的 `temperature`,单位 0.1°C)
- **FR-3 历史曲线**:手写 SVG 折线图展示 CPU 与内存的历史序列,鼠标悬停可读出该时刻数值与时间。
- **FR-4 进程占用表**:每重量帧刷新一次,展示各进程「占整机 CPU %」与 RSS,支持按 CPU / 按内存
  切换排序;进程名优先取现有 process map 中的完整包名,缺失时回退 `/proc/<pid>/stat` 的 comm;
  当前前台应用(store 中的 `currentPackage`)所在行高亮。
- **FR-5 生命周期**:设备在线且面板可见时自动开始采集;切走面板默认停止采集但**保留历史**,
  提供「切换面板时继续采集」开关(默认关闭);设备切换或离线时停止会话并清空历史。
- **FR-6 错误可见**:采样会话异常退出(设备拔出、adb 断流)时面板给出明确状态而非静默卡住,
  错误提示复用现有 toast,且同一错误不重复刷屏(参考 `App.tsx:155` 的去重写法)。

### 非功能需求

- **NFR-1 内存有界**:前端历史使用固定容量环形缓冲(默认 1800 点 = 1s × 30min),写满覆盖最旧;
  进程数据只保留最新帧与上一帧(用于差分),不进历史;后端不缓存历史序列,只持有上一帧。
- **NFR-2 采集开销低**:宿主机全程只 spawn 一个 adb 子进程;设备端 1s 帧仅 2 次 `cat`;
  重量帧仅 1 次 glob `cat` + 1 次 `dumpsys battery`;
  `/proc/<pid>/stat` 的解析与差分在 Rust 侧完成,只把 Top N 结果发进 webview,
  避免每 5s 向前端投递数百行文本。
- **NFR-3 安全**:设备端脚本为固定字面量,唯一可变量是数值型采样间隔,发送前做范围校验,
  不拼接任何用户输入(后端 spec 的 code review checklist 要求)。
- **NFR-4 跨平台**:子进程经 `adb::prepare_async_command` 创建,继承 Windows 无控制台窗口与
  Linux `LD_LIBRARY_PATH` 处理;应用退出时会话必须被收敛,不留孤儿进程。

## Acceptance Criteria

- [ ] IndexRail 出现「性能」入口,切换后显示监控面板;刷新应用后 pane 选择仍被正确恢复。
- [ ] 设备在线且面板可见时,CPU / 内存 / 电池数值在 1s 量级持续更新,曲线随时间延伸。
- [ ] CPU 利用率与设备端 `adb shell top -b -n 2 -d 1` 的整机读数在同一量级(误差 < 5 个百分点)。
- [ ] 进程表能列出占用最高的进程,按 CPU / 按内存切换排序正确,前台应用行高亮。
- [ ] 拔出设备或切换设备:采样会话停止,面板显示离线状态,无 toast 刷屏,无残留 adb 子进程
      (`ps` 中无孤儿 `adb ... shell` 进程)。
- [ ] 关闭应用后设备端采样脚本终止(`adb shell ps -A | grep sh` 中无残留循环)。
- [ ] **NFR-1 验证**:连续采集 30 分钟后,历史点数稳定在容量上限不再增长,webview JS heap
      增量 < 10MB 且不呈单调上升。
- [ ] **NFR-2 验证**:面板打开且持续采集时,宿主机上 ADB GUI 进程的 CPU 占用相对空闲基线
      增幅 < 3%;设备端不因采集出现可观测的 CPU 抬升(对照面板关闭时的 CPU 曲线基线)。
- [ ] `corepack pnpm test`、`corepack pnpm build`、`cargo test`、`cargo fmt --check`、
      `cargo clippy -- -D warnings` 全部通过。

## Out of Scope

- 选定应用的 `dumpsys meminfo` PSS 分解、`gfxinfo` 帧率/掉帧统计(D2 明确推迟)。
- SoC / thermal_zone 温度(分区命名设备相关,易显示错误的值;v1 只用 `dumpsys battery` 的电池温度)。
- 采样数据导出为 CSV / 生成性能报告。
- 网络与磁盘 IO 指标。
- 阈值告警、录制片段标记。

## Open Questions

无。三个决策点已确认(D1/D2/D3),附加约束记为 D4。
