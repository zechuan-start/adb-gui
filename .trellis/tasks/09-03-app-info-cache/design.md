# Design: 应用信息本地缓存

父任务：`09-03-app-info-read-stability`（其 `design.md` 的两阶段结构是本设计的基础）

## 分层：前端算 diff，Rust 管文件

```
选中设备
  ├─ deviceCacheKey(device)             前端纯函数：device_id → alias_identity → serial
  │                                     （device_id 由 09-03-device-transport-merge
  │                                      放在 DeviceInfo 上，零 adb 往返）
  ├─ readAppInfoCache(deviceKey)        Rust: index.json + PNG → AppInfo[]（含 data URI）
  │    → 乐观首屏：立刻 setApps，同时把图标灌进内存 iconCache
  │
  ├─ getInstalledApps(serial)           父任务阶段 1，永远全量、永远新鲜
  │    → setApps(fresh)  无条件覆盖首屏
  │
  ├─ missingIconPackages(fresh, cached) 前端纯函数，按 (pkg, lastUpdateTime) 求差集
  │    ├─ 差集为空 → 完全不碰设备，结束
  │    └─ 非空 → 走父任务阶段 2 的分批调用 getInstalledAppIcons(serial, batch)
  │              （50/批、批间守卫、超集即停），原样复用，不另写路径
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

路径里的 `<deviceKey>` 指 **`sanitize_device_key` 之后**的结果（前端传的是原始身份串，
Rust 侧进门就 sanitize）。`index.json` 里的 `deviceKey` 字段存的也是这个安全化后的值，
读回时可以顺手和目录名比对一次。

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

**前端纯函数，不新增命令、不发 adb**：

```ts
// src/lib/device.ts
export function deviceCacheKey(device: DeviceInfo): string;
// device.device_id ?? device.alias_identity ?? device.serial
```

`device_id` 由 `09-03-device-transport-merge` 放在 `DeviceInfo` 上
（`list_devices` 时解析：`getprop ro.serialno` → `ro.boot.serialno`，
在线条目每次刷新都实时解析，非在线条目沿用最近一次在线时的结果）。
本任务直接用，不再自己发 getprop、不再有
`get_device_cache_key` 命令——同一个属性读两遍、缓存两份、回退链还不一样，
是纯粹的重复实现，也是同一台设备"UI 合并成一条"却"缓存存两份"的来源。

`device_id` 排第一位除了稳定，还有个额外好处：同一台设备无论插 USB 还是连 WiFi，
都会落到**同一份缓存**上（同设备的应用集、locale、density 一致，缓存本就该共享）。
用 serial 的话这两种连接方式会各存一份。

拿不到 `device_id` 时（设备读不到 `ro.serialno` / `ro.boot.serialno`，
或者它非在线且本次运行里从没在线过）退到 `alias_identity`，再退到 `serial`——
退化的后果只是缓存分成两份，功能不受影响，不需要报错。

### 同时连接两种传输

USB 与 WiFi **同时**连着时，`adb devices` 会列出两条不同 serial
（`device.rs:128-136` 的去重只处理 mDNS 端口别名，不合并这两条；
`09-03-device-transport-merge` 的合并只发生在展示层，后端仍是两条），
它们派生出同一个 deviceKey → 共享同一个缓存目录。共享是对的，但带来两点：

1. **写入必须按 deviceKey 加锁**。父任务的全局 helper 锁只覆盖 `app_process` 调用，
   `write_app_info_cache` 不在它下面。两条 serial 各自完成加载后并发写同一个目录，
   剪枝阶段可能删掉对方 index 刚引用的 PNG。后果不严重（读侧会把缺失的 PNG
   当成 miss 重取，自愈），但没有理由留着——加一把
   `OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>>`（**全部是
   `std::sync::Mutex`**）按 deviceKey 取锁即可：取外层锁拿到 `Arc` 后立即释放外层，
   再锁内层。
   缓存命令的**函数体是同步 `fn`**，所以锁仍用 `std::sync::Mutex`；命令入口标成
   `#[tauri::command(async)]`，由 Tauri 把整段同步文件 I/O 放到后台线程执行。
   函数体全程没有 `await`，不存在跨 await 持有 `std::sync::MutexGuard` 的问题。
   （初版把命令写成同步 `fn` 却要求 await 一把 `tokio::sync::Mutex`，那是写不出来的；
   单纯改成普通同步 command 又会让批量 PNG I/O 占住主线程。现在两边都已明确。）
