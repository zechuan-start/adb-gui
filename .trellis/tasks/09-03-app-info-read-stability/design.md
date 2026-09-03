# Design: 应用信息读取稳定性加固

## 架构总览

```
前端 PackageManagerPanel.loadApps()
  ├─ 阶段 1（阻塞渲染）: getInstalledApps(serial)
  │    Rust get_installed_apps  --no-icons   超时 45s  重试 1 次
  │    → Vec<AppInfo>（icon 字段全为空串）→ 立即 setApps + 关 loading
  │
  └─ 阶段 2（后台，不阻塞）: getInstalledAppIcons(serial)
       Rust get_installed_app_icons  --icons-only  超时 90s  重试 1 次
       ├─ 成功 → 回填 iconCache + setIcons，iconMode = "bulk-done"
       └─ 失败 → 静默 iconMode = "lazy"，启用既有的可见区逐包 get_app_icon

Rust 两条命令共用一层封装 run_app_info_helper(app, serial, mode)：
  1. 取 per-serial 锁（tokio::sync::Mutex，同 serial 串行）
  2. ensure_dex_pushed()：远程名带内容哈希，ls 命中且 size 一致 → 跳过 push
  3. adb exec-out sh -c 'CLASSPATH=<remote> app_process /data/local/tmp Main <mode>'
  4. extract_payload(stdout)：定位最后一次 sentinel，取其后内容解析
```

## 数据契约

### Java 侧输出格式（V1）

stdout 结构固定为：

```
<任意噪声，允许存在>
--ADBGUI-APPINFO-V1--\n
<单行 JSON 数组>
```

sentinel 常量：`--ADBGUI-APPINFO-V1--`，Rust 与 Java 各自持有同一个字面量
（Rust: `app_info.rs` 的 `PAYLOAD_SENTINEL`；Java: `Main.SENTINEL`）。
**改动 sentinel 必须同时改两侧并重建 dex**，在两处都留注释说明这一点。

模式参数（`main(String[] args)`）：

| 参数 | 输出 | 调用方 |
|---|---|---|
| `--no-icons` | 全部元数据字段，`icon` 恒为 `""` | `get_installed_apps` |
| `--icons-only [pkg...]` | 每项仅 `packageName` + `icon`；给了包名则只处理这些包 | `get_installed_app_icons` |
| 无参 / 未知参数 | 全量（元数据 + 图标），即当前行为 | 旧 dex 兼容路径 |

参数解析规则：遍历 `args`，命中 `--no-icons` 或 `--icons-only` 则设定模式；
以 `--` 开头的其余 token **一律忽略**（不报错、不退出）；不以 `--` 开头的 token
收集为包名过滤集。这条是旧 dex 兼容的基础——旧 dex 根本不读 `args`，
收到任何新参数都自然按"全量"处理。

过滤语义：过滤集为空 → 处理全部第三方应用（冷启动路径）。过滤集非空 →
只处理 `getInstalledApplications` 结果中包名命中过滤集的项；**过滤集里设备上
不存在的包名直接跳过，不报错**（调用方的缓存可能滞后于设备实际状态）。

### Rust 结构体

`AppInfo` 保持不变（`app_info.rs:18`，前端 `tauri.ts:33` 已对应）。新增：

```rust
#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct AppIconEntry {
    pub package_name: String,
    pub icon: String,
}
```

**不要加 `#[serde(deny_unknown_fields)]`**：旧 dex 在 `--icons-only` 模式下会返回
完整的 AppInfo 对象数组，靠 serde 默认忽略多余字段，这条路径才能继续工作。

前端 `src/lib/tauri.ts` 对应新增：

```ts
export interface AppIconEntry {
  packageName: string;
  icon: string;
}
// packages 省略或为空数组 = 取全部图标
export async function getInstalledAppIcons(
  serial: string,
  packages?: string[],
): Promise<AppIconEntry[]>;
```

**调用方必须容忍返回的是请求集的超集**：旧 dex 会忽略过滤参数返回全部图标。
按 `packageName` 索引写入缓存即可，多出来的条目无害，不要断言
`result.length === packages.length`。

