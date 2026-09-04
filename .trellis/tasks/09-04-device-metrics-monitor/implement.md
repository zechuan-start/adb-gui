# 执行计划:设备性能实时监控

分 6 步。每步结束后主干都应处于可编译、可运行状态,便于随时中断或回滚。
纯逻辑步骤(S1、S3)先于装配步骤,保证核心算法在接进 UI 之前就有测试兜底。

## S1 · Rust 采集会话骨架与解析纯函数

新建 `src-tauri/src/commands/device_metrics.rs`:

- [ ] 定义数据结构:`DeviceMetricsFrame` / `CpuUsage` / `MemoryUsage` / `BatteryUsage` /
      `ProcessUsage` / `DeviceMetricsSessionInfo` / `DeviceMetricsExit`(契约见 design.md §3)。
- [ ] 纯解析函数(全部可单测,不碰 `AppHandle`):
      - `parse_cpu_line(&str) -> Option<CpuTotals>`
      - `parse_meminfo(&str) -> MemoryUsage`(`MemAvailable` 缺失时回退 `MemFree+Buffers+Cached`)
      - `parse_pid_stat(&str) -> Option<PidSample>`(**用最后一个 `)` 定位 comm 结束**)
      - `parse_battery(&str) -> BatteryUsage`(复用 `device_info.rs:63` 的状态码映射口径)
      - `cpu_percent(prev, next) -> Option<f32>`(`Δtotal <= 0` 返回 `None`)
      - `top_process_union(prev, next, limit) -> Vec<ProcessUsage>`(按 CPU / 按 RSS 各取前 15 求并集)
      - `split_frames(...)`:按 `#F <kind>` / `#S` / `#/F` 切帧,未闭合帧丢弃
- [ ] `#[cfg(test)]` 单测,必须覆盖:
      - comm 含空格与右括号:`(Chrome_IO Thread)`、`(a)b)`
      - `MemAvailable` 缺失的旧内核 meminfo
      - `Δtotal <= 0` 与计数器回绕
      - 新出现的 PID 只报 RSS、CPU% 记 0
      - 半帧(EOF 前未见 `#/F`)被丢弃
      - 采样间隔校验拒绝越界值(NFR-3)

**验证**:`cargo test --manifest-path src-tauri/Cargo.toml`

## S2 · Rust 会话生命周期与事件

- [ ] 按 design.md §6 的对照表复刻 logcat 的并发机制:per-serial start lock、
      `start_after_stopping`、关闭期拒绝、注册失败回收子进程、kill + 3s 超时 wait、
      stderr tail 限长 2KB、`kill_on_drop(true)`。**读循环不需要批量聚合分支**(帧率仅 1Hz)。
- [ ] 子进程经 `adb::prepare_async_command`(`adb.rs:152`)创建;设备端脚本为字面量常量。
- [ ] 会话建立时取一次 `getconf PAGE_SIZE` 校正 RSS 页大小,失败回退 4096。
- [ ] `start_device_metrics` / `stop_device_metrics` / `shutdown_device_metrics_sessions`。
- [ ] `commands/mod.rs` 加 `pub mod device_metrics;`;`lib.rs` 的 `generate_handler!`
      (`lib.rs:181`)注册 2 个 command;`RunEvent::Exit`(`lib.rs:236`)在
      `shutdown_logcat_sessions` 之后增加 `shutdown_device_metrics_sessions()`。

**验证**:`cargo test` + `cargo fmt --check` + `cargo clippy --all-targets -- -D warnings`
(clippy 对 `unwrap()` 与阻塞调用的约束见 backend spec)

## S3 · 前端纯逻辑与 store

- [ ] `src/lib/deviceMetrics.ts`:环形缓冲(定长数组 + 写指针,O(1) 覆盖写,
      **禁止 `[...history, next]` / `slice()`**)、`downsample()`(窗口取极值以保留尖峰)、
      数值格式化(百分比、MB/GB、温度)。
- [ ] `src/lib/deviceMetrics.test.ts`:容量上限后覆盖最旧、写满前后读取顺序、
      降采样点数上界与尖峰保留、格式化边界(0、超大值、缺失值)。
- [ ] `src/store/deviceMetrics.ts`:采集状态机(idle/starting/streaming/stopped/error)、
      有界历史、最新进程表、`session_id` 校验丢弃迟到帧、设备切换清空。
