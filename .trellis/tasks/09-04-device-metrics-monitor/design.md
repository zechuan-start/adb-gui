# 设计:设备性能实时监控

## 1. 架构与边界

```
设备端                     Rust 后端 (device_metrics.rs)              前端
────────────────────────   ────────────────────────────────────────   ──────────────────────────
adb shell 常驻 sh 循环      读 stdout → 按帧切分 → 解析 → 跨帧差分      监听事件 → 环形缓冲 → SVG 渲染
  每 1s: 轻量帧             持有「上一帧」状态(仅 1 帧)               只持有有界历史 + 最新进程表
  每 5s: 重量帧             只 emit 结构化小 payload
```

边界划分的核心理由(直接服务 NFR-1 / NFR-2):

- **解析与差分放 Rust,不放前端。** 重量帧原始文本约 200KB(数百行 `/proc/<pid>/stat`)。
  若原样投递到 webview,每 5s 就要跨 IPC 传一次并在 JS 里解析数百行,既费 CPU 又制造垃圾回收压力。
  Rust 侧解析后只发 Top N(≤30 条)+ 几个标量,payload 降到 ~3KB。
- **历史只存前端,后端不存。** 后端保留历史会让内存随会话时长增长,且前端本来就需要一份用于渲染。
  后端只持有「上一帧」以计算差分,内存占用恒定。
- **一次 spawn,长驻。** 宿主机侧不做每秒 spawn(那是被否决的 D3 备选方案的主要代价)。

### 新增文件

| 文件 | 职责 |
|---|---|
| `src-tauri/src/commands/device_metrics.rs` | 会话生命周期、帧切分、解析、差分、emit;含 `#[cfg(test)]` 纯函数单测 |
| `src/lib/deviceMetrics.ts` | 环形缓冲、曲线降采样、格式化等纯函数 |
| `src/lib/deviceMetrics.test.ts` | 上述纯函数的 vitest 回归测试 |
| `src/store/deviceMetrics.ts` | 采集状态、有界历史、最新进程表 |
| `src/store/deviceMetrics.test.ts` | store 行为测试(容量上限、设备切换清空) |
| `src/components/performance/PerformancePanel.tsx` | 面板骨架:指标卡 + 曲线 + 进程表 |
| `src/components/performance/MetricChart.tsx` | 手写 SVG 折线图 |
| `src/components/performance/ProcessTable.tsx` | 进程占用表 |
| `src/hooks/useDeviceMetricsSession.ts` | 事件订阅与会话启停的装配 |

### 修改文件

| 文件 | 改动 |
|---|---|
| `src-tauri/src/commands/mod.rs` | `pub mod device_metrics;` |
| `src-tauri/src/lib.rs` | 注册 2 个 command;`RunEvent::Exit` 增加 `shutdown_device_metrics_sessions()` |
| `src/lib/tauri.ts` | 新类型 + `startDeviceMetrics` / `stopDeviceMetrics` / `onDeviceMetricsFrame` / `onDeviceMetricsExit` |
| `src/store/ui.ts` | `PaneId` 与 `PANE_IDS` 增加 `"perf"`,`DEFAULT_LOG_OPEN_BY_PANE` 增加 `perf: false` |
| `src/components/layout/IndexRail.tsx` | `PANES` 增加 `{ id: "perf", index: "06", label: "性能", icon: Activity }` |
| `src/App.tsx` | 增加 `<WorkspacePane id="perf">` |

## 2. 设备端采样脚本

作为**单个字面量参数**传给 `adb -s <serial> shell <script>`,不做任何字符串拼接用户输入
(唯一变量是数值间隔,已在 Rust 侧做范围校验 —— 见 NFR-3):

```sh
n=0
while true; do
  echo "#F L"
  cat /proc/stat | head -1
  cat /proc/meminfo | head -20
  echo "#/F"
  if [ $((n % 5)) = 0 ]; then
    echo "#F H"
    cat /proc/[0-9]*/stat
    echo "#S"
    dumpsys battery
    echo "#/F"
  fi
  n=$((n+1))
  sleep 1
done
```

设计要点:

- **帧用显式定界符**(`#F <kind>` / `#/F` / 段内分隔 `#S`),而不是靠行数或超时判断边界。
  读端按行累积,遇到结束符才交付;EOF 时丢弃未闭合的半帧。这让部分读、慢链路、设备卡顿都不会
  产生错位的数据。
- **重量帧用 glob `cat`**(`cat /proc/[0-9]*/stat`)而不是逐进程 `for` 循环 —— 后者在 toybox sh 里
  每个进程一次 fork,数百次 fork/5s 会在被测设备上制造可观测负载,反过来污染 CPU 曲线本身。
