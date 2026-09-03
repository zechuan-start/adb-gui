# Design: 应用信息本地缓存

父任务：`09-03-app-info-read-stability`（其 `design.md` 的两阶段结构是本设计的基础）

## 分层：前端算 diff，Rust 管文件

```
选中设备
  ├─ getDeviceCacheKey(serial)          Rust: getprop ro.serialno → alias → serial
  ├─ readAppInfoCache(deviceKey)        Rust: index.json + PNG → AppInfo[]（含 data URI）
  │    → 乐观首屏：立刻 setApps，同时把图标灌进内存 iconCache
  │
  ├─ getInstalledApps(serial)           父任务阶段 1，永远全量、永远新鲜
  │    → setApps(fresh)  无条件覆盖首屏
  │
  ├─ missingIconPackages(fresh, cached) 前端纯函数，按 (pkg, lastUpdateTime) 求差集
  │    ├─ 差集为空 → 完全不碰设备，结束
  │    └─ 非空 → getInstalledAppIcons(serial, missing)   父任务契约，原样使用
  │
  └─ writeAppInfoCache(deviceKey, fresh, newIcons)
       Rust: 写新 PNG → 重写 index.json → 删掉 index 不再引用的 PNG
```

**为什么 diff 放前端**：它是纯函数，能在 `appInfo.test.ts` 里直接测；而且这样
第 4 步用的就是父任务已经定好的 `getInstalledAppIcons(serial, packages)`，
不需要为缓存再造一条命令。Rust 只负责它擅长的部分——文件系统。
这个切分也和仓库现状一致：`src/lib/*.ts` 放纯函数 + 同名 `.test.ts`，Rust 管 I/O。

**为什么不让 Rust 一把做完**（`get_installed_apps_cached` 一个命令内部读缓存 +
取元数据 + 补图标 + 回写）：那会把父任务的两阶段结构重新合并成一次调用，
元数据就不能先渲染了，父任务最主要的收益（2 秒出列表）直接丢掉。

## 存储布局

```
<app_cache_dir>/app-info/<deviceKey>/
  index.json
  icons/<packageName>@<lastUpdateTime>.png
```

`app_cache_dir` = `app.path().app_cache_dir()`（Tauri 2 的 `PathResolver`），
实际落点形如 `~/Library/Caches/com.qi.adb-gui`（macOS）、
`~/.cache/com.qi.adb-gui`（Linux）、`%LOCALAPPDATA%\com.qi.adb-gui`（Windows）。
identifier 取自 `tauri.conf.json` 的 `com.qi.adb-gui`。

仓库此前只用过 `dirs::picture_dir()` / `document_dir()`（`screenshot.rs:64`、
`bug_report.rs:299`、`logcat.rs:1214`）——那些是"给用户看的产物"目录。
缓存不该往那儿放，这里新建 app 缓存目录的约定。

### index.json

```json
{
  "version": 1,
  "deviceKey": "0123456789abcdef-1f2e3d4c",
  "updatedAt": 1756800000000,
  "apps": [
    {
      "packageName": "com.example.app",
      "appName": "示例应用",
      "versionName": "1.2.3",
      "versionCode": 45,
      "firstInstallTime": 1690000000000,
      "lastUpdateTime": 1700000000000,
      "apkSize": 12345678,
      "iconFile": "com.example.app@1700000000000.png"
    }
  ]
}
```

- `version` 是 schema 版本。**读到不认识的版本 → 整个设备目录作废重建，不做迁移。**
  缓存没有迁移的必要，重建一次的代价就是一次全量图标读取。
- `iconFile` 为空串表示"这个应用当时没取到图标"，下次会重新请求。
- 条目结构 = `AppInfo` 去掉 `icon`、加上 `iconFile`。用独立的 `CachedApp` 结构体，
  不要给 `AppInfo` 塞一个只在缓存里有意义的字段。

### 图标文件名

`<packageName>@<lastUpdateTime>.png`。包名字符集是 `[A-Za-z0-9_.]`（Android 规则），
对三个平台的文件名都安全，也不会撞上 Windows 保留名（保留名不含 `.`，
而 Android 包名必须含 `.`）。

**长度保护**：包名理论上可达 255 字符，加上 `@<13 位时间戳>.png` 会超过 ext4 的
255 字节上限。所以：文件名超过 200 字符时改用
`<fnv1a_64(packageName):016x>@<lastUpdateTime>.png`。可读性优先，超长才退化成哈希。

## 设备键

```rust
#[tauri::command]
pub fn get_device_cache_key(app: AppHandle, serial: String) -> Result<String, String>
```

