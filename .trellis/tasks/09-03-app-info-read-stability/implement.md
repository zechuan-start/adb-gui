# Implement Plan: 应用信息读取稳定性加固

分支：`claude/app-info-read-stability-tj25vt`（从 `main` 开）。
`09-03-device-transport-merge` 走它自己的分支，两者无代码依赖、可并行；
子任务 `09-03-app-info-cache` 在本任务合入后另起分支。

按下面的顺序做。步骤 1–4 是 Rust + 前端，**不依赖重建 dex 就能验证并交付价值**；
步骤 5 是 Java，本轮大概率无法在执行环境里验证，见「验证计划」。

---

## 1. Rust：纯函数与单元测试先行

文件：`src-tauri/src/commands/app_info.rs`

新增（全部私有 + `#[cfg(test)]` 覆盖）：

- `fnv1a_64(bytes: &[u8]) -> u64` —— offset basis `0xcbf29ce484222325`，
  prime `0x100000001b3`。测试：空输入、已知向量、不同输入不同输出。
- `remote_dex_path(hash: u64) -> String` —— `/data/local/tmp/adb-gui-app-info-<hash:016x>.dex`。
  测试：格式固定、同 hash 稳定、只含 `[a-z0-9-/.]`。
- `extract_payload(stdout: &[u8]) -> &[u8]` —— 见 `design.md`「stdout 提取」。
  测试：sentinel 前有噪声、sentinel 出现两次（取最后一次）、无 sentinel 回退整体、
  sentinel 后为空、两端空白被 trim。
- `parse_helper_output::<T>(stdout: &[u8]) -> Result<Vec<T>, String>` ——
  由 `extract_payload` + `serde_json::from_slice` 组成。
  把现有的 `parse_app_info` 重构成它的调用者，**保留现有两个测试不变**并补充新用例。
- `parse_ls_size_matches(output: &str, expected: u64) -> bool` ——
  按空白切分，任一字段解析成 `u64` 且等于 `expected` 即 `true`。
  测试：典型 `ls -l` 行、`No such file or directory`、空串、size 不匹配。
- `truncate_detail(detail: &str, max: usize) -> String` —— 超长时截断并加尾注
  （如 `…(truncated)`）。测试：短串原样返回、长串被截断、**按字符边界截断不能 panic**
  （用含中文/emoji 的输入测）。
- `is_safe_package_name(name: &str) -> bool` / `sanitize_package_filter(&[String]) -> Vec<String>`
  / `build_helper_command(remote, mode, filter) -> String` —— 见 `design.md`
  「包名过滤与分批」。测试：合法包名、含 `;`/空格/`$` 的非法名被拒、去重、
  顺序稳定、空输入、命令串拼装结果（有过滤 / 无过滤两种）。

先跑一次 `cd src-tauri && cargo test` 确认这一层全绿，再往下走。

## 2. Rust：命令改造

同文件。

1. 删除 `REMOTE_DEX_PATH` / `APP_PROCESS_COMMAND` / `APP_PROCESS_TIMEOUT` 常量，
   替换为 `design.md`「模块常量」一节列出的那组。
2. 加 `HelperMode` 枚举与 `AppIconEntry` 结构体（**不要加 `deny_unknown_fields`**）。
3. 加**全局**锁：`static HELPER_LOCK: OnceLock<tokio::sync::Mutex<()>>`。
   一把锁，不是 per-serial、不是 HashMap——见 `design.md`「全局串行化」：
   同一台设备同时接 USB 和 WiFi 时会有两条不同 serial 指向同一个远程 dex 路径，
   per-serial 锁保护不了。
4. `ensure_dex_pushed(...) -> Result<bool, String>` —— **返回值是"本轮是否真的推了"**，
   不是 `()`。`force == false` 时先 `adb -s <serial> shell ls -l <remote>` 探测 +
   `parse_ls_size_matches`，命中则跳过并返回 `Ok(false)`；实际推了返回 `Ok(true)`；
   `force == true` 必然返回 `Ok(true)`。
   push 改成 `prepare_async_command` + `timeout(PUSH_TIMEOUT)`，
   不再走同步的 `run_adb_with_serial`。
