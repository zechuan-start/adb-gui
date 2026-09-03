# 应用信息读取稳定性加固

## Goal

`get_installed_apps` 间歇性失败，导致「应用管理」页频繁降级成 `PackageManager.tsx:267`
的黄条「应用名称和版本读取失败，当前显示精简信息。」——同一台设备时好时坏，
用户无法知道原因，也没有重试入口。

本任务修掉造成间歇性失败的根因（图标渲染占满 15s 超时预算、并发调用互相破坏
dex 文件、stdout 零容错、单点 Context 引导路径），并把失败原因暴露给用户。

范围为上一轮讨论中的 **A 档全部（A1–A5）+ C 档第 9 条**。B 档（流式 NDJSON、
dumpsys 降级、本地缓存）明确不在本轮，理由见 Out of Scope。

## Confirmed Facts（代码库已确认，无需用户复述）

### 现有链路

`PackageManager.tsx:80-119` → `getInstalledApps(serial)`
→ `app_info.rs:30` `get_installed_apps`：
1. `resolve_app_info_dex_path()` 定位 `src-tauri/resources/app-info.dex`（5688 字节，
   已 check-in，由 `tauri.conf.json` 的 `"resources/": ""` 规则打包）
2. `run_adb_with_serial(&["push", local, "/data/local/tmp/adb-gui-app-info.dex"])`
   —— **同步阻塞，无超时**（`device.rs:20-40` 的 `run_adb_output` 直接 `.output()`）
3. `adb -s <serial> exec-out sh -c 'CLASSPATH=... app_process /data/local/tmp
   com.adbgui.appinfo.Main'`，`tokio::time::timeout(15s)`
4. `serde_json::from_slice::<Vec<AppInfo>>(&stdout)`

任一步 `Err` → 前端 catch → `listPackages` + `fallbackAppInfo` 降级 → 黄条。

### 已确认的失败面

- **`APP_PROCESS_TIMEOUT = 15s`（`app_info.rs:14`）覆盖的是"全部应用的元数据 +
  全部图标"**。`Main.java:115-144` 对每个第三方应用都要 inflate drawable →
  画 96×96 Bitmap → PNG quality=100 压缩 → Base64。耗时随应用数量线性增长，
  且与设备负载/冷启动/页缓存强相关，是"同一台设备时好时坏"的最直接解释。
- **远程 dex 路径写死**（`app_info.rs:11`），每次调用都重推。
  `PackageManager.tsx:76` 的 `loadRequestRef` 只丢弃过期的 React state，
  **不取消已经在跑的 adb 调用**。连点刷新或切设备时，第二次 push 会在第一个
  `app_process` 正在读该文件时覆写它。
- **`app_info.rs:97` 把整个 stdout 交给 `serde_json::from_slice`**，一个字节噪声
  即失败；`Main.java:43` 的 `System.out.print()` 无换行且无显式 flush。
- **`Main.java:51-67` 只有 `ActivityThread.systemMain()` 一条路径**。该方法除了
  建 Context 还会 `attach(true)`、建 Instrumentation、`makeApplication().onCreate()`、
  初始化 ThreadedRenderer，是 ROM 定制介入面最大的一段。本项目已经在这条路上踩过
  一次（commit `c4981dd` "fix: initialize app info helper looper"）。
- **失败原因只进 `console.error`**（`PackageManager.tsx:98`），黄条是死文案，
  无重试按钮。

### 可复用的既有资产

- `app_icon.rs:7` `get_app_icon`（单包 `cmd package icon`）+ `PackageManager.tsx:158-184`
  的可见区懒加载 effect（一次最多 5 个）——目前只在 `fallbackMode` 下启用，可以直接
  复用为图标的最终兜底。
- `adb.rs:152` `prepare_async_command`（已处理 Windows `CREATE_NO_WINDOW` 和
  Linux 内嵌 adb 的 `LD_LIBRARY_PATH`）。
- `logcat.rs` 已有完整的异步子进程 + 超时 + stderr 单独 drain 的写法可参照。
- `src-tauri/Cargo.toml` 无哈希类依赖（只有 serde/serde_json/tokio/regex/base64/
  dirs/log/chrono）——本任务不新增依赖。

### 版本兼容约束（重要）

`app-info.dex` 是 check-in 的预编译产物，重建需要 JDK + Android SDK
（`scripts/build-app-info-dex/build.sh`）。**执行本任务的环境很可能无法重建 dex**。
因此所有 Rust 侧改动必须满足：**新 Rust + 仓库里的旧 dex 仍然可用**（可以退化成
"慢速全量模式"，但绝不能变成硬失败）。这是一条硬性验收项，不是"尽量"。

## Requirements

### A1 — 把图标移出关键路径

1. `Main.java` 的 `main(String[] args)` 支持模式参数；**未知参数必须被忽略**
   （保证旧 dex 收到新参数时行为不变）。
2. `get_installed_apps` 只取元数据（名称/版本/时间/APK 大小），不渲染图标。
3. 新增一条批量图标命令，由前端在元数据渲染完成**之后**后台调用，回填图标。
4. 批量图标调用失败/超时不得影响已渲染的元数据，静默退到既有的按需
   `get_app_icon` 懒加载路径。

### A2 — stdout 加固