## Rust 侧设计

### 模块常量

```rust
const PAYLOAD_SENTINEL: &str = "--ADBGUI-APPINFO-V1--";
const REMOTE_DEX_DIR: &str = "/data/local/tmp";
const REMOTE_DEX_PREFIX: &str = "adb-gui-app-info-";   // 完整名: <prefix><hash16>.dex
const METADATA_TIMEOUT: Duration = Duration::from_secs(45);
const ICONS_TIMEOUT: Duration = Duration::from_secs(90);
const PUSH_TIMEOUT: Duration = Duration::from_secs(30);
```

`REMOTE_DEX_PATH` 常量删除。注意旧的固定路径
`/data/local/tmp/adb-gui-app-info.dex` 会作为历史残留留在用户设备上（几 KB），
本轮不做清理逻辑——清理需要额外一次 shell 调用，收益不抵成本。

### 执行模式

```rust
#[derive(Clone, Copy)]
enum HelperMode { Metadata, Icons }

impl HelperMode {
    fn arg(self) -> &'static str { /* "--no-icons" | "--icons-only" */ }
    fn timeout(self) -> Duration { /* METADATA_TIMEOUT | ICONS_TIMEOUT */ }
}
```

### 包名过滤与分批

```rust
const ICON_FILTER_BATCH: usize = 50;

fn is_safe_package_name(name: &str) -> bool
fn sanitize_package_filter(packages: &[String]) -> Vec<String>
fn build_helper_command(remote: &str, mode: HelperMode, filter: &[String]) -> String
```

- `is_safe_package_name`：只接受 `[A-Za-z0-9_.]`，非空，且不以 `.` 开头/结尾。
  Android 的包名规则本就在这个字符集内，所以这不是"转义"，是**拒绝**——
  任何不合规的名字直接丢弃，绝不拼进 shell 串。过滤后为空且原始输入非空时，
  返回 `Err`，不要静默降级成"取全部图标"（那会让一次本该很小的调用变成全量渲染）。
- `sanitize_package_filter`：去重 + 过滤 + 保持稳定顺序，便于测试。
- `build_helper_command`：
  `CLASSPATH=<remote> app_process <dir> com.adbgui.appinfo.Main <mode.arg()> <pkg...>`，
  包名之间空格分隔。因为已经做过字符集白名单，这里不需要引号。
- 分批在 `get_installed_app_icons` 这一层做：过滤集为空 → 单次无过滤调用；
  非空 → 按 `ICON_FILTER_BATCH` 切块，**顺序**执行（不要并发，per-serial 锁本来就
  会把它们串起来，并发只会制造锁竞争），结果拼接后返回。
  任何一批失败即整体 `Err`——图标是尽力而为的，部分成功的语义会让调用方缓存进
  一个不完整的状态，不值得。

这三个函数都是纯函数，必须有单元测试：合法/非法包名、去重、空输入、
恰好等于批大小、批大小 +1、命令串拼装结果。

### per-serial 串行化

```rust
static HELPER_LOCKS: Lazy<Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>
```

项目未引入 `once_cell`，用 `std::sync::OnceLock<std::sync::Mutex<HashMap<..>>>`
（标准库，无新依赖）。取锁流程：短暂锁住外层 `std::sync::Mutex` 取出/插入该 serial
的 `Arc<tokio::sync::Mutex<()>>`，**立即释放外层锁**，再 `.lock().await` 内层。
不要跨 `await` 持有 `std::sync::MutexGuard`。

作用域：`get_installed_apps` 和 `get_installed_app_icons` 都在同一把 serial 锁下，
所以阶段 1 与阶段 2 天然串行，元数据一定先于图标返回。

### dex 内容哈希与推送

```rust
fn fnv1a_64(bytes: &[u8]) -> u64   // offset basis 0xcbf29ce484222325, prime 0x100000001b3
fn remote_dex_path(hash: u64) -> String  // format!("{REMOTE_DEX_DIR}/{REMOTE_DEX_PREFIX}{hash:016x}.dex")
```