5. `run_app_info_helper<T: DeserializeOwned>(app, serial, mode) -> Result<Vec<T>, String>`：
   按 `design.md`「重试策略」的伪流程实现。自动重试触发条件是**两条**：
   push 失败、以及**跳过了 push 的那一轮非零退出或 payload 无效**（损坏 dex 自愈——漏了这条，
   设备上一旦有个大小对但内容坏的 dex，这台设备就永久卡在黄条上）。
   实机上损坏 dex 可能表现为成功退出码 + stdout `Aborted`, 所以 payload 解析结果必须
   参与判断. `pushed_fresh == true` 时非零退出或 payload 无效立刻返回错误, 不重试。
   **`app_process` 超时不自动重试**：置 `FORCE_PUSH_NEXT`（`static AtomicBool`）
   后直接返回错误，下一次调用（通常就是用户点黄条上的「重试」）会强制重推。
   进入函数时用 `FORCE_PUSH_NEXT.swap(false)` 取出并消费这个标志。
   —— 超时重试和非零退出自愈是**两条独立路径**，不要合并成一个分支。
   子进程沿用现有的 `wait_with_output()`，不要改成手动读单管道。
6. 两个 `#[tauri::command]`：
   - `get_installed_apps(app, serial) -> Result<Vec<AppInfo>, String>`（`HelperMode::Metadata`）
   - `get_installed_app_icons(app, serial, packages: Option<Vec<String>>)
     -> Result<Vec<AppIconEntry>, String>`（`HelperMode::Icons`）
     —— `None` / 空数组 → 单次无过滤调用；非空 → `sanitize_package_filter` 后按
     `ICON_FILTER_BATCH` 顺序分批，结果拼接。任一批失败即整体 `Err`。
     过滤后为空但原始输入非空 → 直接 `Err`，不要退化成取全部。
     注意这里的分批只是**防御**（调用方传了超过 50 个包名时）；
     真正决定节奏的是前端的分批（步骤 4），因为只有前端知道用户切没切设备。
7. `src-tauri/src/lib.rs:207` 之后注册 `commands::app_info::get_installed_app_icons`。

读一遍 `.trellis/spec/backend/error-handling.md` 和 `quality-guidelines.md` 再动手。

## 3. 前端桥接层

文件：`src/lib/tauri.ts`

紧挨 `getInstalledApps`（:356）新增 `AppIconEntry` 接口与 `getInstalledAppIcons`。
`AppInfo` 与 `getInstalledApps`、`listPackages`、`getAppIcon` 一律不改签名。

## 4. 前端面板改造

文件：`src/components/PackageManager.tsx`

按 `design.md`「前端设计」实现：

1. `fallbackMode: boolean` → `fallback: { reason: string } | null`；
   新增 `iconMode: "bulk-pending" | "bulk-done" | "lazy"`。
2. `loadApps` 拆成阶段 1（await、决定 loading/fallback）+ 阶段 2（不 await 的后台图标回填）。
   **每次回写 state 前都要用 `loadRequestRef` 守卫**，阶段 2 尤其容易漏。
3. **阶段 2 按包名分批**（`ICON_BATCH_SIZE = 50`）顺序 await，每批：
   发出前过 requestId 守卫 → 回填 `iconCache` + `setIcons` → 检查超集。
   **超集（返回了这一批之外的包名）= 设备上是旧 dex**，收下全部、置 `bulk-done`、
   跳出循环，不要再发后续批次。任一批抛错 → 置 `lazy` 跳出，已回填的保留。
   见 `design.md`「前端设计」第 4 步——这三件事（守卫、超集、失败即停）
   漏任何一件都会出问题，别只实现循环本身。
4. 懒加载 effect（:158-184）的门槛从 `!fallbackMode` 改为 `iconMode !== "lazy"` 时 return。
5. 黄条加「详情」折叠与「重试」按钮，配色/按钮样式沿用现有类名。
   「重试」重新走完整 `loadApps`；Rust 侧若上一轮是超时，这一轮会自动强制重推 dex
   （`FORCE_PUSH_NEXT`），前端不需要为此传任何参数。
6. 设备离线的清理分支（:121-135）要把 `iconMode` 一并重置。

`src/lib/appInfo.ts` 新增两个纯函数并在 `appInfo.test.ts` 补测试（和现有测试同风格）：
`chunkPackages(names, size)`（空数组、整除、余数、size 边界）与
`hasUnrequestedPackages(entries, requested)`（等集、子集、超集、空请求集）。
`fallbackAppInfo` 保持不动，仍是降级路径用的。

