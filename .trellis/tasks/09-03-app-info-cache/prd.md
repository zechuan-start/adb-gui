# 应用信息本地缓存

父任务：`09-03-app-info-read-stability`

## Goal

应用列表里真正贵的是**图标**（设备端逐个 inflate drawable + PNG 压缩）。
父任务把图标移出关键路径后，每次打开面板仍然要把全部图标重渲染一遍。

本任务把图标持久化到本地，只向设备请求**变更过**的包，让第二次及以后打开
某台设备的应用列表时图标近乎瞬时出现。

## 前置依赖（硬依赖，不是建议）

**父任务必须先完成并通过真机验证**，本任务才能开工。具体依赖两件事：

1. `get_installed_app_icons(serial, packages)` 的包名过滤契约已实现且**真机验证生效**
   （父任务 `implement.md` 验证计划第 2 条的最后一项）。过滤不生效的话，
   本任务的核心机制（只请求变更包）无从谈起。
2. `app-info.dex` 已用 `scripts/build-app-info-dex/build.sh` 重建并提交。
   仓库里的旧 dex 会忽略过滤参数返回全集——功能上不会坏，但**一点都不会变快**，
   等于本任务白做。

开工前先确认这两条，不要因为"代码看起来支持"就动手。

## Confirmed Facts（已核实）

- `AppInfo` 已含 `lastUpdateTime`（`app_info.rs`、`tauri.ts:33`），
  由 `PackageInfo.lastUpdateTime` 而来，应用被 `pm install -r` / 商店升级时会变。
- 前端已有模块级 `iconCache: Map<string, string>`（`PackageManager.tsx:21`，
  键为 `serial\0packageName`），但只在内存里，应用重启即丢。本任务是把它落盘。
- **没有现成的设备稳定标识**：`device_info.rs:21-25` 只读
  `ro.product.model` / `manufacturer` / `ro.build.version.release` / `sdk` /
  `ro.product.cpu.abi`，没读 `ro.serialno`。`device.rs:106` 的 `alias_identity`
  只对 mDNS 配对的 Wi-Fi 设备有值。
- **没有 app 缓存目录的先例**：仓库只用过 `dirs::picture_dir()`（`screenshot.rs:64`）
  和 `dirs::document_dir()`（`bug_report.rs:299`、`logcat.rs:1214`），
  那些是"给用户看的产物"目录，不是缓存。本任务要新建这个约定。
- `Cargo.toml` 无哈希/序列化以外的依赖，本任务同样不新增依赖。

## Requirements

### 失效键

1. 图标缓存条目的键是 **`(packageName, lastUpdateTime)`**，不是包名。
   包名只能抓增删，抓不到应用更新——而更新恰恰最常改图标，用包名做键会产生
   **永不自愈的静默错误**。
2. 不需要额外的"探测变更"调用：父任务的阶段 1（元数据）本来就每次全量读，
   且返回 `lastUpdateTime`，**它本身就是 diff 探针**。
3. 淘汰以阶段 1 的结果为全集：缓存里存在、但不在本次结果中的条目直接删除。
   增、删、改由这一条统一覆盖。

### 缓存范围

4. **元数据永远全量读，不得用缓存替代**，避免版本号/大小 stale。
   元数据的落盘副本只用于「乐观首屏」（见 7）。
5. 只有图标走"按需请求"：本次结果中 `(pkg, lastUpdateTime)` 未命中缓存的包，
   才组成过滤集调 `getInstalledAppIcons(serial, packages)`。全部命中则完全不调用。

### 存储

6. **按设备分库**，不做跨设备共享。理由是正确性而非简单：
   `appName` 来自 `getApplicationLabel`（依赖设备 locale）、`icon` 来自
   `getApplicationIcon`（依赖设备 density 与 Android 版本的 adaptive icon 遮罩），
   同包同版本在不同设备上还可能是不同 build。共享要正确，键就得是
   `(pkg, versionCode, locale, density, sdk)`，已基本等价于按设备分库，
   收益却只在"多设备且应用集重叠"时兑现一次冷加载。
7. 元数据落盘一份，用于选中设备时的**乐观首屏**：立刻画出上次的列表，
   阶段 1 返回后静默 reconcile。首屏数据必须在 UI 上可被 reconcile 覆盖，
   不能出现"缓存赢了新数据"的情况。
8. 缓存写在 Rust 侧的应用缓存目录，**不得使用 localStorage**——
   300 个图标 base64 约 4–8MB（估算），localStorage 5MB 配额会直接炸。
9. 缓存不可用（目录建不了、文件损坏、JSON 解析失败）时一律**静默退化**成
   "全量取图标"，绝不向用户报错，也绝不阻断列表加载。

### 设备键

10. 设备键优先用稳定标识，退化顺序：`ro.serialno` → `alias_identity` → `serial`。
    读 `ro.serialno` 合并进 `device_info.rs` 现有的那批 `getprop`，不新增往返。
11. 设备键必须做文件名安全化（Wi-Fi serial 含 `:`，Windows 文件名非法）。

## Out of Scope

- 跨设备共享图标（理由见 Requirement 6）。
- 缓存总量上限 / LRU 淘汰。单设备量级在 10MB 内，先不做；
  真要做也应该是"按设备目录淘汰"而不是按条目。
- 缓存的 UI 管理入口（查看占用、手动清理）。
- 系统应用、多用户/多 profile。
- 父任务 Out of Scope 里的 B6 流式、B7 dumpsys 降级。

## Acceptance Criteria

- [ ] 同一台设备第二次打开应用面板，若期间没有装卸/更新应用，
      **完全不发起图标请求**，图标直接来自缓存。
- [ ] 装一个新应用 → 只有这一个包进过滤集；卸载一个 → 缓存条目被删；
      更新一个（`lastUpdateTime` 变化）→ 只有这一个包被重新请求。
      三种情况各有一条自动化测试覆盖 diff 纯函数。
- [ ] 元数据每次都是新鲜的：改了应用版本后，即使图标命中缓存，
      列表里的版本号/APK 大小也必须立刻更新。
- [ ] 乐观首屏不会覆盖新数据：阶段 1 返回后列表以新数据为准。
- [ ] 缓存目录被删除 / 文件被写坏 / JSON 非法时，列表仍能正常加载
      （静默退化为全量取图标），不弹错、不出黄条。
- [ ] 两台设备的缓存互不影响；Wi-Fi 设备（serial 含 `:`）的缓存目录名合法。
- [ ] 不新增 Rust / npm 依赖；`cargo test`、`pnpm test`、`pnpm build` 通过。

## Open Questions

- [ ] locale / density 变化后缓存的图标会偏（元数据不受影响，因为每次全量读）。
      因为统一缩到 96×96，视觉影响很小。两个选项：(a) 接受，
      (b) 把 locale + density 拼进设备键，换语言/改显示大小后全量重刷一次。
      **倾向 (a)**，但需要用户拍板——这决定设备键的形状，要在 `design.md` 之前定。
- [ ] 缓存文件形态：倾向 `index.json` + 每图标一个 PNG 文件
      （避免为 2 个图标重写 8MB 大 JSON，且省掉 base64 的 33% 开销），
      但需要在 `design.md` 里对比确认后落定。

## Notes

- 本任务是纯增量的 Rust + 前端改动，**不碰 `Main.java`、不需要重建 dex**，
  可以独立验证、独立回滚。
- `design.md` / `implement.md` 待前置依赖确认、Open Questions 定稿后再写。