2. **内存 iconCache 的键改成以 deviceKey 打头**（不是 serial）。这不是可选优化：
   `09-03-device-transport-merge` 会让主传输在 USB 掉线时自动落到 WiFi，
   `selectedDevice` 那个裸 serial 会变，键里带 serial 的话内存缓存会整片失效、
   白跑一轮磁盘读。deviceKey 在 `loadApps` 第 1 步就拿到了（纯函数，无异步），
   拿它当键不会让时序变复杂。

安全化（在 Rust 侧做，前端传原始身份串）：

```rust
fn sanitize_device_key(raw: &str) -> String
// 形如 <把 [^A-Za-z0-9._-] 替换成 '_' 后截断到 64 字符>-<fnv1a_64(raw):08x 取低 8 位十六进制>
```

必须带哈希后缀：`192.168.1.5:5555` 和 `192.168.1.5_5555` 单纯替换后会撞成同一个目录名。
`fnv1a_64` 直接复用父任务在 `app_info.rs` 里实现的那个（`pub(super)` 或提到
`commands/mod.rs`），**不要复制一份**。

## Rust 命令

新模块 `src-tauri/src/commands/app_info_cache.rs`，在 `lib.rs` 的 `invoke_handler` 注册。

**两个命令的函数体都是同步 `fn`，入口都标 `async`**：函数体不引入异步文件 I/O，
但由 Tauri 将整段工作移出主线程，避免一次读取数百个 PNG 时冻结界面。

```rust
#[tauri::command(async)]
pub fn read_app_info_cache(app: AppHandle, device_key: String) -> Result<Vec<AppInfo>, String>
// 无缓存/损坏/版本不符 → Ok(vec![])，绝不 Err

#[tauri::command(async)]
pub fn write_app_info_cache(
    app: AppHandle,
    device_key: String,           // 前端传来的原始身份串，函数内部再 sanitize
    apps: Vec<AppInfo>,           // 全量元数据，icon 字段忽略；同时是剪枝的全集
    new_icons: Vec<AppIconEntry>, // 只有本轮新取到的图标
) -> Result<(), String>
```

**没有 `get_device_cache_key`**：设备键由前端从 `DeviceInfo.device_id` 派生
（见「设备键」）。

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

写入前先在 deviceKey 锁内尽力读取旧 `index.json`，建立
`(packageName, lastUpdateTime) -> iconFile` 映射。旧 index 不存在、版本不符或解析失败
就当空映射；绝不能因为旧缓存坏了阻断本次写入。

新 index **只以本次 `apps` 为全集**，逐条按以下唯一规则决定 `iconFile`：

1. `lastUpdateTime <= 0` → 不写入 index，也不落盘图标。
2. `new_icons` 中有该包且 data URI 校验通过 → 写新的 PNG，引用按当前
   `(packageName, lastUpdateTime)` 生成的文件名。
3. 否则，旧映射中有完全相同的 `(packageName, lastUpdateTime)`，且对应 PNG 存在、
   PNG 魔数有效 → 原样保留旧 `iconFile` 引用。
4. 其余情况 → `iconFile = ""`，下次读取后会再次进入图标请求集。

这样 `new_icons` 只需携带本轮 miss 的少量图标；缓存命中的旧图标不会从前端搬回 Rust，
也不会在重写 index 时丢失。包被卸载或 `lastUpdateTime` 改变时不会命中旧映射，
旧文件会在最后的剪枝阶段删除。

整体顺序**必须**是：写本轮新增 PNG → 生成包含“新图标 + 仍有效旧引用”的完整
`index.json` → 替换 index → 按新 index 引用集合剪枝。

- 崩在 PNG 阶段 → 留下孤儿 PNG，index 还是旧的，缓存仍然自洽，孤儿下次被剪掉。
- 反过来先写 index 的话，崩溃会留下一个指向不存在/写了一半的 PNG 的 index。

`index.json` 的跨平台替换规则固定为：