动手前读 `.trellis/spec/frontend/component-guidelines.md` 与 `type-safety.md`。

## 5. Java 侧

文件：`scripts/build-app-info-dex/src/com/adbgui/appinfo/Main.java`

1. `SENTINEL` 常量 + 显式构造的 `PrintStream`（`BufferedOutputStream` + `FileDescriptor.out`，
   UTF-8），输出 `SENTINEL\n` + JSON，finally 里 flush stdout 与 stderr。
2. `Mode` 枚举 + `parseArgs(String[] args)`：未知的 `--xxx` 忽略，裸 token 收集为
   `HashSet<String>` 包名过滤集，默认 `FULL`。主循环在 `FLAG_SYSTEM` 判断后加
   过滤跳过；过滤集里设备上不存在的包名静默跳过，不报错。
3. `METADATA_ONLY` 路径完全不触碰 `getApplicationIcon` / Bitmap / PNG 压缩；
   `ICONS_ONLY` 只输出 `packageName` + `icon`。
4. `createSystemContext()` 两级回退（C9），两级失败都 `printStackTrace(System.err)`。
5. 在 `SENTINEL` 定义处加注释：改动它必须同步改 `app_info.rs` 的 `PAYLOAD_SENTINEL`
   并重建 dex。

**不要提交一个没重建的 dex，也不要为了"让它看起来完成"而手改
`src-tauri/resources/app-info.dex`。** 该文件要么由 `build.sh` 重新生成，
要么保持现状不动（兼容矩阵保证仍可用）。

## 6. 文档

`src-tauri/resources/README.txt` 的 "App information helper" 段落补一句：
dex 与 Rust 侧共享 `--ADBGUI-APPINFO-V1--` sentinel、`--no-icons` / `--icons-only`
模式参数以及 `--icons-only` 后可选的包名过滤，改动契约需同时更新两侧并重建 dex。

---

## 验证计划

### 会话内必须跑通

```bash
cd src-tauri && cargo test          # 第 1 步的纯函数测试
cd src-tauri && cargo clippy --all-targets -- -D warnings
cd src-tauri && cargo check
pnpm test                           # 现有 277 项 + 新增
pnpm build                          # tsc + vite build
```

若执行环境缺 Rust 工具链或 Android SDK，**在交付说明里逐条写明哪一条没跑、为什么**，
不要跳过不提，也不要声称"应该没问题"。

### 必须由用户在本地/真机完成

1. **兼容矩阵第 2 行（最重要，不需要 Android SDK）**：
   不重建 dex，直接用改完的 Rust + 前端连一台真机跑一次。
   预期：应用列表仍能正常出来（速度和现在相当或更好），不出黄条；
   图标仍然会整片回填，且**阶段 2 只发出一批**（第一批就返回了全集，触发超集检测
   停止后续批次）。若日志里看到发了很多批，说明超集检测没生效，
   旧 dex 会被迫把全量渲染跑 N 遍，必须先修。
   这一条挂了还可能说明 `extract_payload` 的回退路径有问题。
2. 在有 `ANDROID_HOME` + `d8` 的机器上跑 `scripts/build-app-info-dex/build.sh`
   重建 `src-tauri/resources/app-info.dex`，再连真机验证：
   - 元数据阶段耗时（**记录下来**——这个数字决定 B6 流式方案要不要做）
   - 应用名/版本/安装时间/APK 大小是否正确
   - 图标是否**分批渐进出现**（每批 50 个），而不是等全部渲染完才整片刷上
   - **包名过滤真的生效**（子任务 `09-03-app-info-cache` 依赖这条）：
     现在这就是常规路径，不需要临时手动调——观察阶段 2 发出的批次数
     ≈ `ceil(应用数 / 50)`，且每批返回条数就是这一批请求的数量（不是全集）。
     这一条挂了子任务就没法开工，务必在本任务收尾时验掉。
3. 并发验证：快速连点「刷新」5 次、以及在加载中途切换设备，确认不再出现黄条。
   **切设备时还要看等待时间**：在 A 设备的图标还在回填时切到 B，
   B 的应用列表应当在"当前这一批跑完"的量级（几秒）内出来，
   而不是等 A 的图标全部回完。这条验的是分批 + "切设备不再发下一批"。
