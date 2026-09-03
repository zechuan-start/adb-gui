# Design: 应用信息读取稳定性加固

## 架构总览

```
前端 PackageManagerPanel.loadApps()
  ├─ 阶段 1（阻塞渲染）: getInstalledApps(serial)
  │    Rust get_installed_apps  --no-icons   超时 45s
  │    → Vec<AppInfo>（icon 字段全为空串）→ 立即 setApps + 关 loading
  │
  └─ 阶段 2（后台，不阻塞）: 把阶段 1 的包名按 50 一批，顺序调用
       getInstalledAppIcons(serial, batch)
       Rust get_installed_app_icons  --icons-only <pkg...>   超时 90s / 批
       ├─ 每批成功 → 回填 iconCache + setIcons（图标渐进出现）
       ├─ 某批返回了请求集之外的包名（旧 dex 忽略过滤）→ 全部收下并停止后续批次
       ├─ 全部批次完成 → iconMode = "bulk-done"
       └─ 任一批失败 → 已回填的保留，其余静默 iconMode = "lazy"，
                        启用既有的可见区逐包 get_app_icon
       每批发出前都要过 requestId 守卫：切设备后不再发下一批。

Rust 两条命令共用一层封装 run_app_info_helper(app, serial, mode)：
  1. 取全局锁（一把 tokio::sync::Mutex，所有设备所有调用串行 —— 见「全局串行化」）
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
更进一步：出现超集就意味着"设备上的 dex 不认过滤"，此时应当**停止后续批次**
（见「前端设计」的超集检测）——这既是兼容，也是性能保护。

## Rust 侧设计

### 模块常量

```rust
const PAYLOAD_SENTINEL: &str = "--ADBGUI-APPINFO-V1--";
const REMOTE_DEX_DIR: &str = "/data/local/tmp";
const REMOTE_DEX_PREFIX: &str = "adb-gui-app-info-";   // 完整名: <prefix><hash16>.dex
const METADATA_TIMEOUT: Duration = Duration::from_secs(45);
const ICONS_TIMEOUT: Duration = Duration::from_secs(90);   // 单批预算，不是整轮回填
const PUSH_TIMEOUT: Duration = Duration::from_secs(30);

/// `app_process` 超时后置位；下一次调用强制重推 dex 并清零。
/// 进程级（与全局锁同粒度），被别的 serial 消费掉也无害——只是多推一次 5KB。
static FORCE_PUSH_NEXT: AtomicBool = AtomicBool::new(false);
```

`ICONS_TIMEOUT` 之所以还留 90s：新 dex 下单批 50 个图标只要几秒，预算宽松不花钱；
而旧 dex 会忽略过滤，第一批就是一次全量渲染，需要这个预算才不至于直接超时。
注意**超时预算不等于持锁时长**——持锁时长是实际耗时，分批之后正常路径就是几秒。

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
- **主分批者是前端**（见「前端设计」）：它拿着阶段 1 的包名列表，按 50 一批调用，
  每批之间可以过 requestId 守卫、可以停止。Rust 侧不知道用户切没切设备，做不到这点。
- Rust 侧的分批是**防御性**的：`get_installed_app_icons` 收到超过
  `ICON_FILTER_BATCH` 的过滤集时自己切块、**顺序**执行（不要并发，全局锁本来就
  会把它们串起来，并发只会制造锁竞争），结果拼接后返回；
  过滤集为空 → 单次无过滤调用。
  一次调用内部的任何一批失败即整体 `Err`——图标是尽力而为的，
  部分成功的语义会让调用方缓存进一个不完整的状态，不值得。
  （注意这里说的是"一次命令调用内部"。前端多批之间是独立调用，
  某一批失败不影响前面已经回填的图标，见「前端设计」。）

这三个函数都是纯函数，必须有单元测试：合法/非法包名、去重、空输入、
恰好等于批大小、批大小 +1、命令串拼装结果。

### 全局串行化（**不是** per-serial）

```rust
static HELPER_LOCK: OnceLock<tokio::sync::Mutex<()>> = OnceLock::new();