- [ ] `src/store/deviceMetrics.test.ts`:设备切换清空历史、旧 session 事件被丢弃、
      历史长度不超过容量上限。

**验证**:`corepack pnpm test`

## S4 · 桥接层与会话装配

- [ ] `src/lib/tauri.ts` 增加类型与 `startDeviceMetrics` / `stopDeviceMetrics` /
      `onDeviceMetricsFrame` / `onDeviceMetricsExit`(不得在组件里直接 import
      `@tauri-apps/api/core` —— frontend spec 的 forbidden pattern)。
- [ ] `src/hooks/useDeviceMetricsSession.ts`:按 design.md §5 的触发条件启停会话,
      `useEffect` 内注销监听与停止会话(frontend spec 要求 listener/timer 必须清理),
      错误走 toast 且同一错误不重复(参考 `App.tsx:155` 的去重写法)。

**验证**:`corepack pnpm build`(严格 TS 检查)

## S5 · 面板 UI

- [ ] `src/components/performance/MetricChart.tsx`:手写 SVG 折线,路径字符串用 `useMemo`
      绑定 `revision`;悬停读数;亮/暗色沿用现有 token(`border-rule`、`text-ink3` 等)。
- [ ] `src/components/performance/ProcessTable.tsx`:CPU / 内存排序切换;进程名优先取
      `useLogcatStore` 的 process map(已由 `App.tsx:145` 常驻维护,零额外设备开销),
      缺失回退 comm;`currentPackage` 所在行高亮。
- [ ] `src/components/performance/PerformancePanel.tsx`:指标卡 + 曲线 + 进程表 +
      「切换面板时继续采集」开关 + 离线/错误状态。
- [ ] 所有 `<button>` 带 `type="button"`,条件类名走 `cn()`,导入用 `@/` 别名。

**验证**:`corepack pnpm build`

## S6 · 工作区接入(风险最高,单独一步)

- [ ] `src/store/ui.ts`:`PaneId`(`ui.ts:4`)与 `PANE_IDS`(`ui.ts:11`)加 `"perf"`,
      `DEFAULT_LOG_OPEN_BY_PANE`(`ui.ts:13`)加 `perf: false`。
- [ ] `src/components/layout/IndexRail.tsx:24` 的 `PANES` 增加
      `{ id: "perf", index: "06", label: "性能", icon: Activity }`。
- [ ] `src/App.tsx` 增加 `<WorkspacePane id="perf">`,把 `activePane === "perf"` 传给面板
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
5. 关闭应用 → `adb shell ps -A` 中无残留采样循环。
6. **NFR-1**:连续跑 30 分钟,历史点数稳定在上限,JS heap 增量 < 10MB 且非单调上升。
7. **NFR-2**:对比面板开/关时宿主机 ADB GUI 进程 CPU 占用,增幅 < 3%;
   设备端 CPU 曲线不因采集本身出现可观测抬升。
8. Windows 上确认无一闪而过的控制台窗口(`prepare_async_command` 的 `CREATE_NO_WINDOW` 路径)。

## 风险文件与回滚点

| 文件 | 风险 | 回滚点 |
|---|---|---|
| `src/store/ui.ts` | 改的是所有 pane 共用的持久化结构,写错会影响既有日志开关记忆 | S6 单独成步;`restoreLogOpenByPane`(`ui.ts:139`)已按 `PANE_IDS` 补齐缺失键,升级安全;回退此文件即恢复 |
| `src-tauri/src/lib.rs` | `RunEvent::Exit` 里新增的 shutdown 若阻塞会拖住应用退出 | 复用 `stop_logcat_session` 的 3s 超时;回退 shutdown 调用即可 |
| `device_metrics.rs` 会话管理 | 并发下泄漏 adb 子进程是最难查的失败模式 | 严格照 design.md §6 对照表复刻;`kill_on_drop(true)` 兜底;S2 结束即验孤儿进程 |
| 设备端脚本 | 拼接变量会引入命令注入风险 | 脚本为字面量常量,唯一数值参数在 Rust 侧做范围校验(NFR-3),S1 单测覆盖 |

## `task.py start` 之前的确认项

- [ ] 用户已 review `prd.md` / `design.md` / `implement.md`。
- [ ] 确认 D1/D2/D3 与 D4 附加约束无变更。
- [ ] `task.py set-branch claude/android-device-monitoring-oco3e3`。
