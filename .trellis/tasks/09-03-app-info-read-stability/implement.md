# Implement Plan: 应用信息读取稳定性加固

分支：`claude/app-info-read-stability-tj25vt`

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
3. 加 per-serial 锁：`std::sync::OnceLock<std::sync::Mutex<HashMap<String, Arc<tokio::sync::Mutex<()>>>>>`。
   注意不要跨 `await` 持有 `std::sync::MutexGuard`（clippy 会报，也是真 bug）。
4. `ensure_dex_pushed(app, serial, local_path, bytes_len, remote_path, force)`：
   `force == false` 时先 `adb -s <serial> shell ls -l <remote>` 探测 + `parse_ls_size_matches`；
   命中则跳过。push 改成 `prepare_async_command` + `timeout(PUSH_TIMEOUT)`，
   不再走同步的 `run_adb_with_serial`。
5. `run_app_info_helper<T: DeserializeOwned>(app, serial, mode) -> Result<Vec<T>, String>`：
   按 `design.md`「重试策略」的伪流程实现。**只有超时和 push 失败重试**。
   子进程沿用现有的 `wait_with_output()`，不要改成手动读单管道。
6. 两个 `#[tauri::command]`：
   - `get_installed_apps(app, serial) -> Result<Vec<AppInfo>, String>`（`HelperMode::Metadata`）
   - `get_installed_app_icons(app, serial, packages: Option<Vec<String>>)
     -> Result<Vec<AppIconEntry>, String>`（`HelperMode::Icons`）
     —— `None` / 空数组 → 单次无过滤调用；非空 → `sanitize_package_filter` 后按
     `ICON_FILTER_BATCH` 顺序分批，结果拼接。任一批失败即整体 `Err`。
     过滤后为空但原始输入非空 → 直接 `Err`，不要退化成取全部。
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
3. 懒加载 effect（:158-184）的门槛从 `!fallbackMode` 改为 `iconMode !== "lazy"` 时 return。
4. 黄条加「详情」折叠与「重试」按钮，配色/按钮样式沿用现有类名。
5. 设备离线的清理分支（:121-135）要把 `iconMode` 一并重置。

`src/lib/appInfo.ts` 不需要改（`fallbackAppInfo` 仍是降级路径用的）。
如果给新逻辑加了可抽出的纯函数，放 `appInfo.ts` 并在 `appInfo.test.ts` 补测试，
和现有测试同风格。

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
   预期：应用列表仍能正常出来（速度和现在相当或更好），不出黄条。
   这一条挂了说明 `extract_payload` 的回退路径有问题，必须先修。
2. 在有 `ANDROID_HOME` + `d8` 的机器上跑 `scripts/build-app-info-dex/build.sh`
   重建 `src-tauri/resources/app-info.dex`，再连真机验证：
   - 元数据阶段耗时（**记录下来**——这个数字决定 B6 流式方案要不要做）
   - 应用名/版本/安装时间/APK 大小是否正确
   - 图标是否在元数据渲染后几秒内整体回填
   - **包名过滤真的生效**（子任务 `09-03-app-info-cache` 依赖这条）：临时用
     3 个包名调一次 `get_installed_app_icons`，确认只返回 3 项且耗时明显短于全量。
     这一条挂了子任务就没法开工，务必在本任务收尾时验掉。
3. 并发验证：快速连点「刷新」5 次、以及在加载中途切换设备，确认不再出现黄条。
4. 降级路径验证：临时把 `resources/app-info.dex` 改名制造失败，确认黄条出现、
   「详情」能看到具体错误、「重试」按钮可用、图标退回逐包懒加载仍能显示。
5. 有条件的话找一台老设备或深度定制 ROM，确认 C9 的第 2 级回退真的会被走到
   （stderr 里能看到第 1 级的 stack trace）。

### 回归观察点

- `useLogcatPackageResolution.ts` 仍用 `list_packages`，本任务不应影响 logcat 页面。
- `get_app_icon` 签名未变，降级路径行为应与改动前一致。

## 风险点 / 回滚

- Java、Rust、前端三部分互不依赖，可单独回退。
- 最容易写错的两处：`run_app_info_helper` 的重试错误分类（分错会让用户等两倍时间），
  以及阶段 2 图标回填的 `requestId` 守卫（漏了会把 A 设备的图标画到 B 设备上）。
- 若真机验证发现轻量 Context 路径不可用，删掉第 2 级回退即可，不影响其余改动。

## Follow-up（`task.py start` 前需要确认）

- [ ] 用户已阅读并认可 `prd.md` / `design.md` / 本文件
- [ ] 明确本轮交付「Rust + 前端可验证，Java 改动需用户重建 dex 后真机验证」
- [ ] 记录步骤 2 里元数据阶段的真机耗时，作为是否启动 B6（流式）的判断依据