`ensure_dex_pushed(app, serial, local_path, bytes_len, remote_path, force) -> Result<(), String>`：

1. `force == false` 时先探测：`adb -s <serial> shell ls -l <remote>`（带 `PUSH_TIMEOUT`）。
   从输出里解析出字节数，与本地 `bytes_len` 相等 → 直接返回 `Ok(())`，跳过 push。
   解析失败/文件不存在/命令失败 → 一律当作"需要 push"，不视为错误。
2. 执行 `adb -s <serial> push <local> <remote>`，用 `prepare_async_command` +
   `tokio::time::timeout(PUSH_TIMEOUT, ...)`。失败或超时 → `Err`。

`ls -l` 的输出格式在各 ROM 上有差异，因此解析必须写成"尽力而为"：
按空白切分，取**第一个能解析成 u64 且等于 bytes_len 的字段**即算命中。
这个函数的语义是"确认能跳过 push"，判断不出来就老实 push，不会因为解析不准而出错。
`parse_ls_size_matches(line, expected) -> bool` 抽成纯函数并加单元测试。

### stdout 提取

```rust
fn extract_payload<'a>(stdout: &'a [u8]) -> &'a [u8]
```

1. 从 `stdout` 中查找**最后一次** `PAYLOAD_SENTINEL` 出现的位置（字节级 rfind）。
2. 命中 → 返回 sentinel 之后的切片，两端 trim ASCII 空白。
3. 未命中 → 返回整个 `stdout` 两端 trim 后的切片（旧 dex 兼容）。

`parse_helper_output::<T: DeserializeOwned>(stdout) -> Result<Vec<T>, String>`：
先 `extract_payload`，空切片 → `Err("App-info helper returned empty stdout.")`，
否则 `serde_json::from_slice`。现有的两个测试（`parses_app_info_contract`、
`rejects_empty_or_invalid_stdout`）保留并扩充。

用"最后一次"而不是第一次：万一噪声本身包含 sentinel 字面量（例如 stderr 混入
或 ROM 回显了命令行），取最后一次能确保拿到真正的 payload。

### 重试策略

```rust
async fn run_app_info_helper<T>(app, serial, mode) -> Result<Vec<T>, String>
```

伪流程：

```
lock = serial_lock(serial).await
for attempt in 0..=1 {
    force_push = attempt > 0;
    ensure_dex_pushed(..., force_push)  → push 失败且 attempt==0 → continue（重试）
                                        → push 失败且 attempt==1 → return Err
    spawn app_process, timeout(mode.timeout())
      ├ 超时      → attempt==0 ? continue : return Err("... timed out ...")
      ├ 非零退出  → return Err（不重试：ROM 不兼容重试也没用，只会让用户多等一倍）
      └ 成功      → return parse_helper_output(stdout)
                     （解析失败也直接 return Err，不重试）
}
```

要点：
- 只有**超时**和 **push 失败**重试；`app_process` 非零退出、JSON 解析失败都不重试。
- 重试时 `force_push = true`，覆盖"设备上的 dex 被写坏但 size 恰好一致"这种情况。
- 错误信息必须包含 `adb_output_error(&output)`（即 stderr），A5 的「详情」依赖它。
  stderr 可能很长（Java 侧每个失败字段一行），Rust 侧截断到 4000 字节再返回，
  抽成 `truncate_detail(&str, max) -> String` 纯函数并测试。

### 子进程

沿用 `app_info.rs:47-66` 的写法（`prepare_async_command` + `exec-out sh -c` +
`kill_on_drop(true)` + `wait_with_output()`）。`wait_with_output` 会并发 drain
stdout/stderr，不要改成手动读单个管道——那会在 stderr 写满 64KB 管道缓冲时死锁。

命令字符串由 `build_helper_command()` 拼接。`remote` 由 `remote_dex_path()` 生成，
字符集为 `[a-z0-9-]` + `/` + `.`；包名已过白名单。两者都无需 shell 转义。