- **不用 `top -b -n 1`**:toybox 的单帧 `top` 其 `%CPU` 语义不是「过去一个采样周期的占用」,
  连续调用会得到误导性的数字;而 `/proc/<pid>/stat` 的 utime/stime 是单调累积量,两帧作差语义明确。
- **不用设备端时间戳**:toybox `date` 对 `%N` 支持不一致。时间戳由宿主机在帧闭合时打。
- **不读 thermal_zone**:分区命名设备相关,挑错分区会显示明显错误的温度。改用 `dumpsys battery`
  的 `temperature` 字段(0.1°C),语义确定。

## 3. 数据契约

### Rust → 前端事件

```rust
// event: "device-metrics-frame"
struct DeviceMetricsFrame {
    serial: String,
    session_id: u64,
    at_ms: i64,                       // 宿主机在帧闭合时打的时间戳
    cpu: Option<CpuUsage>,            // 首帧无前帧可差分 → None
    memory: MemoryUsage,
    battery: Option<BatteryUsage>,    // 仅重量帧携带
    processes: Option<Vec<ProcessUsage>>, // 仅重量帧携带
}

struct CpuUsage { total_percent: f32, core_count: u32 }
struct MemoryUsage { total_kb: u64, available_kb: u64, used_kb: u64 }
struct BatteryUsage { level: String, status: String, temperature_c: Option<f32> }
struct ProcessUsage { pid: String, comm: String, cpu_percent: f32, rss_kb: u64 }

// event: "device-metrics-exit"
struct DeviceMetricsExit { serial: String, session_id: u64, reason: String, detail: String }
```

### 命令

```rust
#[tauri::command] async fn start_device_metrics(app, serial: String)
    -> Result<DeviceMetricsSessionInfo, String>;   // { serial, session_id }
#[tauri::command] async fn stop_device_metrics(app, serial: String) -> Result<(), String>;
```

`session_id` 的作用与 logcat 一致:设备快速切换或重启会话时,旧会话的迟到事件必须被前端丢弃
(`logcat.rs:85` 的 `session_matches` 是同一模式)。

## 4. 计算口径

- **整机 CPU%**:取 `/proc/stat` 首行各字段和为 `total`,`idle_all = idle + iowait`,
  则 `usage = (Δtotal − Δidle_all) / Δtotal`。这个式子对采样间隔抖动天然免疫 —— 分母就是实际
  经过的 jiffies,间隔长短会同时放大分子分母,不引入偏差。
  `Δtotal <= 0`(设备重启、计数器异常)时返回 `None` 而不是 0,避免画出假的谷值。
- **单进程 CPU%**:`(Δutime + Δstime) / Δtotal`,即**占整机总算力的比例**。
  刻意不用「占单核的比例」口径,因为那会出现 >100% 的值,在一张和整机 CPU% 并列的表里会造成误读。
- **`/proc/<pid>/stat` 解析**:`comm` 字段被括号包裹且可能包含空格与右括号,必须用
  **最后一个 `)`** 定位而不是按空格切分。这是该文件格式的经典坑,单测里要覆盖
  `(Chrome_IO Thread)`、`(a)b)` 这类 comm。
- **RSS**:字段 24(以页为单位)× 页大小。页大小按 4096 处理,并在会话建立时用一次
  `getconf PAGE_SIZE` 校正(部分 arm64 设备为 16384);取不到时回退 4096。
- **进程集合**:仅对**两帧都存在**的 PID 计算 CPU%;新出现的 PID 本帧只报 RSS,CPU% 为 0
  并标记为新进程,避免把「进程自启动以来的累计时间」误当成一个周期的占用。
- **Top N 选取**:Rust 侧同时取「按 CPU 前 15」与「按 RSS 前 15」的**并集**(≤30 条)后再 emit。
  这样前端本地切换排序仍然准确,而不必把全量进程发过去。

## 5. 生命周期与状态机

```
无设备/离线 ──选中在线设备且面板可见──> starting ──首帧到达──> streaming
    ^                                      |                      |
    |                                      v                      v
    └────── 设备切换/离线/应用退出 ──── error/stopped <──exit 事件──┘
```

- 触发条件:`onlineSerial != null && (activePane === "perf" || 后台采集开关开启)`。
- 面板不可见时默认 `stop_device_metrics`(释放设备端 shell 与一路 adb 连接),
  **但保留已有历史**;重新进入面板时继续追加,曲线上留下时间空档,由渲染层按时间轴自然表现。
- 设备切换或离线:停止会话并**清空**历史(不同设备的数据不能落在同一条曲线上)。
- 应用退出:`lib.rs` 的 `RunEvent::Exit` 中调用 `shutdown_device_metrics_sessions()`,
  与既有 `shutdown_logcat_sessions()`(`lib.rs:240`)并列,先置关闭标志再 drain 并 kill 子进程。

