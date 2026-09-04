# 执行计划:设备性能实时监控

分 6 步。每步结束后主干都应处于可编译、可运行状态,便于随时中断或回滚。
纯逻辑步骤(S1、S3)先于装配步骤,保证核心算法在接进 UI 之前就有测试兜底。

## S1 · Rust 采集会话骨架与解析纯函数

新建 `src-tauri/src/commands/device_metrics.rs`:

- [x] 定义数据结构:`DeviceMetricsFrame` / `CpuUsage` / `MemoryUsage` / `BatteryUsage` /
      `ProcessUsage` / `DeviceMetricsSessionInfo` / `DeviceMetricsExit`(契约见 design.md §3)。
- [x] 纯解析函数(全部可单测,不碰 `AppHandle`):
      - `parse_cpu_line(&str) -> Option<CpuTotals>`
      - `parse_meminfo(&str) -> MemoryUsage`(`MemAvailable` 缺失时回退 `MemFree+Buffers+Cached`)
      - `parse_pid_stat(&str) -> Option<PidSample>`(**用最后一个 `)` 定位 comm 结束**)
      - `parse_battery(&str) -> BatteryUsage`(复用 `device_info.rs:63` 的状态码映射口径)
      - `cpu_percent(prev, next) -> Option<f32>`(`Δtotal <= 0` 返回 `None`)
      - `top_process_union(prev, next, limit) -> Vec<ProcessUsage>`(按 CPU / 按 RSS 各取前 15 求并集)
      - `split_frames(...)`:解析 `#I` 初始化行,并按 `#F`、`#C/#M/#P/#B`、`#/F` 切帧,
        未闭合帧丢弃
- [x] `#[cfg(test)]` 单测,必须覆盖:
      - comm 含空格与右括号:`(Chrome_IO Thread)`、`(a)b)`
      - `MemAvailable` 缺失的旧内核 meminfo
      - `Δtotal <= 0` 与计数器回绕
      - 新出现的 PID 只报 RSS、CPU% 记 0
      - 半帧(EOF 前未见 `#/F`)被丢弃
      - 每个业务帧只生成一个事件,重量段不会重复追加历史点
      - 初始化帧的页大小/核心数非法时使用明确回退
- [x] 把 `device_info.rs` 的电池字段解析提取为共享纯函数,静态设备详情与 metrics 复用同一状态码
      和温度口径,避免两份电池事实源;补解析单测。

**验证**:`cargo test --manifest-path src-tauri/Cargo.toml`

## S2 · Rust 会话生命周期与事件

- [x] 按 design.md §6 的对照表复用 logcat 的并发机制:全局单例 + 全局 start lock、
      `start_after_stopping`、关闭期拒绝、注册失败回收子进程、kill + 3s 超时 wait、
      stderr tail 限长 2KB、`kill_on_drop(true)`。**读循环不需要批量聚合分支**(帧率仅 1Hz)。
- [x] 子进程经 `adb::prepare_async_command`(`adb.rs:152`)创建;设备端脚本与采样频率均为字面量常量。
- [x] 同一 stdout 的 `#I` 初始化行取 `PAGE_SIZE` 与 CPU 核数,失败分别回退 4096 与
      `/proc/stat` 可见核心数,不为初始化额外 spawn adb。
- [x] `start_device_metrics` / `stop_device_metrics` / `shutdown_device_metrics_sessions`。
      stop 必须校验 serial + session_id,迟到 cleanup 无操作返回。
- [x] `commands/mod.rs` 加 `pub mod device_metrics;`;`lib.rs` 的 `generate_handler!`
      (`lib.rs:181`)注册 2 个 command;`RunEvent::Exit`(`lib.rs:236`)在
      `shutdown_logcat_sessions` 之后增加 `shutdown_device_metrics_sessions()`。

**验证**:`cargo test` + `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings`
(clippy 对 `unwrap()` 与阻塞调用的约束见 backend spec)

## S3 · 前端纯逻辑与 store

- [x] `src/lib/deviceMetrics.ts`:环形缓冲(定长数组 + 写指针,O(1) 覆盖写,
      **禁止 `[...history, next]` / `slice()`**)、`downsample()`(窗口取极值以保留尖峰)、
      数值格式化(百分比、MB/GB、温度)。