单批命令串长度上界：50 × 约 30 字节包名 + 约 120 字节前缀 ≈ 1.6KB，
对 adb shell 协议和 Windows `CreateProcess`（32767 字符）都远在安全区内。

## Java 侧设计（`scripts/build-app-info-dex/src/com/adbgui/appinfo/Main.java`）

### 输出流

不再直接用 `System.out.print`。在 `main` 开头构造：

```java
PrintStream out = new PrintStream(
    new BufferedOutputStream(new FileOutputStream(FileDescriptor.out), 1 << 16),
    false, "UTF-8");
```

输出顺序：`out.print(SENTINEL); out.print('\n'); out.print(json); out.flush();`
finally 块里 `out.flush(); System.err.flush();`。异常路径同样要 flush 后再
`System.exit(1)`。

### 模式

```java
private enum Mode { FULL, METADATA_ONLY, ICONS_ONLY }

/** 模式 + 包名过滤集；未知的 --xxx 忽略，裸 token 收集为过滤集，默认 FULL。 */
static Options parseArgs(String[] args)
```

- `METADATA_ONLY`：跳过 `readIcon()`，`icon` 直接写 `""`。这是本任务的性能核心，
  必须确保这条路径上完全不触碰 `getApplicationIcon` / Bitmap / PNG 压缩。
- `ICONS_ONLY`：只 put `packageName` 与 `icon`，跳过 label / PackageInfo / APK size。
- `FULL`：现有行为，一个字段都不改。

`readApplication` 按 mode 分支，或拆成 `readMetadata` / `readIconEntry` 两个函数——
执行时选可读性更好的那种，但不要把三种模式的字段拼装逻辑复制三份。

包名过滤：在主循环现有的 `FLAG_SYSTEM` 判断之后加一道
`if (!filter.isEmpty() && !filter.contains(packageName)) continue;`。
`filter` 用 `HashSet<String>` 而不是 `List`——过滤集可能几十个元素，
主循环要跑几百次。过滤集里设备上不存在的包名自然不会命中，无需额外处理，
更不要为此报错退出。过滤只决定处理哪些包，不改变输出格式。

### Context 引导多级回退（C9）

```java
private static Context createSystemContext() throws Exception {
    if (Looper.myLooper() == null) {
        Looper.prepareMainLooper();
    }
    Class<?> activityThreadClass = Class.forName("android.app.ActivityThread");
    try {
        return systemMainContext(activityThreadClass);      // 第 1 级：现状，保持优先
    } catch (Throwable primaryError) {
        reportBootstrapFailure("ActivityThread.systemMain()", primaryError);
        try {
            return lightweightContext(activityThreadClass); // 第 2 级：跳过 attach
        } catch (Throwable fallbackError) {
            reportBootstrapFailure("ActivityThread constructor", fallbackError);
            throw new IllegalStateException(
                "Unable to obtain a system context; see stderr for both attempts.",
                fallbackError);
        }
    }
}
```

- `systemMainContext`：`systemMain()` → `getSystemContext()`，与现状一致。
- `lightweightContext`：`activityThreadClass.getDeclaredConstructor()` +
  `setAccessible(true)` + `newInstance()` → `getSystemContext()`。
  跳过 `attach(true)`（不建 Instrumentation、不 `makeApplication().onCreate()`、
  不初始化 ThreadedRenderer），触碰的 ROM 定制面小得多。
- `reportBootstrapFailure` 必须 `error.printStackTrace(System.err)` 打完整栈，
  A5 的「详情」直接展示这段。

**顺序不调换的理由**：轻量路径拿到的 Context 在真机上能否正确解析
`getApplicationLabel`（依赖 ResourcesManager 是否已就绪）**没有验证过**。
把它放在回退位是纯增量——现在能成功的设备走原路径不受影响，现在失败的设备多一次机会。
真机数据支持后可以再评估对调。

## 前端设计（`src/components/PackageManager.tsx`）

### 状态改造

```ts
type FallbackState = { reason: string } | null;
type IconMode = "bulk-pending" | "bulk-done" | "lazy";

const [fallback, setFallback] = useState<FallbackState>(null);   // 替换 fallbackMode: boolean
const [iconMode, setIconMode] = useState<IconMode>("bulk-pending");
```