- 先把完整 JSON 写到**同目录**唯一临时文件。
- Unix：`fs::rename(temp, index)`，覆盖现有目标且保持原子替换。
- Windows：标准库 `fs::rename` 不能可靠覆盖现有目标；目标存在时先删除旧
  `index.json`（`NotFound` 视为无需删除），再 `fs::rename(temp, index)`。
  两步之间若进程崩溃，下一次读取会把“index 缺失”
  当作缓存 miss 并全量重建——缓存可丢弃，因此接受这个短暂空窗，不宣称 Windows 原子。
- 任一步失败都尽力删除临时文件并返回 `Err`；前端只记 `console.error`，不影响列表。

> 不复用 `device_files.rs:587` 的 `replace_download_target`：那个带"备份原文件并在
> 失败时恢复"的语义和面向用户的中文错误串，是为下载场景写的。缓存写失败的正确反应
> 是丢弃重来，不是恢复。在本模块内写一个小型 `replace_cache_index`，并用 `#[cfg]`
> 把 Unix 与 Windows 的替换步骤明确分开。

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
收集包名；`lastUpdateTime <= 0` 的项**无条件收集**，因为它不能持久化、每轮都需要
实时图标。结果按包名去重。这里不能“与 Rust 不缓存规则对称地跳过”：跳过会让
成功路径既不走批量图标，也不启用失败态懒加载，最终永久显示占位图标。

### 内存 iconCache 的键要统一

`PackageManager.tsx:21` 现有的模块级 `iconCache` 键是 `serial\0packageName`。
改成 **`deviceKey\0packageName\0lastUpdateTime`**，两处都要改：

- `serial` → `deviceKey`：同一台设备的 USB / WiFi 两条传输共享内存缓存。
  这条在 `09-03-device-transport-merge` 之后是必需的——主传输会在 USB 掉线时
  自动落到 WiFi，`selectedDevice` 变了，键里带 serial 的话内存缓存整片失效。
- 追加 `lastUpdateTime`：现在这个键有个真实的小 bug——应用在面板开着的时候被更新了，
  内存里的旧图标会一直用下去。顺手修掉，也与磁盘缓存的失效键对齐。

降级路径的 `fallbackAppInfo` 把 `lastUpdateTime` 置 0，键变成 `deviceKey\0pkg\00`，
一致且无害。

### loadApps 流程

在父任务两阶段的基础上插入缓存，**阶段 1 的地位不变**：

1. `deviceKey = deviceCacheKey(device)`（**同步纯函数**，不是 await，也不需要记忆化）
2. `readAppInfoCache(deviceKey)` → 非空则 `setApps(cached)`、灌 iconCache、
   `setLoading(false)`（首屏已经有东西可看了）
3. `getInstalledApps(serial)` → `setApps(fresh)` **无条件覆盖**
4. `missingIconPackages(fresh, cachedIcons)` → 空则跳过第 5 步
5. 差集非空 → 走父任务阶段 2 的分批循环 `getInstalledAppIcons(serial, batch)`
   （50/批、批间 requestId 守卫、超集即停），回填 iconCache
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
4. 图标请求一律走父任务阶段 2 那条分批循环（50/批、批间守卫、超集即停），
   本任务只改"这一轮要请求哪些包"，不改调用方式。

## 风险与回滚

- 回滚粒度：不注册这**两个**命令、`loadApps` 去掉第 1/2/6 步即可，
  回到父任务交付的状态。不碰 `Main.java`，不需要重建 dex。
  内存 `iconCache` 的键改造要一起回退（否则键里的 `deviceKey` 没人算）。
- 需要重点 review：写入顺序（PNG → index → 剪枝，顺序错了会产生指向坏文件的 index）、
  重写 index 时是否保留了旧缓存里仍然匹配的图标引用、
  Windows 的 remove-then-rename 是否只用于可丢弃的 cache index、
  `phase1DoneRef` 守卫（漏了就会出现"缓存赢了新数据"）、
  `sanitize_device_key` 的哈希后缀（漏了会让两台设备共用一个目录）、
  deviceKey 写锁（漏了在同设备双传输场景下会互相剪掉对方的 PNG）、
  以及 `iconCache` 键改造的调用点（漏一个的症状是图标一直不显示且不报错）。