5. Java 侧在 JSON 前输出一行 sentinel，并在退出前显式 flush stdout 与 stderr。
6. Rust 侧从 stdout 中定位**最后一次** sentinel 并只解析其后的内容；
   找不到 sentinel 时回退为"trim 后整体解析"（旧 dex 兼容路径）。
7. 上述提取逻辑必须是纯函数并带 Rust 单元测试（前置噪声、多次 sentinel、
   无 sentinel、空 stdout、非法 JSON）。

### A3 — 消除并发互踩

8. 远程 dex 文件名带内容哈希；设备上已存在且大小一致时跳过 push。
9. 同一 serial 的 `get_installed_apps` / 批量图标调用串行化，不得并发执行。
10. 哈希与文件名生成是纯函数并带单元测试；不新增第三方依赖。

### A4 — 超时与重试

11. push 改为带超时的异步调用，不再无限期阻塞。
12. 元数据与图标两种模式使用各自的超时预算。
13. **超时**或 **push 失败**时自动重试一次（重试前强制重新 push）；
    `app_process` 明确非零退出（ROM 不兼容）**不重试**，直接返回错误。

### A5 — 失败原因可见 + 可重试

14. 降级黄条展示具体失败原因（可折叠，过长时截断展示但保留完整文本可复制）。
15. 黄条提供「重试」按钮，重新走完整的 `get_installed_apps` 路径。

### C9 — Context 引导多级回退

16. `createSystemContext()` 增加第二条轻量路径：`ActivityThread` 的无参构造 +
    `getSystemContext()`（跳过 `attach`/Instrumentation/Application.onCreate）。
17. `systemMain()` 保持**第一优先**，轻量路径作为其失败后的回退——本轮不调换顺序，
    确保对现在能成功的设备零回归。
18. 每一级失败都把完整 stack trace 写入 stderr，使 A5 的「详情」真正可用于诊断。

## Out of Scope（本轮明确不做）

- **B6 流式 NDJSON + Tauri event 增量渲染**：与 `appInfo.ts` 按应用名排序的策略冲突
  （流式到达顺序随机，每批重排会让虚拟列表跳动），且会引入"流到一半断了"的新状态机。
  其主要收益在 A1 完成后大部分消失，应在真机实测 A1 后的元数据耗时再决定。
- **B7 `dumpsys package` 降级解析**：输出格式随 Android 版本/厂商 ROM 变化，
  规划与执行环境都没有真机可验证 parser，风险不可控。
- **B8 按 serial 的本地缓存**：需要配套的失效策略（装/卸/更新应用如何感知），
  属于体验优化而非稳定性根因。
- 不改动 `list_packages` 的签名与行为（`useLogcatPackageResolution.ts` 仍依赖它）。
- 不改 `get_app_icon` 的签名与行为（作为最终兜底继续存在）。
- 不新增 Rust / npm 依赖。

## Acceptance Criteria

- [ ] `get_installed_apps` 不再触发设备端图标渲染；元数据与图标是两条独立的调用，
      图标调用失败时元数据仍完整可见（无黄条）。
- [ ] 同一 serial 上并发触发（连点刷新、切设备）不会互相破坏：远程 dex 带内容哈希、
      已存在则跳过 push、同 serial 串行执行。
- [ ] stdout 前置噪声不再导致整体失败；sentinel 提取与哈希/文件名生成有 Rust 单元测试
      覆盖，`cargo test` 通过。
- [ ] push 与 `app_process` 各自带超时；超时/push 失败自动重试一次，
      `app_process` 非零退出不重试。
- [ ] 降级黄条显示具体失败原因并提供「重试」按钮；重试成功后黄条消失。
- [ ] `Main.java` 的 Context 引导有两级回退，两级失败的 stack trace 都进 stderr。
- [ ] **向后兼容**：不重建 `app-info.dex` 的前提下，新 Rust 代码配仓库现有的旧 dex
      仍能正常返回应用列表（退化为慢速全量模式，不是硬失败）。这一条必须实际验证，
      不能只在代码里"看起来兼容"。
- [ ] `pnpm test` 与 `pnpm build` 通过；`cargo check` / `cargo clippy` / `cargo test`
      通过（若执行环境缺 Rust 工具链，必须在交付说明中显式声明"未验证"，不得跳过不提）。
- [ ] `implement.md` 的验证计划显式包含"需要用户在有 Android SDK 的机器上重建 dex +
      连真机验证"，且不在会话内声称已完成。

## Open Questions

- [x] 图标怎么给？→ **两段式 dex 调用**：先 `--no-icons` 拿元数据立即渲染，
      再后台一次 `--icons-only` 全量回填。不选"沿用逐包懒加载"（成功路径的图标体验
      会退化成滚动才出现），也不选"分批按可见区批量取"（复杂度高于收益）。
      逐包懒加载保留为图标调用失败后的兜底。
- [x] C9 的两条路径谁优先？→ **`systemMain()` 优先**，轻量路径作回退。
      纯增量、对现有可用设备零回归；等真机数据支持后再考虑对调。
- [x] 哈希算什么？→ 手写 FNV-1a 64（十来行，带单元测试），不引入 sha2/blake3 依赖。
- [x] 本轮要不要做流式？→ 不做，理由见 Out of Scope，留待 A1 真机实测后重评。

## Notes

- 技术方案细节见 `design.md`，执行步骤与验证计划见 `implement.md`。
- 本任务由其他模型执行；规划产物需自包含，不依赖本次对话上下文。
