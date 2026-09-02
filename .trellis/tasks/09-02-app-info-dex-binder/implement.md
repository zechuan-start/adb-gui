# Implement Plan: adb push dex/jar 批量获取应用信息与图标

## 有序清单

1. **dex 源码骨架**（新目录 `scripts/build-app-info-dex/`）
   - `src/com/adbgui/appinfo/Main.java`：`main(String[] args)` 入口，实现
     `design.md` 里「Java (app_process 内)」的 5 步逻辑。
   - 不引入第三方 jar 依赖，只用 `android.jar` 提供的框架类
     （`android.app.ActivityThread`、`android.content.pm.*`、`android.graphics.*`、
     `android.util.Base64`、`org.json.*`）。

2. **构建脚本** `scripts/build-app-info-dex/build.sh`
   - 参考 `scripts/fetch-platform-tools.sh` 的风格（同目录、同注释密度）。
   - 依赖：`$ANDROID_HOME/platform/android-XX/android.jar`（XX 对应 API 29 或更高，
     脚本里显式报错提示缺哪个环境变量/文件，不静默失败）、`d8`（Android SDK
     build-tools 自带）。
   - 流程：`javac -bootclasspath android.jar -cp android.jar -d out/
     src/com/adbgui/appinfo/Main.java` → `d8 --output out/ out/**/*.class` →
     产物拷贝到 `src-tauri/resources/app-info.dex`。
   - 脚本本身不在 CI/Tauri 构建时自动跑（本项目构建链没有 JDK/Android SDK），
     是开发者手动执行一次、把生成的 `.dex` 连同源码一起 commit 的模式，和
     `fetch-platform-tools.sh` 之于 `adb` 二进制是同一模式。

3. **Rust 命令**（新文件 `src-tauri/src/commands/app_info.rs`，注册进
   `src-tauri/src/lib.rs` 的 `invoke_handler`，参考其它 command 模块的注册写法）
   - `resolve_app_info_dex_path(app: &AppHandle) -> Result<PathBuf, String>`：
     复用 `adb.rs::find_adb()` 里 `app.path().resource_dir()` 的写法，定位
     `resources/app-info.dex`。
   - `async fn get_installed_apps(app: AppHandle, serial: String) ->
     Result<Vec<AppInfo>, String>`：
     - push（同步 `run_adb_with_serial`，复用现有封装）
     - `tokio::process::Command` 起 `exec-out sh -c '...'`，
       `tokio::time::timeout(Duration::from_secs(15), ...)`
     - `serde_json::from_slice::<Vec<AppInfo>>(&stdout)`，失败即整体 `Err`
   - `AppInfo` struct（`design.md` 数据契约一节已给出字段），`serde(rename_all
     = "camelCase")`。

4. **前端 API 绑定**（`src/lib/tauri.ts`）
   - 新增 `AppInfo` 类型 + `getInstalledApps(serial): Promise<AppInfo[]>`，
     紧邻现有 `listPackages`/`getAppIcon` 声明处添加，不改动原有两个函数。

5. **前端页面改造**（`src/components/PackageManager.tsx`）
   - 状态从 `packages: string[]` 改为 `apps: AppInfo[]`；`loadPackages` 改名/
     改造为「先 try `getInstalledApps`，失败 catch 后回退到
     `listPackages` + 懒加载 `getAppIcon`（复用现状的虚拟列表懒加载 effect，
     把结果映射成兼容的 `AppInfo` 形状：`appName` 用 `packageName` 兜底、
     `versionName`/`apkSize` 等留空）」。
   - 排序改为按 `appName`；搜索同时匹配 `appName`/`packageName`。
   - 回退状态需要一个可见提示（如列表头新增一行 banner），不能让两种模式在
     UI 上无法区分。
   - 侧栏详情区加 `versionName`/`firstInstallTime`/`lastUpdateTime`/`apkSize`
     几行，复用现有 `dl` 结构。

6. **文档**：`src-tauri/resources/README.txt` 追加 `app-info.dex` 的说明段落
   （来源、刷新方式指向 `scripts/build-app-info-dex/build.sh`），和现有 adb
   段落并列，不新建文件。

## 验证计划

- 会话内可执行、必须过：
  - `cd src-tauri && cargo check`（新增/修改的 Rust 代码类型检查）
  - 前端 `tsc`/项目现有 lint 脚本（新增的 `AppInfo` 类型、组件改造）
  - 如果本项目有单元测试覆盖 `device_files.rs` 这类纯函数解析逻辑
    （`parse_directory_records` 那种），`get_installed_apps` 里 JSON 解析部分
    可以照样加一个「给定样例 JSON 字节 -> 正确解析出 `Vec<AppInfo>`」的 Rust
    单元测试，不依赖真实设备。
- **必须由用户在本地完成、本会话无法完成**（参见 `design.md`「验证缺口」）：
  1. 在有 `ANDROID_HOME` + `d8` 的机器上跑 `scripts/build-app-info-dex/build.sh`，
     确认能生成 `src-tauri/resources/app-info.dex` 且构建脚本报错信息清晰可用。
  2. 连一台真机（建议 Android 10+，覆盖"较新设备为主"的目标基准）跑一次
     `get_installed_apps`，核对：
     - 返回的应用名是不是真的本地化显示名（不是包名/资源 ID）
     - 图标能正常显示、96×96 缩放后清晰度可接受
     - 覆盖到的应用数量和 `pm list packages -3` 基本一致（验证 shell UID 包
       可见性豁免假设）
  3. 找一台老设备（如 Android 8/9）或深度定制 ROM 设备，确认「dex 方式失败 ->
     自动回退到裸包名+逐包图标」这条路径真的会触发、UI 提示正常，而不是直接
     报错卡住。

## 风险点 / 回滚

- 新增文件都是新增能力，不修改 `list_packages`/`get_app_icon` 的既有签名和行为，
  回滚只需要：`PackageManager.tsx` 改回只调用旧的两个命令（一次性的、局部的
  改动），`app_info.rs`/新增前端函数可以保留不用，不影响其它功能。
- 最容易踩坑、需要重点 review 的文件：
  - `scripts/build-app-info-dex/Main.java`（真机验证前无法确认 Binder 调用
    是否成立，是本任务风险最集中的地方）
  - `src-tauri/src/commands/app_info.rs` 里的超时/错误分类逻辑（决定回退路径
    是否会被正确触发）

## Follow-up（`task.py start` 前需要确认）

- [ ] 用户已阅读并认可 `prd.md`/`design.md`/本文件
- [ ] 明确本次会话交付的是「完整代码 + 未经真机验证」，后续真机验证由用户
      跟进（或另开一个验证/收尾任务记录验证结果）