`loadApps` 改造：

1. `requestId = ++loadRequestRef.current`，`setLoading(true)`，`setFallback(null)`,
   `setIconMode("bulk-pending")`
2. `await getInstalledApps(serial)` → 成功：`setApps(sorted)`、`setLoading(false)`，
   然后 **不 await** 地发起阶段 2
3. 失败：`setFallback({ reason: String(bulkError) })`，走现有 `listPackages` 降级，
   `setIconMode("lazy")`
4. 阶段 2 `getInstalledAppIcons(serial)`（**本轮不传 packages，即取全部**）：
   成功则写入模块级 `iconCache` 并 `setIcons(new Map(iconCache))`、
   `setIconMode("bulk-done")`；失败则 `setIconMode("lazy")`（**不弹 toast、不显示黄条**——
   图标缺失会由懒加载补上，不是需要用户知晓的降级）。
   写入时按返回项的 `packageName` 逐条索引，不要假设返回集与请求集一一对应。

每一步回写 state 前都要 `if (loadRequestRef.current !== requestId) return;`，
阶段 2 尤其重要——它的生命周期比阶段 1 长得多，切设备后极易回写到错误的设备上。

### 懒加载 effect

`PackageManager.tsx:158-184` 的触发条件从 `!fallbackMode` 改为 `iconMode !== "lazy"` 时跳过。
即：`bulk-pending`（等批量结果）与 `bulk-done`（批量已覆盖）都不逐包拉，
只有 `lazy` 才启用。其余逻辑（5 个并发、iconCache 占位空串防重复请求）保持不变。

### 黄条（A5）

`fallbackMode &&` 改为 `fallback &&`，内容扩展为：

- 主文案保持「应用名称和版本读取失败，当前显示精简信息。」
- 「详情」切换按钮（`useState<boolean>` 控制），展开后以 `font-data` 小字展示
  `fallback.reason`，超长时 CSS 截断 + `title` 保留全文，容器 `overflow-auto`
  且限制最大高度，不能把黄条撑爆布局
- 「重试」按钮 → `void loadApps()`，`disabled={loading}`

沿用现有 warn 配色类（`border-warn/45 bg-warn-band text-warn`）与既有按钮的
`h-7 border border-rule ...` 写法，不引入新组件、不新增设计 token。

## 向后兼容矩阵（必须成立）

| Rust | dex | 结果 |
|---|---|---|
| 新 | 新 | 元数据快速返回，图标后台回填 —— 目标状态 |
| 新 | **旧（仓库现状）** | 旧 dex 忽略 `--no-icons`，输出全量且无 sentinel；`extract_payload` 回退整体解析 → **仍然可用**，只是元数据阶段仍需渲染图标（慢，但 45s 预算比原来的 15s 宽松）。阶段 2 `--icons-only` 及其后面的包名参数同样被忽略，返回全量数组：`AppIconEntry` 靠 serde 忽略多余字段能解析，返回的是请求集的**超集** → 调用方按 packageName 索引写入，也能用 |
| 旧 | 新 | 不会发生（同包发布） |

第 2 行是本任务能否安全落地的关键。**代码写完必须真的用仓库现有的 dex 跑一次**，
而不是"看代码觉得兼容"。

## 风险与回滚

- 最高风险：Java 改动无法在会话内验证（需要 JDK + Android SDK 重建 dex，且需要真机）。
  缓解手段就是上面的兼容矩阵——即使 dex 没重建，Rust/前端改动依然有正收益
  （45s 预算、并发保护、重试、错误可见）。
- 回滚粒度：Java、Rust、前端三部分互不依赖，可单独回退。前端回退只需把
  `fallback`/`iconMode` 改回 boolean 并恢复单段式 `loadApps`。
- 需要重点 review：`run_app_info_helper` 的重试分支（错误分类错了会让用户等两倍时间），
  以及阶段 2 的 `requestId` 守卫（漏了会串设备）。