解析顺序：`getprop ro.serialno` 非空 → 用它；否则 `alias_identity`（`device.rs:140`
的 `mdns_alias_identity`）；否则 `serial`。

`ro.serialno` 放第一位除了稳定，还有个额外好处：同一台设备无论插 USB 还是连 Wi-Fi，
都会落到**同一份缓存**上（同设备的应用集、locale、density 一致，缓存本就该共享）。
用 serial 的话这两种连接方式会各存一份。

### 同时连接两种传输

USB 与 Wi-Fi **同时**连着时，`adb devices` 会列出两条不同 serial
（`device.rs:128-136` 的去重只处理 mDNS 端口别名，不合并这两条），
它们解析出同一个 deviceKey → 共享同一个缓存目录。共享是对的，但带来两点：

1. **写入必须按 deviceKey 加锁**。父任务的全局 helper 锁只覆盖 `app_process` 调用，
   `write_app_info_cache` 不在它下面。两条 serial 各自完成加载后并发写同一个目录，
   剪枝阶段可能删掉对方 index 刚引用的 PNG。后果不严重（读侧会把缺失的 PNG
   当成 miss 重取，自愈），但没有理由留着——加一把
   `OnceLock<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>`
   按 deviceKey 取锁即可。取外层锁拿到 `Arc` 后**立即释放外层**，再 await 内层，
   不要跨 `await` 持有 `std::sync::MutexGuard`。
2. **内存 iconCache 的键仍以 serial 打头**，所以在两条 serial 之间切换时，
   内存缓存不命中，会走一次磁盘缓存读取——不发设备请求，代价只是几十毫秒的
   PNG 读 + base64。可以接受。若想让切换也瞬时，把内存键的 `serial` 换成
   `deviceKey`（那时 deviceKey 已经拿到并记住了）；**这是可选优化，不是验收项**，
   别为它把 `loadApps` 的时序搞复杂。

安全化：

```rust
fn sanitize_device_key(raw: &str) -> String
// 形如 <把 [^A-Za-z0-9._-] 替换成 '_' 后截断到 64 字符>-<fnv1a_64(raw):08x 取低 8 位十六进制>
```

必须带哈希后缀：`192.168.1.5:5555` 和 `192.168.1.5_5555` 单纯替换后会撞成同一个目录名。
`fnv1a_64` 直接复用父任务在 `app_info.rs` 里实现的那个（`pub(super)` 或提到
`commands/mod.rs`），**不要复制一份**。

## Rust 命令

新模块 `src-tauri/src/commands/app_info_cache.rs`，在 `lib.rs` 的 `invoke_handler` 注册。

```rust
#[tauri::command]
pub fn get_device_cache_key(app, serial) -> Result<String, String>

#[tauri::command]
pub fn read_app_info_cache(app, device_key: String) -> Result<Vec<AppInfo>, String>
// 无缓存/损坏/版本不符 → Ok(vec![])，绝不 Err

#[tauri::command]
pub fn write_app_info_cache(
    app,
    device_key: String,
    apps: Vec<AppInfo>,          // 全量元数据，icon 字段忽略；同时是剪枝的全集
    new_icons: Vec<AppIconEntry>, // 只有本轮新取到的图标
) -> Result<(), String>
```

`write` 只收新图标，不回传已缓存的那几 MB——否则每次打开面板都要把 8MB base64
再从前端搬回 Rust。

### 读

1. `index.json` 读不到 / 解析失败 / `version != 1` → 返回 `Ok(vec![])`，
   并**顺手删掉整个设备目录**（下次从干净状态开始）。删除失败也不 Err。
2. 逐条读 `icons/<iconFile>`：文件不存在、读失败、或**前 4 字节不是 `\x89PNG`**
   → 这一条的 `icon` 置空串（下一轮自然会被当成 miss 重新请求），
   **不作废整份缓存**。
3. 合格的 PNG → `data:image/png;base64,...`，编码方式与 `app_icon.rs:31` 一致。

这个失败模型是刻意分两级的：index 坏了是结构性问题，整份丢；单个 PNG 坏了只是
一个图标的问题，丢一个。

### 写

顺序**必须**是：先写全部 PNG，再写 `index.json`，最后剪枝。

- 崩在 PNG 阶段 → 留下孤儿 PNG，index 还是旧的，缓存仍然自洽，孤儿下次被剪掉。
- 反过来先写 index 的话，崩溃会留下一个指向不存在/写了一半的 PNG 的 index。

`index.json` 用临时文件 + `fs::rename` 原子替换。