fn helper_lock() -> &'static tokio::sync::Mutex<()> {
    HELPER_LOCK.get_or_init(|| tokio::sync::Mutex::new(()))
}
```

项目未引入 `once_cell`，用标准库的 `std::sync::OnceLock` 即可，无新依赖。
一把锁，不需要 HashMap，也就没有"跨 await 持有 std MutexGuard"的坑。

**为什么必须是全局锁**：一台设备可以同时通过 USB 和 WiFi 连接，
`adb devices` 会列出两条不同 serial（`device.rs:128-136` 的去重只处理 mDNS
端口别名，不合并这两条），但它们指向**同一台设备上的同一个**远程 dex 路径——
路径由 dex 内容哈希决定，与 serial 无关。per-serial 锁锁不住彼此：
在其中一条加载途中切到另一条，两次 `ls` 探测都发生在任何一次 push 完成之前，
双双 push，后者截断前者正在执行的 dex → dex verify 崩溃 → 非零退出不重试 → 黄条。
那就是本节要修的 bug 换个入口重现。

**代价不是零，必须正视**：阶段 2 是不 await 的后台调用，所以"只加载当前选中设备"
并不成立——用户在图标回填跑着的时候切到另一台设备，新设备的阶段 1 就会卡在
`helper_lock().lock().await` 上，而这个等待发生在超时预算之外，UI 只会一直转圈。
这是本设计自己制造的并发，不能用"面板只加载一台设备"糊过去。

压住它靠两条，缺一不可：

1. **阶段 2 按包名分批**（50/批）。持锁时长从"渲染全部图标"（几十秒）降到
   "渲染 50 个图标"（几秒），新设备的元数据最多等一批。
2. **前端切设备后不再发送后续批次**（requestId 守卫）。已经发出去的那一批
   无法取消，所以第 1 条决定了最坏等待。

残留代价：**旧 dex** 忽略过滤，第一批就是一次全量渲染，这一批跑完之前锁放不开
（最坏接近 `ICONS_TIMEOUT`）。重建 dex 后消失，接受并记录。
不为它引入取消机制（在 Rust 侧杀子进程 / generation 计数）——那要新增同步原语，
复杂度和出错面都高于它能省下的那点等待。

将来真需要并发加载多设备，改成"远程路径按调用唯一化 + 用完清理"，
不要退回 per-serial。

作用域：`get_installed_apps` 和 `get_installed_app_icons` 都在这把锁下，
所以阶段 1 与阶段 2 天然串行，元数据一定先于图标返回。

### dex 内容哈希与推送

```rust
fn fnv1a_64(bytes: &[u8]) -> u64   // offset basis 0xcbf29ce484222325, prime 0x100000001b3
fn remote_dex_path(hash: u64) -> String  // format!("{REMOTE_DEX_DIR}/{REMOTE_DEX_PREFIX}{hash:016x}.dex")
```

```rust
/// Ok(true)  = 本轮真的执行了 push
/// Ok(false) = 大小命中，跳过了 push（设备上是一个「没验证过内容」的旧文件）
fn ensure_dex_pushed(app, serial, local_path, bytes_len, remote_path, force)
    -> Result<bool, String>
