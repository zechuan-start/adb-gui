# adb推送dex/jar批量获取应用信息与图标

## Goal

现有「应用管理」页只能显示裸包名（`pm list packages -3`），应用图标要逐包起一次
`adb exec-out cmd package icon <pkg> 0` 才能拿到，既没有可读的应用名称，加载也慢。
本任务新增一条命令：把预编译好的 dex/jar 推送到设备 `/data/local/tmp`，用
`app_process` 加载 Android Framework，在一次进程调用里遍历
`PackageManager`/`IPackageManager`，把所有应用的结构化信息（应用名、图标、版本、
大小等）打包成一份 JSON 从 stdout 输出，前端一次性渲染，替代现在「先出包名列表、
图标再逐个异步补」的两段式、多进程流程。

## Confirmed Facts（代码库已确认，无需用户复述）

- **技术路径已验证可行**：这套手法与 AOSP 自带的 `pm`/`cmd`/`dumpsys` 实现原理一致——
  它们本身就是 `app_process` 加载 framework classpath 跑起来的 Java 类
  （如 `/system/bin/pm` 实为 `app_process /system/bin com.android.commands.pm.Pm`）。
  dex 字节码不区分 CPU 架构，shell 权限即可执行，无需 root。
- **预编译资源分发已有先例**：`src-tauri/resources/{macos,linux,windows}/adb(.exe)` 已经是
  「预编译二进制 check-in 到仓库，随应用打包分发」的模式（见
  `src-tauri/resources/README.txt` 和 `scripts/fetch-platform-tools.sh`）。dex 文件同理
  应作为预编译产物提交，不在 Tauri/Rust 构建时现场编译（本项目构建链里也没有
  Java/Kotlin/Android SDK 依赖，硬塞进 `Cargo.toml`/`build.rs` 成本过高、且没必要）。
- **资源加载模式已有先例**：`src-tauri/src/adb.rs::find_adb()` 展示了
  `app.path().resource_dir()` 定位内嵌资源、必要时 `chmod 0o755` 的标准写法，新命令
  推送 dex 时应复用同一套资源定位逻辑。
- **push 机制已有先例**：`device_files.rs::upload_device_file` 已经用
  `run_adb_with_serial(&app, &serial, &["push", &local_path, &remote_path])` 推送文件，
  新命令可复用同样的 push 调用方式（目标目录用 `/data/local/tmp`）。
- **设备 SDK 版本已可获取**：`device_info.rs::get_device_info` 已经读取
  `ro.build.version.sdk`（`sdk_level` 字段），可用于兜底判断/日志，无需新增探测逻辑。
- **现有两个命令的调用方**：
  - `list_packages`（`packages.rs`，返回 `string[]` 裸包名，`pm list packages -3` 只
    含第三方应用）：被 `PackageManager.tsx` 和 `useLogcatPackageResolution.ts`
    （logcat 页面的包名下拉框）两处调用。
  - `get_app_icon`（`app_icon.rs`，逐包 `cmd package icon <pkg> 0`）：只被
    `PackageManager.tsx` 调用（虚拟列表可见区域，一次最多 5 个并发懒加载，
    结果存入模块级 `iconCache`）。
  - 结论：新命令必须**新增**而非替换这两个命令的签名——`useLogcatPackageResolution`
    仍需要保留 `list_packages`；`PackageManager.tsx` 改为优先调用新的批量命令，
    整体调用失败时回退到「`list_packages` + 逐包 `get_app_icon`」这条现有路径。
- **前端现状**：`PackageManager.tsx` 用 `@tanstack/react-virtual` 做虚拟列表，按包名
  字母排序，侧栏「应用详情」目前只有「类型：用户应用」「设备：序列号」两行，没有
  版本/大小/安装时间等信息展示位。

## Requirements（本轮 MVP，已与用户对齐）

1. 新增 Rust 命令（如 `get_installed_apps`），把预编译 dex 推送到设备并用
   `app_process` 执行，一次调用返回所有应用的 JSON 数组，每项包含：
   - `packageName`
   - `appName`（框架真实解析出的显示名，非 `labelRes` 原始资源 ID）
   - `versionName` / `versionCode`
   - `icon`（base64 PNG data URI，与现有 `get_app_icon` 输出格式保持一致）
   - `isSystemApp`
   - `firstInstallTime` / `lastUpdateTime`
   - `apkSize`