> 不复用 `device_files.rs:587` 的 `replace_download_target`：那个带"备份原文件并在
> 失败时恢复"的语义和面向用户的中文错误串，是为下载场景写的。缓存写失败的正确反应
> 是丢弃重来，不是恢复。在本模块内写一个十几行的 `write_atomic` 更诚实。

`new_icons` 的 data URI 校验：必须以 `data:image/png;base64,` 开头、能 base64 解码、
解码后前 4 字节是 PNG 魔数。**不合格的条目跳过该图标，不让整次写入失败**。

剪枝：遍历 `icons/`，删掉新 index 的 `iconFile` 集合里没有的文件。

### 不缓存的情况

`lastUpdateTime <= 0` 的应用**不写进缓存**。这个值为 0 意味着 Java 侧
`getPackageInfo` 失败过（`Main.java:89` 的 catch 分支），失效键不可靠——
缓存进去就再也不会被正确淘汰。这类应用每次走实时图标请求，是正确的行为。

## 前端

### 纯函数（`src/lib/appInfo.ts`，配套 `appInfo.test.ts`）

```ts
export function appIconKey(packageName: string, lastUpdateTime: number): string
export function missingIconPackages(fresh: AppInfo[], cachedIcons: Map<string, string>): string[]
```

`missingIconPackages`：对每个 `fresh` 项算 `appIconKey`，不在 `cachedIcons` 里的
收集包名；跳过 `lastUpdateTime <= 0` 的项（与 Rust 侧的不缓存规则对称）；结果去重。

### 内存 iconCache 的键要统一

`PackageManager.tsx:21` 现有的模块级 `iconCache` 键是 `serial\0packageName`。
改成 `serial\0packageName\0lastUpdateTime`。

这不只是为了对齐——现在这个键有个真实的小 bug：应用在面板开着的时候被更新了，
内存里的旧图标会一直用下去。加上 `lastUpdateTime` 顺手修掉。
降级路径的 `fallbackAppInfo` 把 `lastUpdateTime` 置 0，键变成 `serial\0pkg\00`，
一致且无害。

### loadApps 流程

在父任务两阶段的基础上插入缓存，**阶段 1 的地位不变**：

1. `deviceKey = await getDeviceCacheKey(serial)`（每设备记住一次）
2. `readAppInfoCache(deviceKey)` → 非空则 `setApps(cached)`、灌 iconCache、
   `setLoading(false)`（首屏已经有东西可看了）
3. `getInstalledApps(serial)` → `setApps(fresh)` **无条件覆盖**
4. `missingIconPackages(fresh, cachedIcons)` → 空则跳过第 5 步
5. `getInstalledAppIcons(serial, missing)` → 回填 iconCache
6. `writeAppInfoCache(deviceKey, fresh, newIcons)`（不 await，失败只 `console.error`）

**竞态守卫**（两条，都必须有）：

- 父任务的 `loadRequestRef` 守卫照旧，每次回写 state 前检查。
- 额外一条：缓存读可能比阶段 1 **还慢**（冷磁盘 + 快设备）。用一个
  `phase1DoneRef` 标记，阶段 1 已返回时直接丢弃缓存结果——
  绝不允许缓存数据覆盖新数据。这是 PRD 验收条件里点名的那条。

第 2 步的 `setLoading(false)` 有个副作用：用户会先看到旧列表再看到新列表。
两者通常完全一致（没装卸应用时），差异出现时也是 2 秒内静默替换。
不加"更新中"指示——那会让常态（无变化）也显得在闪。

## 与父任务不变量的关系

本任务不得动摇父任务确立的三条：

1. 元数据永远全量读，缓存只做首屏。
2. 图标失败静默降级，不弹 toast、不出黄条——缓存读写失败同样适用。
3. `get_installed_apps` / `get_installed_app_icons` / `get_app_icon` /
   `list_packages` 的签名与行为不变。本任务只**增加**命令。

## 风险与回滚

- 回滚粒度：不注册这三个命令、`loadApps` 去掉第 1/2/6 步即可，
  回到父任务交付的状态。不碰 `Main.java`，不需要重建 dex。
- 需要重点 review：写入顺序（PNG → index → 剪枝，顺序错了会产生指向坏文件的 index）、
  `phase1DoneRef` 守卫（漏了就会出现"缓存赢了新数据"）、
  `sanitize_device_key` 的哈希后缀（漏了会让两台设备共用一个目录）、
  以及 deviceKey 写锁（漏了在同设备双传输场景下会互相剪掉对方的 PNG）。
