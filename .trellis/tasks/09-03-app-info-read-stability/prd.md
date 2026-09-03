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
   调用方式是**按包名分批**：前端拿阶段 1 已经到手的包名列表，
   按固定上限（50）切块，一批一批顺序调用，每批返回即回填。
   不做"一次性全量"的原因见 Requirement 5 的说明和 `design.md`「全局串行化」。
4. 批量图标调用失败/超时不得影响已渲染的元数据：已回填的图标保留，
   剩下的静默退到既有的按需 `get_app_icon` 懒加载路径，不弹 toast、不出黄条。
5. 批量图标命令支持**可选的包名过滤**：不传过滤则返回全部图标；
   传了则只渲染指定包名。过滤列表以命令行参数传递，
   包名在拼进 shell 命令前必须校验字符集；调用方传超过上限时 Rust 侧自行分批。
   —— 这条契约**本轮就是主要调用路径**（Requirement 3 的分批调用），
   不是只为子任务 `09-03-app-info-cache` 预留的。两个直接好处：
   一是每次调用只占住全局锁几秒而不是几十秒（切设备时不会长时间干等），
   二是"过滤真的生效"由常规路径覆盖，不必靠临时手动调一次来验证。
   子任务复用的是同一条契约，不需要再改 dex。
   **旧 dex 兼容的超集检测（属于本条契约的一部分）**：旧 dex 会忽略过滤参数返回全集，
   所以某一批返回的条目里出现了请求集之外的包名时，调用方要把它们全部收下，
   并**停止发送后续批次**——图标已经齐了，再发只会让旧 dex 把全量渲染重跑 N 遍。

### A2 — stdout 加固

6. Java 侧在 JSON 前输出一行 sentinel，并在退出前显式 flush stdout 与 stderr。
7. Rust 侧从 stdout 中定位**最后一次** sentinel 并只解析其后的内容；
   找不到 sentinel 时回退为"trim 后整体解析"（旧 dex 兼容路径）。
8. 上述提取逻辑必须是纯函数并带 Rust 单元测试（前置噪声、多次 sentinel、
   无 sentinel、空 stdout、非法 JSON）。

### A3 — 消除并发互踩

9. 远程 dex 文件名带内容哈希；设备上已存在且大小一致时跳过 push。
10. `get_installed_apps` / 批量图标调用**全局串行化**（一把进程级锁），
    不得并发执行——注意是全局，不是 per-serial，理由见下方说明。
11. 哈希与文件名生成是纯函数并带单元测试；不新增第三方依赖。

> **为什么是全局锁而不是 per-serial（规划期修订）**：
> 一台设备可以**同时**通过 USB 和 WiFi 连接，`adb devices` 会列出两条不同 serial
> （`device.rs:128-136` 的去重只处理 mDNS 端口别名，不合并这两条），
> 但它们指向**同一台设备上的同一个** `/data/local/tmp/adb-gui-app-info-<hash>.dex`。
> per-serial 锁锁不住彼此：在其中一条加载途中切到另一条（`loadRequestRef` 只丢弃
> state、不取消已发出的 adb 调用），两次 `ls` 探测都发生在任何一次 push 完成之前，
> 于是双双 push，后者截断前者正在执行的 dex → dex verify 崩溃 → 非零退出，
> 而且这一轮**是推过 dex 的**，按 Requirement 15 判为 ROM 不兼容、不重试，
> 直接弹黄条。这正是本条要修的 bug 换个入口重现。
>
> 全局锁的代价**不是零**，要正视：阶段 2 的图标回填是后台调用，用户在它跑着的时候
> 切到另一台设备，新设备的阶段 1 就得在锁上排队。这正是 Requirement 3 把图标拆成
> 多批的原因之一——单次持锁从"渲染全部图标"缩短到"渲染 50 个图标"，
> 切设备最多等一批；前端切设备后也不再发送后续批次。
> 唯一无法消除的残留是**旧 dex**：它忽略过滤，第一批就是一次全量渲染，
> 这一批跑完之前锁放不开。重建 dex 后消失，接受并记录。
> 若将来真出现并发加载多设备的需求，再改成"远程路径按调用唯一化 + 用完清理"，
> 而不是退回 per-serial。

### A4 — 超时与重试

12. push 改为带超时的异步调用，不再无限期阻塞。
13. 元数据与图标两种模式使用各自的超时预算。图标那条是**单批**预算
    （Requirement 3 已经把图标拆成多批），不是整轮回填的总预算。
