# Implement Plan: 应用信息本地缓存

分支：`claude/app-info-cache`，在下面三条门禁都进了 `main` 之后从 `main` 开。

## 开工前的门禁

> **规划复审已完成（2026-09-03）**：上一版产物里的矛盾已定位并修订，主要是
> ① 设备键自己发一遍 `getprop ro.serialno`，与 `09-03-device-transport-merge` 的
> `device_id` 重复实现且回退链不一致；② 命令写成同步 `fn` 却要求 await 一把
> `tokio::sync::Mutex`；③ PRD 结尾还写着"design/implement 待写"。
> 现在的方案是：**设备键 = `DeviceInfo.device_id ?? alias_identity ?? serial`（前端纯函数）
> + 两个同步命令 + `std::sync::Mutex` 写锁**。照现在的三份文档执行即可。

下面三条必须**实际验证过**，不是"代码看起来支持"：

- [ ] 父任务 `09-03-app-info-read-stability` 已完成，且
      `get_installed_app_icons(serial, packages)` 的包名过滤在真机上生效
      （父任务 `implement.md` 验证计划第 2 条）
- [ ] `src-tauri/resources/app-info.dex` 已用 `build.sh` 重建并提交
- [ ] `09-03-device-transport-merge` 的 Rust 身份字段已合入 `main`：
      `DeviceInfo.device_id` 在前端拿得到

第 2 条不满足的话，旧 dex 会忽略过滤返回全集——功能不坏（父任务的超集检测会兜住），
但**一点都不会变快**，本任务等于白做。
第 3 条不满足的话，`deviceCacheKey` 没有 `device_id` 可用，会退化成按 serial 分库，
同一台设备的 USB / WiFi 各存一份，本任务的一半价值没了。
三条不齐就停下来问，不要开工，更不要自己在本任务里再实现一遍 `ro.serialno` 解析。

---

## 1. Rust：纯函数与单元测试先行

新文件 `src-tauri/src/commands/app_info_cache.rs`（在 `commands/mod.rs` 挂上）。

先把不碰文件系统的部分写完并测过：

- `sanitize_device_key(raw: &str) -> String` —— 非法字符替换 + 截断 64 + `-<hash:08x>` 后缀。
  测试：含 `:` 的 WiFi serial、纯字母数字 serial、超长输入被截断、
  **`192.168.1.5:5555` 与 `192.168.1.5_5555` 必须产出不同结果**（这是加哈希后缀的理由）。
- `icon_file_name(package_name: &str, last_update_time: i64) -> String` ——
  正常返回 `<pkg>@<ts>.png`；总长超 200 时退化成 `<fnv1a_64(pkg):016x>@<ts>.png`。
  测试：普通包名、超长包名走哈希分支、同包名同时间戳结果稳定。
- `decode_icon_data_uri(data_uri: &str) -> Option<Vec<u8>>` ——
  校验 `data:image/png;base64,` 前缀 + base64 解码 + PNG 魔数，任一不过返回 `None`。
  测试：合法 data URI、错前缀、非法 base64、解码后不是 PNG。
- `fnv1a_64` **复用父任务在 `app_info.rs` 里的实现**，改成 `pub(super)` 或提到
  `commands/mod.rs`。不要复制第二份——`code-reuse-thinking-guide.md` 点名的场景。

`cargo test` 全绿再往下。

## 2. Rust：文件读写

同文件。

1. `CachedApp` 结构体（`AppInfo` 去掉 `icon`、加 `iconFile`）+ `CacheIndex`
   （`version` / `deviceKey` / `updatedAt` / `apps`），`serde(rename_all = "camelCase")`。
2. `cache_root(app) -> Result<PathBuf, String>`：`app.path().app_cache_dir()?.join("app-info")`。
3. `write_atomic(path, bytes) -> std::io::Result<()>`：临时文件 + `fs::rename`。
   十几行，写在本模块内。**不要复用 `device_files.rs:587` 的 `replace_download_target`**
   —— 那个带备份/恢复语义和面向用户的中文错误串，是下载场景的，缓存写失败应该丢弃重来。