```

**返回值不是可有可无的**：重试策略要靠它区分"跑的是刚推的新文件"还是
"跑的是跳过 push 的旧文件"，见下方「重试策略」。`force == true` 时必然返回
`Ok(true)`。

行为：

1. `force == false` 时先探测：`adb -s <serial> shell ls -l <remote>`（带 `PUSH_TIMEOUT`）。
   从输出里解析出字节数，与本地 `bytes_len` 相等 → **返回 `Ok(false)`**（跳过 push）。
   解析失败/文件不存在/命令失败 → 一律当作"需要 push"，不视为错误。
2. 执行 `adb -s <serial> push <local> <remote>`，用 `prepare_async_command` +
   `tokio::time::timeout(PUSH_TIMEOUT, ...)`，成功 → **返回 `Ok(true)`**；
   失败或超时 → `Err`。

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
_guard = helper_lock().lock().await          // 全局锁，与 serial 无关
force_push = FORCE_PUSH_NEXT.swap(false)     // 上一次超时留下的标志，消费掉
for attempt in 0..=1 {
    pushed_fresh = match ensure_dex_pushed(..., force_push) {
        Ok(pushed) => pushed,
        Err(_) if attempt == 0 => { force_push = true; continue; }  // push 失败 → 重试
        Err(e)                 => return Err(e),
    };
    spawn app_process, timeout(mode.timeout())
      ├ 超时      → FORCE_PUSH_NEXT.store(true);        // 下次（用户点「重试」）强制重推
      │             return Err("... timed out ...")     // 本轮不自动重试
      ├ 非零退出或 payload 无效 → if !pushed_fresh {
      │                force_push = true; continue;   // 跑的是跳过 push 的旧文件 → 重推再试
      │             } else {
      │                return Err(ROM/协议错误)        // 刚推的新文件还失败 → 重试无意义
      │             }
      └ 成功且 payload 有效 → return parse_helper_output(stdout)
}
```

要点：
- 重试触发条件共**两类**：**push 失败**、以及**"跳过了 push 的那一轮"执行失败**.
  后者既包括主机看到非零退出, 也包括退出码成功但 payload 为空/无效. 实机上损坏 dex
  会让远端输出 `Aborted`, 但 `adb exec-out` 仍可能返回成功退出码, 所以 payload 有效性
  必须参与自愈判断. 若本轮刚推过 dex, 同样的 payload 错误直接返回, 不再重试.
- **超时不自动重试**（规划期修订，原方案会重试）。原因：超时基本是"这台设备 /
  这个 dex 就是慢"，重推一次不会更快，只会让用户等两个超时预算才看到黄条
  ——旧 dex 路径尤其明显（45s 变 90s）。取而代之的是置 `FORCE_PUSH_NEXT`：
  用户点黄条上的「重试」时那一轮会强制重推，从而覆盖"损坏 dex 把进程挂住"
  这种少数情况。**这与下面的非零退出自愈是两条独立路径，不要合并实现**：
  挂住 → 靠标志 + 用户重试；非零退出 → 同一轮内自动重推重试。
- 循环最多两轮，第二轮 `force_push` 必为 `true`，所以 `pushed_fresh` 必为 `true`，
  非零退出必然 `return Err`，不会死循环。
- **损坏 dex 自愈**是这里最容易被漏掉的一条。`ensure_dex_pushed` 靠 `ls` 的字节数
  判断能否跳过 push，而字节数相同不代表内容没坏（进程被杀留下的半截文件、
  文件系统损坏、被别的东西覆写）。同时不能假设 `adb exec-out` 的成功状态等于远端
  `app_process` 成功: 实机上损坏 dex 会返回成功状态 + stdout `Aborted`. 若只在非零
  退出时自愈,
  这台设备会**永久**停在黄条上——每次调用都跳过 push、每次都拿同一个坏文件去跑，
  没有任何路径能让它恢复。所以必须区分"跑的是旧文件"和"跑的是刚推的新文件"。
- 反过来，`pushed_fresh == true` 时非零退出**立刻**返回错误，即使还在 attempt 0。
  文件是新的，再推一次只是让用户多等一倍。