14. **push 这一步失败或超时**时自动重试一次（重试前强制重新 push）。
    `app_process` **超时不自动重试**：直接返回错误，同时置一个进程级的
    「下次强制重推 dex」标志，等用户点黄条上的「重试」时才走强制重推那条路。
    理由：`app_process` 超时绝大多数是"这台设备/这个 dex 就是慢"，自动重试只会让
    用户等两倍时间才看到黄条（旧 dex 路径尤其明显：45s 变 90s）；
    而"损坏 dex 把进程挂住"这种少数情况，靠这个标志在用户主动重试时兜住，
    不必让所有慢设备陪跑。这条标志是进程级的，被别的设备/别的调用消费掉也无害
    ——代价只是多推一次 5KB 的 dex。
15. **损坏 dex 的自愈**：`app_process` 非零退出时，看这一轮是否真的推过 dex——
    - 本轮因"大小命中"跳过了 push → **强制重推一次并重试**。
      设备上的文件可能已损坏，而 `ls` 的大小比对看不出来（进程被杀留下的半截文件、
      文件系统损坏、被别的东西覆写），跳过 push 就等于一直拿坏文件去跑，
      不自愈的话这台设备会永久停在黄条上。
    - 本轮是刚推上去的新文件，仍然非零退出 → 判定为 ROM 不兼容，
      **直接返回错误不再重试**（重试也没用，只会让用户多等一倍）。
    这要求"本轮是否真的执行了 push"对重试逻辑可见，不能是个内部细节。

### A5 — 失败原因可见 + 可重试

16. 降级黄条展示具体失败原因（可折叠，过长时截断展示但保留完整文本可复制）。
17. 黄条提供「重试」按钮，重新走完整的 `get_installed_apps` 路径。

### C9 — Context 引导多级回退

18. `createSystemContext()` 增加第二条轻量路径：`ActivityThread` 的无参构造 +
    `getSystemContext()`（跳过 `attach`/Instrumentation/Application.onCreate）。
19. `systemMain()` 保持**第一优先**，轻量路径作为其失败后的回退——本轮不调换顺序，
    确保对现在能成功的设备零回归。
20. 每一级失败都把完整 stack trace 写入 stderr，使 A5 的「详情」真正可用于诊断。

## Out of Scope（本轮明确不做）

- **B6 流式 NDJSON + Tauri event 增量渲染**：与 `appInfo.ts` 按应用名排序的策略冲突
  （流式到达顺序随机，每批重排会让虚拟列表跳动），且会引入"流到一半断了"的新状态机。
  其主要收益在 A1 完成后大部分消失，应在真机实测 A1 后的元数据耗时再决定。
- **B7 `dumpsys package` 降级解析**：输出格式随 Android 版本/厂商 ROM 变化，
  规划与执行环境都没有真机可验证 parser，风险不可控。
- **B8 图标本地缓存**：已拆为子任务 `09-03-app-info-cache`，本轮交付
  包名过滤契约（Requirement 5，本轮自己的阶段 2 就在用它），不做任何持久化。
  缓存的失效键、设备键、
  存储位置与文件形态都在子任务的规划产物里定义。
- 不改动 `list_packages` 的签名与行为（`useLogcatPackageResolution.ts` 仍依赖它）。
- 不改 `get_app_icon` 的签名与行为（作为最终兜底继续存在）。
- 不新增 Rust / npm 依赖。

## Acceptance Criteria

- [ ] `get_installed_apps` 不再触发设备端图标渲染；元数据与图标是两条独立的调用，
      图标调用失败时元数据仍完整可见（无黄条）。
- [ ] 同一 serial 上并发触发（连点刷新、切设备）不会互相破坏：远程 dex 带内容哈希、
      已存在则跳过 push、所有 helper 调用全局串行执行（一把进程级锁，不是 per-serial）。
- [ ] stdout 前置噪声不再导致整体失败；sentinel 提取与哈希/文件名生成有 Rust 单元测试
      覆盖，`cargo test` 通过。
- [ ] push 与 `app_process` 各自带超时；**push 这一步失败或超时**自动重试一次，
      **`app_process` 超时不自动重试**（改为置"下次强制重推"标志，由用户点「重试」触发）。
      即：一次失败最多让用户等一个超时预算，不是两个。
- [ ] 阶段 2 图标按包名分批（50/批）顺序回填，每批到达即显示；
      切换设备后不再发送后续批次，新设备的元数据最多等前一批跑完
      （旧 dex 的全量批除外，见兼容矩阵）。
- [ ] 损坏 dex 能自愈：设备上存在一个大小与本地一致但内容已损坏的 dex 时，
      第一次调用会跳过 push 并失败，但**必须自动强制重推并重试成功**，
      而不是停在黄条上。刚推完的新 dex 仍然非零退出才判 ROM 不兼容、不再重试。
      这条要能人工构造出来验（见 `implement.md` 验证计划）。
