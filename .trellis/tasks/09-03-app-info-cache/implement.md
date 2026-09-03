# Implement Plan: 应用信息本地缓存

分支：`claude/app-info-read-stability-tj25vt`（与父任务同分支）

## 开工前的门禁

父任务 `09-03-app-info-read-stability` 必须已完成，且下面两条**实际验证过**，
不是"代码看起来支持"：

- [ ] `get_installed_app_icons(serial, packages)` 的包名过滤在真机上生效
      （父任务 `implement.md` 验证计划第 2 条最后一项：3 个包名调一次，
      只返回 3 项且明显更快）
- [ ] `src-tauri/resources/app-info.dex` 已用 `build.sh` 重建并提交

第 2 条不满足的话，旧 dex 会忽略过滤返回全集——功能不坏，但**一点都不会变快**，
本任务等于白做。两条不齐就停下来问，不要开工。

---

## 1. Rust：纯函数与单元测试先行

新文件 `src-tauri/src/commands/app_info_cache.rs`（在 `commands/mod.rs` 挂上）。

先把不碰文件系统的部分写完并测过：

- `sanitize_device_key(raw: &str) -> String` —— 非法字符替换 + 截断 64 + `-<hash:08x>` 后缀。
  测试：含 `:` 的 Wi-Fi serial、纯字母数字 serial、超长输入被截断、
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
6. `get_device_cache_key`：`getprop ro.serialno` → `alias_identity` → `serial`，
   再过 `sanitize_device_key`。
7. `lib.rs` 的 `invoke_handler` 注册这三个命令。

文件系统测试参照 `device_files.rs:804-834` 的写法（`std::env::temp_dir()` +
pid + 纳秒时间戳建目录，用完 `remove_dir_all`），不引入 tempfile 依赖。
至少覆盖：写入后读回一致、index 版本不符时目录被清、单个 PNG 被删后只丢那一个图标、
剪枝真的删掉了不再引用的文件。

动手前读 `.trellis/spec/backend/directory-structure.md` 与 `error-handling.md`
（本模块大量使用"吞掉错误返回默认值"的写法，要确认它在项目里的既有表达方式）。

## 3. 前端纯函数

`src/lib/appInfo.ts` 加 `appIconKey` 与 `missingIconPackages`，
`src/lib/appInfo.test.ts` 补测试。至少覆盖 PRD 验收条件点名的三种变更：

- 新装一个应用 → 只有它进差集
- 卸载一个应用 → 差集不含它（且它不在 fresh 里，写回时自然被剪枝）
- 更新一个应用（`lastUpdateTime` 变化）→ 只有它进差集
- 全部命中 → 差集为空
- `lastUpdateTime <= 0` 的项被跳过

## 4. 前端桥接层

`src/lib/tauri.ts` 加 `getDeviceCacheKey` / `readAppInfoCache` / `writeAppInfoCache`
三个函数，紧邻 `getInstalledAppIcons`。

## 5. 前端面板接线

`src/components/PackageManager.tsx`：

1. `iconCache` 的键从 `serial\0packageName` 改成 `serial\0packageName\0lastUpdateTime`。
   `appIconCacheKey` 辅助函数同步改签名——**所有调用点都要跟着改**，
   漏一个就会读不到刚写进去的图标。改之前先 `grep -n "appIconCacheKey" src/`。
2. `loadApps` 按 `design.md`「loadApps 流程」的 6 步接线。
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
6. **多设备隔离**：两台设备各自缓存互不影响；用 Wi-Fi 连接（serial 含 `:`）
   确认缓存目录名合法且能建出来。
7. **USB / Wi-Fi 同设备**：同一台设备分别用 USB 和 Wi-Fi 连接，
   确认走的是同一份缓存（这是 `ro.serialno` 排第一位的收益；
   若该设备读不到 `ro.serialno`，会退化成两份缓存，属于预期行为，记录即可）。

### 回归观察点

- 父任务的三条不变量不能被破坏：元数据永远全量读、图标失败静默降级、
  四个既有命令签名不变。
- 无缓存的首次打开路径应与父任务交付时表现一致。

## 风险点 / 回滚

- 回滚：不注册三个命令 + `loadApps` 去掉第 1/2/6 步，即回到父任务的状态。
  不碰 `Main.java`，不需要重建 dex。
- 最容易写错的三处：写入顺序（PNG → index → 剪枝）、`phase1DoneRef` 守卫、
  `sanitize_device_key` 的哈希后缀。
- `iconCache` 键改造要 grep 全部调用点，漏一个的症状是"图标一直不显示"
  且没有任何报错，很难查。

## Follow-up（`task.py start` 前需要确认）

- [ ] 上方两条开工门禁均已满足
- [ ] 用户已阅读并认可 `prd.md` / `design.md` / 本文件
- [ ] 明确真机验证由用户完成，会话内只保证纯函数与类型检查