- 超时那条错误文案要让用户知道"可以点重试"，因为下一轮会强制重推。
- ROM 不兼容那条错误信息里带上"dex 为本轮新推送"的说明，
  这样用户看到「详情」时能区分"文件坏了"和"这台设备真的不支持"。
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
4. 阶段 2：把阶段 1 结果的包名按 `ICON_BATCH_SIZE = 50` 切块，`for` 循环**顺序
   await** 每一批 `getInstalledAppIcons(serial, batch)`：
   - 每批发出前先过 requestId 守卫，不匹配就直接 return（切设备后不再发下一批）。
   - 每批返回后按 `packageName` 逐条写入模块级 `iconCache`，
     再 `setIcons(new Map(iconCache))` —— 图标一批一批地出现。
   - **超集检测**：这一批返回的条目里出现了 `batch` 之外的包名，说明设备上是旧 dex
     （忽略过滤、返回全集）。把它们全部收下，然后 `setIconMode("bulk-done")` 并
     **跳出循环**，不要再发后续批次——否则每一批都会让旧 dex 重跑一次全量渲染。
   - 全部批次跑完 → `setIconMode("bulk-done")`。
   - 任一批抛错 → `setIconMode("lazy")` 并跳出（**不弹 toast、不显示黄条**——
     图标缺失会由懒加载补上，不是需要用户知晓的降级）。已回填的图标留在 `iconCache`
     里，懒加载 effect 只会去取还没有的那些，天然不重复。

   切块用一个纯函数（放 `src/lib/appInfo.ts`，配 `appInfo.test.ts`）：
   `chunkPackages(names: string[], size: number): string[][]`。
   超集判断同样抽成纯函数：`hasUnrequestedPackages(entries, requested)`。

   **分批的代价，明确记账**：每一批都是一次独立的命令调用，各自要走一次
   `ensure_dex_pushed` 的 `ls` 探测（约 30–80ms）和一次 `app_process` 冷启动
   （约 0.5–1s）。300 个应用 = 6 批，合计比"一次全量"多几秒的图标总时长。
   用这几秒换"切设备不卡"和"图标渐进出现"，值得。
   **不要**为了省掉重复探测在 Rust 里加"本进程已确认过这个 remote 存在"的缓存：
   那正好抹掉损坏 dex 自愈所依赖的判据（`pushed_fresh`），
   会让一台设备重新变成永久卡黄条。

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
| 新 | **旧（仓库现状）** | 旧 dex 忽略 `--no-icons`，输出全量且无 sentinel；`extract_payload` 回退整体解析 → **仍然可用**，只是元数据阶段仍需渲染图标（慢，但 45s 预算比原来的 15s 宽松；超时不再自动重试，所以最坏等待就是这 45s）。阶段 2 第一批的 `--icons-only <pkg...>` 同样被忽略，返回全量数组：`AppIconEntry` 靠 serde 忽略多余字段能解析，返回的是请求集的**超集** → 调用方收下全部并**停止后续批次**，图标一次就齐了 |
| 旧 | 新 | 不会发生（同包发布） |

第 2 行是本任务能否安全落地的关键。**代码写完必须真的用仓库现有的 dex 跑一次**，
而不是"看代码觉得兼容"。

## 风险与回滚

- 最高风险：Java 改动无法在会话内验证（需要 JDK + Android SDK 重建 dex，且需要真机）。
  缓解手段就是上面的兼容矩阵——即使 dex 没重建，Rust/前端改动依然有正收益
  （45s 预算、并发保护、重试、错误可见）。
- 回滚粒度：Java、Rust、前端三部分互不依赖，可单独回退。前端回退只需把
  `fallback`/`iconMode` 改回 boolean 并恢复单段式 `loadApps`。
- 需要重点 review 三处：
  1. `run_app_info_helper` 的失败分类——分错的两个方向都有代价：把超时也拿去自动重试
     会让用户等两倍时间才看到黄条，而漏了"跳过 push 后执行失败或 payload 无效
     要强制重推"
     会让一台设备永久卡在黄条上，后者更严重。
  2. 阶段 2 的 `requestId` 守卫（漏了会把 A 设备的图标画到 B 设备上），
     以及"切设备后不再发下一批"（漏了会让新设备的元数据一直等在锁上）。
  3. 超集检测（漏了旧 dex 会把全量渲染跑 N 遍，比不分批还慢）。