2. 前端 `PackageManager.tsx` 从「先出列表、图标异步逐个补」改为拿到完整结构化数据
   后一次性渲染（应用名、图标、版本等）。
3. 兜底：新方式在异常机型/低版本/厂商 ROM 上失败时，自动回退到现有
   `list_packages` + 逐包 `get_app_icon` 路径（此时无 appName/version/size，
   仍可用包名展示）。
4. 不改动 `list_packages` 现有签名/行为（`useLogcatPackageResolution` 依赖它）。

## Out of Scope（二期，仅设计里留扩展点）

- 组件/权限明细（Activity/Service/Receiver/Provider、运行时权限状态、批量
  grant/revoke）
- `UsageStatsManager` 应用使用时长统计
- `StorageStatsManager` 数据目录/缓存大小（区别于本轮的 APK 大小）
- 多用户/多 profile 场景

## Acceptance Criteria

- [ ] 新增 `scripts/build-app-info-dex/`（Java 源码 + 构建脚本），在装有 JDK +
      Android SDK（`d8`、`android.jar`）的环境下可一键生成
      `src-tauri/resources/app-info.dex`，并被 `tauri.conf.json` 现有的
      `resources/` 打包规则自动纳入分发（dex 字节码与主机 OS/设备 CPU 架构无关，
      不需要区分 macos/linux/windows 或 arm/x86 变体）。
- [ ] 新增 Rust 命令 `get_installed_apps(serial)`：推送 `app-info.dex` 到
      `/data/local/tmp/`，用 `app_process` 执行，解析 stdout JSON，返回
      `Vec<AppInfo>`（`packageName`/`appName`/`versionName`/`versionCode`/
      `icon`(96×96 base64 PNG data URI)/`firstInstallTime`/`lastUpdateTime`/
      `apkSize`）。
- [ ] 该命令内部任一环节失败（push 失败、`app_process` 非零退出、stdout 不是
      合法 JSON、超时）都视为整体失败，返回可区分的错误，不返回部分结果。
- [ ] `PackageManagerPanel` 优先调用 `get_installed_apps`；调用失败时自动回退到
      现有 `list_packages` + 逐包 `get_app_icon` 路径，仅展示包名 + 图标（无
      appName/version/size），并给出可感知的降级提示（如列表头部的轻提示，而非
      静默降级到看起来完全一样的界面）。
- [ ] 不改动 `list_packages`（`useLogcatPackageResolution.ts` 仍直接依赖它）。
- [ ] `implement.md` 中列出的验证步骤里显式包含"需要用户在有 Android SDK 的机器
      上跑构建脚本 + 连真机执行 `get_installed_apps` 验证"这一步，不在本次会话
      内声称已验证。

## Open Questions（已全部决策完毕）

- [x] 应用范围：**只展示第三方应用**，与现状 `pm list packages -3` 语义一致。
      本轮不加 `isSystemApp` 字段/筛选 UI，系统应用视图留到二期。
- [x] 图标输出尺寸：dex 内用 `Bitmap.createScaledBitmap` 统一缩到 **96×96** 再
      `compress` 成 PNG，兼顾清晰度与体积。
- [x] 验证方式：**按完整方案实现**（dex 源码 + 构建脚本 + Rust 命令 + 前端）。
      当前云端会话无 adb / 无连接设备 / 无 `ANDROID_HOME`/`android.jar`（只有裸
      `java`/`javac`），无法在本会话内编译出可运行的 dex，也无法连真机验证 Binder
      调用是否成功。构建脚本产出的 `.dex` 需要用户在有 Android SDK 的环境跑一次
      生成，再连真机验证；这个验证缺口会在 `design.md`/`implement.md` 的
      验证计划里显式标出，不假装"已验证"。
- [x] 覆盖的 Android 版本范围：**以较新设备为主**，dex 内实现按 Android 10
      （API 29）左右的 `ApplicationPackageManager`/`IPackageManager` 调用方式为
      基准；不额外为更老设备做多套反射兜底分支。旧设备/dex 方式失败时统一走
      「裸包名 + 逐包图标」的现有回退路径，不强求 dex 方式在老设备上也成功。

## Notes

- Keep `prd.md` focused on requirements, constraints, and acceptance criteria.
- 技术方案细节（Binder 调用类/方法、hidden API 处理、失败判定粒度等）记录在
  `design.md`；实现步骤记录在 `implement.md`。
