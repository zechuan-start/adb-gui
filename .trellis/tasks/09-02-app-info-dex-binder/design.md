# Design: adb push dex/jar 批量获取应用信息与图标

## 架构总览

```
构建期（开发者机器，需要 JDK + Android SDK）
  scripts/build-app-info-dex/Main.java  --javac + d8-->  src-tauri/resources/app-info.dex
                                                          (随 tauri.conf.json 现有
                                                           "resources/": "" 规则打包)

运行期（用户机器 -> 设备）
  Rust: get_installed_apps(serial)
    1. resolve_app_info_dex_path()      -- 复用 adb.rs::find_adb() 的资源定位写法
    2. adb push app-info.dex /data/local/tmp/app-info.dex
    3. adb exec-out sh -c 'CLASSPATH=/data/local/tmp/app-info.dex \
         app_process /data/local/tmp com.adbgui.appinfo.Main'
       （15s 超时，tokio::time::timeout，异步执行，避免卡死 UI）
    4. stdout 按 UTF-8 JSON 数组解析 -> Vec<AppInfo>
       任一步失败 -> Err，前端捕获后回退到 list_packages + 逐包 get_app_icon

  Java (app_process 内，进程 uid=shell):
    1. ActivityThread.systemMain().getSystemContext() 拿到一个绑定了真实
       IPackageManager Binder 的 Context（无需 Activity/Application）
    2. context.getPackageManager().getInstalledApplications(0)
       （shell/root UID 不受 Android 11+ 包可见性过滤限制，见"风险"一节）
    3. 过滤：(flags & ApplicationInfo.FLAG_SYSTEM) == 0，只保留第三方应用
       （维持 pm list packages -3 的语义）
    4. 每个应用单独 try/catch，取 label/icon/version/size，任一字段失败只降级
       该字段，不影响其它应用/不中断整体输出
    5. org.json.JSONArray 拼装（框架自带，无需额外依赖），System.out.print()
```

## 数据契约

dex stdout（UTF-8，无额外日志混入——所有诊断信息走 stderr）：

```json
[
  {
    "packageName": "com.example.app",
    "appName": "示例应用",
    "versionName": "1.2.3",
    "versionCode": 45,
    "icon": "data:image/png;base64,....",
    "firstInstallTime": 1690000000000,
    "lastUpdateTime": 1700000000000,
    "apkSize": 12345678
  }
]
```

- `icon`：`getApplicationIcon()` 返回的 `Drawable` 先画到
  `Bitmap.createBitmap(intrinsicW, intrinsicH, ARGB_8888)`（兼容
  `AdaptiveIconDrawable` 等没有直接 `getBitmap()` 的类型），再
  `Bitmap.createScaledBitmap(..., 96, 96, true)`，`compress(PNG, 100, ...)`，
  `android.util.Base64.encodeToString(..., NO_WRAP)` 编码，格式与现有
  `get_app_icon` 输出的 `data:image/png;base64,...` 保持一致，前端 `<img src>`
  可以直接复用同一套渲染逻辑。取失败时该应用的 `icon` 输出为空字符串
  （前端按现有 `AppIcon` 组件的"无 src 时显示占位符"逻辑处理，无需新状态）。
- `versionCode`：用 `PackageInfo.getLongVersionCode()`（API 28+，在"较新设备为主"
  的前提下可直接用，不再兼容 API 28 以下的 `versionCode` int 字段）。
- `apkSize`：`new File(appInfo.sourceDir).length()`，即 base APK 大小；不统计
  split APK/数据目录（那是 `StorageStatsManager` 的范畴，属于二期）。
- Rust 侧对应结构体：

```rust
#[derive(Serialize, Deserialize, Clone)]
pub struct AppInfo {
    pub package_name: String,
    pub app_name: String,
    pub version_name: String,
    pub version_code: i64,
    pub icon: String,
    pub first_install_time: i64,
    pub last_update_time: i64,
    pub apk_size: i64,
}
```

用 `serde(rename_all = "camelCase")` 直接对应 JSON 字段名，避免手写字段映射。

## 失败判定与回退（整体命令粒度）

`get_installed_apps` 在以下任一情况下返回 `Err`，不返回部分结果：

- `adb push` 非零退出
- `app_process` 调用超时（15s）或非零退出
- stdout 为空，或不是合法 JSON 数组（`serde_json::from_slice` 失败）

前端 `PackageManagerPanel` 捕获到 `Err` 后：

1. 自动回退调用现有 `list_packages` + 逐包 `get_app_icon`（代码路径完全复用，
   不用新写）