- [ ] 降级黄条显示具体失败原因并提供「重试」按钮；重试成功后黄条消失。
- [ ] `Main.java` 的 Context 引导有两级回退，两级失败的 stack trace 都进 stderr。
- [ ] 批量图标命令接受可选包名过滤：空过滤 → 全部图标；
      非空过滤 → 只渲染指定包名（超过上限时 Rust 侧再切）。
      **本轮的常规路径就是非空过滤**（前端按 50 分批），
      所以"过滤真的生效"由日常使用直接验证，不需要临时手动调一次。
      包名字符集校验有单元测试覆盖。
- [ ] 旧 dex 忽略过滤返回全集时，调用方收下这个超集、**停止后续批次**，
      图标仍然完整，且不会把全量渲染重复跑 N 遍。
- [ ] **向后兼容**：不重建 `app-info.dex` 的前提下，新 Rust 代码配仓库现有的旧 dex
      仍能正常返回应用列表（退化为慢速全量模式，不是硬失败）。这一条必须实际验证，
      不能只在代码里"看起来兼容"。
- [ ] `pnpm test` 与 `pnpm build` 通过；`cargo check` / `cargo clippy` / `cargo test`
      通过（若执行环境缺 Rust 工具链，必须在交付说明中显式声明"未验证"，不得跳过不提）。
- [ ] `implement.md` 的验证计划显式包含"需要用户在有 Android SDK 的机器上重建 dex +
      连真机验证"，且不在会话内声称已完成。

## Open Questions

- [x] 图标怎么给？→ **两段式 dex 调用 + 阶段 2 按包名分批**：先 `--no-icons`
      拿元数据立即渲染，再后台用 `--icons-only <pkg...>` 按 50 一批顺序回填。
      不选"沿用逐包懒加载"（成功路径的图标体验会退化成滚动才出现），
      也不选"分批按可见区批量取"（复杂度高于收益）。
      逐包懒加载保留为图标调用失败后的兜底。
      —— 规划期修订：原方案是"后台一次 `--icons-only` 全量回填"。改成分批的理由是
      全量那一次会把全局锁占住几十秒，用户此时切设备，新设备的元数据只能干等；
      分批把持锁时间切成几秒一段，切设备后不再发后续批次即可。
      顺带还有两个好处：图标渐进出现而不是整片突然刷上，
      以及包名过滤契约在本轮就有真实调用方（不必靠手工验证）。
- [x] `app_process` 超时要不要自动重试？→ **不重试**（见 Requirement 14）。
      自动重试会让用户等两倍时间才看到黄条，而超时基本不是重推能解决的问题；
      "损坏 dex 挂住进程"这种少数情况改由"下次强制重推"标志 + 用户点「重试」覆盖。
      注意这与 Requirement 15 的**非零退出**自愈是两条不同的路径，不要合并实现。
- [x] C9 的两条路径谁优先？→ **`systemMain()` 优先**，轻量路径作回退。
      纯增量、对现有可用设备零回归；等真机数据支持后再考虑对调。
- [x] 哈希算什么？→ 手写 FNV-1a 64（十来行，带单元测试），不引入 sha2/blake3 依赖。
- [x] 本轮要不要做流式？→ 不做，理由见 Out of Scope，留待 A1 真机实测后重评。
- [x] 包名过滤怎么传？→ **命令行参数 + 分批（上限 50 个/批）**。
      曾考虑 stdin（不受长度限制），但 `adb exec-out` 是否转发 stdin 到远端进程
      在规划环境里无法验证，把未验证的假设写进契约等于把风险推给真机。
      也不选"把过滤列表 push 成文件再传路径"——多一次 push 往返。
      50 个包名的 `sh -c` 串约 1.5KB，对 adb shell 协议和 Windows 命令行都远在安全区内；
      而缓存场景下过滤列表本就很短（典型 0–5 个变更包），分批几乎不会真的触发多批。

## Notes

- 技术方案细节见 `design.md`，执行步骤与验证计划见 `implement.md`。
- 本任务由其他模型执行；规划产物需自包含，不依赖本次对话上下文。
- 分支：`claude/app-info-read-stability-tj25vt`（从 `main` 开）。
  `09-03-device-transport-merge` 走自己的分支，两者无代码依赖、可并行。
- **与 `09-03-device-transport-merge` 的验证顺序**：那个任务会把同一台设备的
  USB / WiFi 两条 serial 在下拉里合并成一条，合并之后用户只能选到主传输那条。
  所以本任务验证计划里"在两条 serial 之间切换"的那一步，
  要么赶在它合入 `main` 之前做，要么按验证计划里写的方式临时构造。
  两个任务的结论不冲突：全局锁在合并之后依然必要（`adb devices` 仍返回两条）。