4. `read_app_info_cache`：按 `design.md`「读」的两级失败模型实现。
   index 坏/版本不符 → 删整个设备目录 + 返回 `Ok(vec![])`；单个 PNG 坏 → 该条 `icon` 置空。
   **任何路径都不返回 `Err`。**
5. `write_app_info_cache`：顺序必须是 **写 PNG → 写 index.json → 剪枝**。
   `lastUpdateTime <= 0` 的应用跳过不缓存。非法 data URI 跳过该图标但不中断整次写入。
6. 两个命令都是**同步** `#[tauri::command] pub fn`，内部先把传进来的原始身份串
   过一遍 `sanitize_device_key` 再拼路径。**不要新增 `get_device_cache_key`**
   ——设备键由前端从 `DeviceInfo.device_id` 派生（步骤 3）。
7. **按 deviceKey 的写锁**：`write_app_info_cache` 全程持有。同一台设备同时接
   USB 和 WiFi 时会有两条 serial 落到同一个缓存目录（见 `design.md`
   「同时连接两种传输」），父任务的全局 helper 锁覆盖不到这里。
   `OnceLock<Mutex<HashMap<String, Arc<Mutex<()>>>>>`，**内外层都是
   `std::sync::Mutex`**：命令是同步的、只做文件 I/O，全程没有 `await`，
   用不上 `tokio::sync::Mutex`。外层锁取出 `Arc` 后立即释放，再锁内层。
8. `lib.rs` 的 `invoke_handler` 注册这**两个**命令。

文件系统测试参照 `device_files.rs:804-834` 的写法（`std::env::temp_dir()` +
pid + 纳秒时间戳建目录，用完 `remove_dir_all`），不引入 tempfile 依赖。
至少覆盖：写入后读回一致、index 版本不符时目录被清、单个 PNG 被删后只丢那一个图标、
剪枝真的删掉了不再引用的文件。

动手前读 `.trellis/spec/backend/directory-structure.md` 与 `error-handling.md`
（本模块大量使用"吞掉错误返回默认值"的写法，要确认它在项目里的既有表达方式）。

## 3. 前端纯函数

`src/lib/device.ts` 加 `deviceCacheKey(device)`（`device_id ?? alias_identity ?? serial`），
`src/lib/device.test.ts` 补测试：三级回退各一条、
**同一台设备的 USB 条目与 WiFi 条目（serial 不同、`device_id` 相同）得到同一个键**。
放 `device.ts` 而不是 `appInfo.ts`，因为它的输入是 `DeviceInfo`，
和 `getDeviceBySerial` / `mergeDevicesByIdentity` 是同一族。

`src/lib/appInfo.ts` 加 `appIconKey` 与 `missingIconPackages`，
`src/lib/appInfo.test.ts` 补测试。至少覆盖 PRD 验收条件点名的三种变更：

- 新装一个应用 → 只有它进差集
- 卸载一个应用 → 差集不含它（且它不在 fresh 里，写回时自然被剪枝）
- 更新一个应用（`lastUpdateTime` 变化）→ 只有它进差集
- 全部命中 → 差集为空
- `lastUpdateTime <= 0` 的项被跳过

## 4. 前端桥接层

`src/lib/tauri.ts` 加 `readAppInfoCache` / `writeAppInfoCache` 两个函数，
紧邻 `getInstalledAppIcons`。（没有 `getDeviceCacheKey`——设备键是前端纯函数。）

## 5. 前端面板接线

`src/components/PackageManager.tsx`：

1. `iconCache` 的键从 `serial\0packageName` 改成
   **`deviceKey\0packageName\0lastUpdateTime`**（两处都要改，理由见 `design.md`
   「内存 iconCache 的键要统一」：`selectedDevice` 会在主传输 USB→WiFi 切换时变，
   键里带 serial 会让内存缓存整片失效）。
   `appIconCacheKey` 辅助函数同步改签名——**所有调用点都要跟着改**，
   漏一个就会读不到刚写进去的图标。改之前先 `grep -n "appIconCacheKey" src/`。
2. `loadApps` 按 `design.md`「loadApps 流程」的 6 步接线。第 1 步的
   `deviceCacheKey(device)` 是同步纯函数，不要写成 `await`，也不需要 state 缓存。
   第 5 步复用父任务阶段 2 的分批循环，只把"请求哪些包"换成差集。