- [x] `src/lib/deviceMetrics.test.ts`:容量上限后覆盖最旧、写满前后读取顺序、
      降采样点数上界与尖峰保留、格式化边界(0、超大值、缺失值)。
- [x] `src/store/deviceMetrics.ts`:采集状态机(idle/starting/streaming/stopped/error)、
      有界历史、最新进程表、`session_id` 校验丢弃迟到帧、物理设备切换清空。
- [x] `src/store/deviceMetrics.test.ts`:设备切换清空历史、旧 session 事件被丢弃、
      同 deviceKey 的 transport serial 迁移保留历史、历史长度不超过容量上限。

**验证**:`corepack pnpm test`

## S4 · 桥接层与会话装配

- [x] `src/lib/tauri.ts` 增加类型与 `startDeviceMetrics` / `stopDeviceMetrics(serial, sessionId)` /
      `onDeviceMetricsFrame` / `onDeviceMetricsExit`(不得在组件里直接 import
      `@tauri-apps/api/core` —— frontend spec 的 forbidden pattern)。
- [x] `src/hooks/useDeviceMetricsSession.ts`:按 design.md §5 的触发条件启停会话,
      `useEffect` 内注销监听与停止会话(frontend spec 要求 listener/timer 必须清理),
      错误走 toast 且同一错误不重复(参考 `App.tsx:155` 的去重写法)。

**验证**:`corepack pnpm build`(严格 TS 检查)

## S5 · 面板 UI

- [x] `src/components/performance/MetricChart.tsx`:手写 SVG 折线,路径字符串用 `useMemo`
      绑定 `revision`;悬停读数;亮/暗色沿用现有 token(`border-rule`、`text-ink3` 等)。
- [x] `src/components/performance/ProcessTable.tsx`:CPU / 内存排序切换;进程名优先取
      `useLogcatStore` 的 process map(已由 `App.tsx:145` 常驻维护,零额外设备开销),
      缺失回退 comm;`currentPackage` 所在行高亮。
- [x] `src/components/performance/PerformancePanel.tsx`:指标卡 + 曲线 + 进程表 +
      「切换面板时继续采集」开关 + 离线/错误状态。
- [x] 所有 `<button>` 带 `type="button"`,条件类名走 `cn()`,导入用 `@/` 别名。

**验证**:`corepack pnpm build`

## S6 · 工作区接入(风险最高,单独一步)

- [x] `src/store/ui.ts`:`PaneId`(`ui.ts:4`)与 `PANE_IDS`(`ui.ts:11`)加 `"perf"`,
      `DEFAULT_LOG_OPEN_BY_PANE`(`ui.ts:13`)加 `perf: false`。
- [x] `src/components/layout/IndexRail.tsx:24` 的 `PANES` 增加
      `{ id: "perf", index: "06", label: "性能", icon: Activity }`。
- [x] `src/App.tsx` 增加 `<WorkspacePane id="perf">`,把 `activePane === "perf"` 传给面板
      作为可见性来源(与 `ScreenRecordTool` 的 `active` prop 同一约定)。

**验证**:`corepack pnpm test`(**必须跑 `src/store/ui.test.ts` 回归** —— 这一步动的是
所有 pane 共用的持久化结构)+ `corepack pnpm build`

## 全量验证命令