2. 在列表顶部给一条不打断操作的降级提示（如"应用名称/版本获取失败，已显示
   精简信息"），而不是静默展示一个和成功状态看起来一样的列表——用户应该能
   感知到当前是降级状态。

注意区分两个粒度：**整体命令失败**（上面几条，触发回退）vs **dex 内部单个应用
的字段取值失败**（如某个应用图标转换抛异常）——后者只影响该应用某个字段，
由 Java 侧 try/catch 兜底，不触发整体回退，因为那样代价太大（一个应用图标
坏了，其它几百个应用的名称信息也跟着不展示，得不偿失）。

## 兼容性与风险

- **目标基准**：Android 10 / API 29 前后的 `ApplicationPackageManager` /
  `IPackageManager` 调用方式，`getLongVersionCode()`（API 28+）等 API 直接用，
  不做多分支反射兼容更老设备。dex 方式在老设备/深度定制 ROM 上失败是被接受的
  已知结果，靠整体回退兜底，不追加兼容代码。
- **包可见性过滤（Android 11+ `QUERY_ALL_PACKAGES`）**：AOSP 对 `shell`/`root`
  UID 有明确豁免，不受调用方包可见性声明限制，理论上
  `getInstalledApplications()` 在 shell 进程里仍能看到全部第三方应用。这是本设计
  能不声明 `<queries>`/权限就拿到完整列表的前提，**未在真机验证**，见下方
  「验证缺口」。
- **隐藏/内部 API 访问**：`ActivityThread`、`IPackageManager` 等属于框架内部类；
  `app_process` 启动的进程没有关联的 `ApplicationInfo`/安装包，运行时不会按
  「已安装 app 的 targetSdk」施加 hidden API 黑名单限制（这也是 `pm`/`cmd`/
  `dumpsys` 自身能正常访问这些类的原因）。理论成立，**未在真机验证**。
- **CLASSPATH 环境变量透传**：通过 `adb exec-out sh -c 'CLASSPATH=... app_process ...'`
  设置 classpath 是社区常见做法（Shizuku 的 `rish` 等工具采用同样机制），但不同
  厂商 ROM 对 `app_process`/环境变量处理可能有细微差异，**未在真机验证**。

## 验证缺口（必须显式承认，不能假装已验证）

当前云端会话：无 `adb`、无连接的 Android 设备、无 `ANDROID_HOME`/`android.jar`
（只有裸 `java`/`javac`）。因此本次交付包含：

- 完整的 Java 源码 + 构建脚本 + Rust 命令 + 前端改造（代码可读、编译期类型检查
  可过 `cargo check`/`tsc`）
- **不包含**：dex 的实际编译产物验证、真机上 Binder 调用是否成功、
  「兼容性与风险」一节列出的三条假设是否成立

`implement.md` 的验证步骤会把「在有 Android SDK 的机器上跑构建脚本生成
`.dex`，连真机跑一次 `get_installed_apps` 确认输出符合数据契约」列为必须由用户
本地完成的步骤，而不是本次会话自称已完成。

## 性能与超时

- 复用 `logcat.rs`/`screen_record.rs` 里已经用过的 `tokio::time::timeout` 模式
  （目前项目里 `run_adb_with_serial` 系列是同步阻塞调用，`get_installed_apps`
  改成 `async fn` + `tokio::process::Command`，是本次唯一引入的新执行模式，
  其余 adb 调用维持原有同步写法，不做无关重构）。
- 不做「先查 hash 再决定要不要重新 push」之类的优化，每次调用都重新 push dex——
  dex 文件很小（预期几十 KB 量级），push 耗时可忽略，没必要为此增加缓存逻辑
  和对应的失效场景。

## 前端改造

- `PackageManagerPanel` 的 `packages: string[]` 状态改造为 `AppInfo[]`（回退模式
  下用「只有 packageName + icon，其余字段留空」的兼容对象填充，页面渲染逻辑
  不用为两种模式各写一套）。
- 列表排序从按包名字母序改为按 `appName` 排序（更符合直觉），搜索框同时匹配
  `appName` 和 `packageName`。
- 侧栏「应用详情」新增版本号、安装/更新时间、APK 大小几行，复用现有
  `dl`/`dt`/`dd` 结构，不引入新组件。
- 图标渲染逻辑（`AppIcon` 组件）不变，因为新旧两种数据源的 `icon` 字段格式
  完全一致（`data:image/png;base64,...`）。
- 不改动 `useLogcatPackageResolution.ts`，它继续用 `list_packages`。