3. 加 `phase1DoneRef`：阶段 1 已返回时丢弃迟到的缓存结果。
   这条漏了就会出现"缓存赢了新数据"，是 PRD 验收条件点名的失败模式。
4. 第 6 步 `writeAppInfoCache` 不 await，失败只 `console.error`，不弹 toast。

读 `.trellis/spec/frontend/hook-guidelines.md` 与 `state-management.md` 再动手。

---

## 验证计划

### 会话内必须跑通

```bash
cd src-tauri && cargo test
cd src-tauri && cargo clippy --all-targets -- -D warnings
pnpm test
pnpm build
```

缺工具链就逐条写明哪条没跑、为什么，不要跳过不提。

### 必须在真机上验（本任务的价值全在这里）

1. **命中率**：连设备打开面板 → 关掉 → 再打开。第二次应该**完全不发起图标请求**。
   用日志或抓包确认，不要凭"看起来很快"下结论。
2. **三种变更**各验一次：装一个新应用、卸载一个、更新一个（`pm install -r` 装个新版本），
   各自只有受影响的那个包被重新请求。
3. **元数据新鲜度**：更新一个应用后，即使图标命中缓存，
   列表里的版本号和 APK 大小也必须立刻是新的。
4. **首屏不被缓存赢**：在有缓存的设备上打开面板，确认最终显示的是新数据。
5. **损坏恢复**：手动删掉 `index.json`、写坏它、删掉某个 PNG，
   三种情况各打开一次面板——都要能正常加载，不弹错、不出黄条。
6. **多设备隔离**：两台设备各自缓存互不影响；用 WiFi 连接（serial 含 `:`）
   确认缓存目录名合法且能建出来。
7. **USB / WiFi 同设备，先后连接**：同一台设备分别用 USB 和 WiFi 连接，
   确认走的是同一份缓存目录，且第二次连接时**不重新拉全量图标**
   （这是 `device_id` 排第一位的收益；若该设备读不到 `device_id`，
   会退化成按 serial 存两份，属于预期行为，记录即可）。
8. **USB / WiFi 同设备，同时连接**：两种方式同时连上，`adb devices` 出现两条 serial。
   `09-03-device-transport-merge` 合入后下拉里只剩合并后的一条，**没法再从 UI 上
   在两条之间切换**，所以这条这样验：
   - 主路径：拔掉 USB → 刷新 → 主传输落到 WiFi → 打开应用面板，
     确认**内存 iconCache 仍然命中**（图标立刻在，不重新请求），
     缓存目录仍是同一个。这条验的正是"内存键用 deviceKey 而不是 serial"。
   - 写锁：合并之后两条 serial 同时写缓存的概率很低，但锁很便宜、留着防御。
     真要构造，临时把 `DevicePicker` 换回 `getSelectableDevices`
     （父任务验证计划第 4 条同样的临时改法），在两条之间反复切换，
     确认缓存目录没被剪坏（`index.json` 引用的 PNG 都还在）。

### 回归观察点

- 父任务的三条不变量不能被破坏：元数据永远全量读、图标失败静默降级、
  四个既有命令签名不变。
- 无缓存的首次打开路径应与父任务交付时表现一致。

## 风险点 / 回滚

- 回滚：不注册这两个命令 + `loadApps` 去掉第 1/2/6 步 + `iconCache` 键改回去，
  即回到父任务的状态。不碰 `Main.java`，不需要重建 dex。
- 最容易写错的三处：写入顺序（PNG → index → 剪枝）、`phase1DoneRef` 守卫、
  `sanitize_device_key` 的哈希后缀。
- `iconCache` 键改造要 grep 全部调用点，漏一个的症状是"图标一直不显示"
  且没有任何报错，很难查。

## Follow-up（`task.py start` 前需要确认）

- [ ] 上方**三条**开工门禁均已满足（父任务过滤生效 + dex 已重建 + `device_id` 已合入）
- [ ] 用户已阅读并认可 `prd.md` / `design.md` / 本文件（2026-09-03 复审版）
- [ ] 明确真机验证由用户完成，会话内只保证纯函数与类型检查