```bash
corepack pnpm test
corepack pnpm build
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

## 真机冒烟(必须在真实设备上做,不能以 build 通过替代)

按 backend/frontend spec 的 Testing Requirements,以下路径跨越 ADB 边界或涉及长时间运行,
构建通过不能替代真机验证:

1. 面板打开 → CPU/内存/电池数值在 1s 量级更新,曲线延伸。
2. CPU 读数与 `adb shell top -b -n 2 -d 1` 的整机值比对,误差 < 5 个百分点。
3. 进程表排序切换正确,前台应用行高亮。
4. 拔出设备 / 切换设备 → 会话停止,无 toast 刷屏;`ps` 中无孤儿 `adb ... shell`。
5. 同一设备 USB/WiFi 主传输切换 → 会话迁移,历史保留;切到另一 `device_id` 才清空。
6. 关闭应用 → `adb shell ps -A` 中无残留采样循环。
7. **NFR-1**:连续跑 30 分钟,历史点数稳定在上限;跳过前 5 分钟预热后,ADB GUI 进程
   RSS 在后 25 分钟净增长 < 15MiB,按 5 分钟窗口不呈单调上升。
8. **NFR-2**:宿主机 ADB GUI 进程 CPU 增幅 < 3%;设备端做 3 轮各 60s 开/关交替采样,
   平均 CPU 增幅 < 2 个百分点。
9. Windows 上确认无一闪而过的控制台窗口(`prepare_async_command` 的 `CREATE_NO_WINDOW` 路径)。

## 验收记录(2026-09-04)

- 真机面板持续显示 CPU、内存、电池和进程数据,刷新周期约 1s;曲线悬停实际显示
  `09:33:18 / 47.2%`。
- 同一时间窗 CPU 对照:`top` 整机占用约 12.9%,`/proc/stat` 差分约 10.2%,误差约
  2.6 个百分点,满足 `< 5`。
- 断流恢复:终止 metrics 子进程 PID `71625` 后,面板显示「已中断」和
  `Device metrics process exited (stdout EOF)`;无残留采集进程。点击「重新采集」后仅启动
  PID `77423`,实时数据恢复。
- 退出清理:仅通过应用菜单 `ADB GUI -> Quit ADB GUI` 的 `terminate:` action 退出。退出后应用
  PID `67772`、metrics PID `77423`、设备端采样 shell PID `8730` 均不存在。项目代码与脚本中
  不存在系统注销命令;禁止使用退出快捷键驱动自动化。
- NFR-1:连续运行 `1803s`;RSS 初始 `101600 KiB`,第 5 分钟 `102624 KiB`,第 30 分钟
  `97104 KiB`;预热后 25 分钟净变化 `-5520 KiB`,且 5 分钟窗口均值不单调上升。
- NFR-2:3 轮各 60s 开/关对照,设备关闭平均 `5.948%`,开启平均 `7.712%`,增量
  `1.763` 个百分点;宿主机 ADB GUI CPU 增量约 `-0.030%`。
- 同设备 transport serial 迁移保留历史、不同 `device_id` 清空历史由 store 回归测试覆盖。
  本机虽同时发现 USB/WiFi 两条传输,但未物理断开 USB 触发自动迁移。
- Windows 视觉冒烟在当前 macOS 环境不可执行;已确认采集子进程统一经过
  `adb::prepare_async_command`,Windows 分支设置 `CREATE_NO_WINDOW`。
- 自动化门禁:`corepack pnpm test` 327 项通过,`corepack pnpm build` 通过,Rust 109 项测试在
  60s 门禁内通过,`cargo fmt --check`、`cargo clippy --all-targets -- -D warnings` 和
  `git diff --check` 通过。

## 风险文件与回滚点

| 文件 | 风险 | 回滚点 |
|---|---|---|
| `src/store/ui.ts` | 改的是所有 pane 共用的持久化结构,写错会影响既有日志开关记忆 | S6 单独成步;`restoreLogOpenByPane`(`ui.ts:139`)已按 `PANE_IDS` 补齐缺失键,升级安全;回退此文件即恢复 |
| `src-tauri/src/lib.rs` | `RunEvent::Exit` 里新增的 shutdown 若阻塞会拖住应用退出 | 复用 `stop_logcat_session` 的 3s 超时;回退 shutdown 调用即可 |
| `device_metrics.rs` 会话管理 | 并发下泄漏 adb 子进程是最难查的失败模式 | 严格照 design.md §6 对照表复刻;`kill_on_drop(true)` 兜底;S2 结束即验孤儿进程 |
| 设备端脚本 | 拼接变量会引入命令注入风险 | 脚本与采样频率均为字面量常量,不接受用户输入(NFR-3) |

## `task.py start` 之前的确认项

- [x] 用户已 review `prd.md` / `design.md` / `implement.md`。
- [x] 确认 D1/D2/D3 与 D4 附加约束无变更;已纳入单事件帧、单例会话与同设备传输迁移约束。
- [x] `task.py set-branch claude/android-device-monitoring-oco3e3`。