## 6. 并发与健壮性(复用 logcat 已验证的模式)

`device_metrics.rs` 复刻以下已在 logcat 里被真机验证过的机制,不重新发明:

| 机制 | logcat 参考 | 本任务用途 |
|---|---|---|
| per-serial start lock | `logcat.rs:71` | 防止快速切换设备时并发 start 抢同一 serial |
| 先停旧会话再起新会话 | `start_after_stopping` `logcat.rs:122` | 无线 ADB 下旧客户端退出会拆掉刚建立的流 |
| 关闭期拒绝新会话 | `LOGCAT_SHUTTING_DOWN` | 退出过程中不再产生新子进程 |
| 注册失败时回收子进程 | `logcat.rs:536` | 避免竞态下泄漏 adb 进程 |
| kill + 超时 wait | `stop_logcat_session` `logcat.rs:138` | 3s 超时,避免退出被卡死 |
| stderr tail 限长 | `append_stderr_tail` `logcat.rs:665` | 2KB 上限,退出原因可诊断且内存有界 |
| `kill_on_drop(true)` | `logcat.rs:504` | 兜底,不留孤儿进程 |

差异点:logcat 需要 50ms 批量聚合(高频行),本任务帧率只有 1Hz,**不需要批处理**,
每帧闭合即 emit,读循环因此比 logcat 简单得多(无 `batch_deadline` 分支)。

## 7. 前端内存有界的具体做法

- 环形缓冲实现在 `src/lib/deviceMetrics.ts`:定长数组 + 写指针 + 长度,`push` 为 O(1) 覆盖写,
  **不使用 `[...history, next]` 或 `slice()`** —— 那会每秒重建一个上千元素的数组,
  是长时间运行下 GC 压力的主要来源。
- 容量常量 `METRICS_HISTORY_CAPACITY = 1800`(30 分钟 @1Hz)。
- 渲染前按目标像素宽度降采样到 ≤ 300 个点位(`downsample()` 纯函数,取窗口内极值以保留尖峰),
  SVG 路径点数因此与运行时长无关。
- 进程表只保存最新一帧;Zustand 中用整体替换而非累积。
- 图表组件用 `useMemo` 绑定到 `revision` 计数,避免每帧重算路径字符串。

## 8. 兼容性与迁移

- **`PaneId` 扩展是安全的**:`src/store/ui.ts:139` 的 `restoreLogOpenByPane` 已经按 `PANE_IDS`
  逐项校验并用默认值补齐缺失键,`isPaneId`(`ui.ts:154`)会拒绝未知值。旧版本持久化数据
  (无 `perf` 键)升级后自动补 `perf: false`,无需写迁移代码。反向降级时 `activePane: "perf"`
  会被 `isPaneId` 判为非法并回落到默认 pane,也不会崩。
- 不改动任何既有 command、事件名与数据结构;`list_device_processes` 与 activity 轮询保持原样。
- 新增 Rust 代码不引入新 crate(`tokio`、`serde`、`chrono` 均已在 `Cargo.toml`)。
  前端不引入新 npm 依赖(曲线手写 SVG)。

## 9. 关键取舍

| 取舍 | 选择 | 放弃了什么 |
|---|---|---|
| 解析位置 | Rust 侧 | 前端解析写起来更快、更好测;但每 5s 200KB 过 IPC 与 JS 解析违背 NFR-2 |
| 进程 CPU 数据源 | `/proc/<pid>/stat` 差分 | `top` 一条命令就出结果,但单帧 `%CPU` 语义不可靠 |
| 面板不可见时 | 默认停止采集 | 牺牲「后台连续曲线」,换取不可见时零开销;用开关把选择权交回用户 |
| 温度来源 | `dumpsys battery` 电池温度 | 拿不到 SoC 温度,但避免显示错误分区的数值 |
| 历史容量 | 固定 30 分钟 | 更长的历史;可后续加档位,当前优先保证内存有界 |

## 10. 回滚

改动是**追加式**的,回滚成本低:

1. `src/App.tsx`、`IndexRail.tsx`、`ui.ts` 三处注册回退 → 面板从 UI 消失,其余功能不受影响。
2. `lib.rs` 移除 2 个 command 注册与 shutdown 调用,`mod.rs` 移除模块声明。
3. 删除新增文件。

无数据迁移、无既有行为变更,因此任一阶段中断都不会让主干处于半可用状态。
风险最高的单点是 `ui.ts` 的持久化结构(影响所有 pane 的日志开关记忆),该文件的改动应
单独成一步并跑 `src/store/ui.test.ts` 回归。