4. **同设备双传输并发**（这条是全局锁存在的理由，务必验）：
   同一台手机同时用 USB 线和 `adb connect` 连上，`adb devices` 会出现两条 serial。
   在其中一条加载途中立刻切到另一条，反复几次，确认不出黄条。
   改成 per-serial 锁的话这里必然复现 dex 被截断。
   ⚠️ **`09-03-device-transport-merge` 合入 `main` 之后，下拉里这两条会合并成一条，
   这一步就没法从 UI 上操作了**。所以要么赶在它合入前验，要么临时把
   `mergeDevicesByIdentity` 换回 `getSelectableDevices` 再验。
   （合并只发生在展示层，`adb devices` 仍是两条，全局锁的必要性不变。）
5. **损坏 dex 自愈**（这条能人工精确构造，务必验）：
   先正常加载一次，让设备上有了 `/data/local/tmp/adb-gui-app-info-<hash>.dex`。
   然后在设备上把它替换成**同样字节数但内容无效**的文件，例如
   `adb shell "head -c $(stat -c %s <path>) /dev/urandom > <path>"`
   （或读出大小后用 `dd` 写等长随机数据）。
   再点刷新：`ls` 大小命中 → 跳过 push → `app_process` 非零退出, 或主机收到成功
   退出码但 payload 为 `Aborted`/无效 JSON →
   **应当自动强制重推并成功**，用户看不到黄条。
   若这里出现黄条，说明自愈分支没实现或分错了，这台设备之后每次刷新都会失败。
6. 降级路径验证：临时把 `resources/app-info.dex` 改名制造失败，确认黄条出现、
   「详情」能看到具体错误、「重试」按钮可用、图标退回逐包懒加载仍能显示。
7. **超时不自动重试**：把 `METADATA_TIMEOUT` 临时改成 1s（或找一台特别慢的设备）
   跑一次，确认：黄条在**一个**超时预算之后出现（不是两个），
   「详情」里的文案提示可以重试；随后点「重试」，确认这一轮**强制重推了 dex**
   （`FORCE_PUSH_NEXT` 生效，日志里能看到 push 而不是 `ls` 命中跳过）。
   验完把常量改回去。
8. 有条件的话找一台老设备或深度定制 ROM，确认 C9 的第 2 级回退真的会被走到
   （stderr 里能看到第 1 级的 stack trace）。

### 回归观察点

- `useLogcatPackageResolution.ts` 仍用 `list_packages`，本任务不应影响 logcat 页面。
- `get_app_icon` 签名未变，降级路径行为应与改动前一致。

## 风险点 / 回滚

- Java、Rust、前端三部分互不依赖，可单独回退。
- 最容易写错的三处：
  1. `run_app_info_helper` 的失败分类。两个方向的代价不对称：把超时也拿去自动重试
     只是让用户等两倍时间才看到黄条；而漏掉"跳过 push 后执行失败或 payload 无效
     要强制重推"，
     会让一台设备**永久**卡在黄条上——每次都跳过 push、每次都跑同一个坏文件，
     没有任何路径能恢复。后者严重得多。
  2. 阶段 2 图标回填的 `requestId` 守卫（漏了会把 A 设备的图标画到 B 设备上），
     以及"切设备后不再发下一批"（漏了新设备的元数据会一直卡在全局锁上）。
  3. 超集检测（漏了旧 dex 会把全量渲染跑 `ceil(应用数/50)` 遍，比不分批还慢得多）。
- 若真机验证发现轻量 Context 路径不可用，删掉第 2 级回退即可，不影响其余改动。

## Follow-up（`task.py start` 前需要确认）

- [ ] 用户已阅读并认可 `prd.md` / `design.md` / 本文件（2026-09-03 复审版）
- [ ] 明确本轮交付「Rust + 前端可验证，Java 改动需用户重建 dex 后真机验证」
- [ ] 记录步骤 2 里元数据阶段的真机耗时，作为是否启动 B6（流式）的判断依据
- [ ] 验证计划第 4 条（同设备双传输）安排在 `09-03-device-transport-merge`
      合入 `main` 之前做，或按那条里写的方式临时构造
- [ ] 本任务收尾时确认"包名过滤真的生效"（验证计划第 2 条），
      否则子任务 `09-03-app-info-cache` 不能开工
