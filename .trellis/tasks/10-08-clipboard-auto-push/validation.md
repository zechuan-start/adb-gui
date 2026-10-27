# 剪贴板自动推送验收

> 最新补验：见文末 **2026-10-26 Windows release 安装包与锁屏 UI 补验** 和 **同日晚间 USB 物理拔插补验**。此前各节的未覆盖范围是当时状态；本轮电脑原剪贴板恢复失败，不能沿用 2026-10-25 的双端恢复结论。

## 2026-10-21 本地验收基线

- 源码: `main`, `dd4bee4`, 测试前工作区干净.
- 主机: macOS 27.0.1 (26A434), arm64.
- 设备: Redmi K70 / Xiaomi 23113RKC6C, Android 16 / API 36, USB, serial `275179f2`.
- 应用: 0.1.11 release 测试包, `pnpm tauri build --bundles app -c '{"bundle":{"createUpdaterArtifacts":false}}'`, 构建缓存置于 `/Users/qi/.cache/adb-gui-acceptance-target`.
- 安装到 `/Applications/ADB GUI.app`, 本地 ad-hoc 签名后 `codesign --verify --deep --strict` 通过, 通过 LaunchServices `open` 启动.
- 应用可执行文件 SHA-256: `80da99a59a62f78cf9832ab690800c09074b823d79fa65b3ae668742e100c03f`.
- 原应用, WebKit 设置, 电脑完整剪贴板以及手机完整 ClipData 已备份. 手机原剪贴板为空. 所有样例为人工测试文本, 不记录原剪贴板正文.

## 已验证结果

| 场景 | 结果与证据 |
| --- | --- |
| 默认关闭 | 原生模块开关为 off. 电脑复制测试文本后, 独立 DEX get 确认手机 sentinel 保持不变. |
| 开启基线 | 开启后显示正在监听; 开启之前的电脑内容未推送. |
| 新复制文本 | 中文及 emoji 原样到达手机; 从 pbcopy 到独立 DEX get 比对通过为 723 ms, 另一次为 666 ms. |
| 去重 | 成功后单独改写手机为 sentinel, 再复制同一电脑文本; 手机保留 sentinel, 模块成功时间仍为 10:14:37. |
| 快速复制 | 间隔 40 ms 连续复制 5 段, 手机最终为第 5 段. |
| 超限 | 262145 字节时原生模块显示超过 256 KiB, 未推送, 手机仍为上一成功样例. |
| 非文本 | 电脑剪贴板只含图片时原生模块显示不是文本, 未推送, 手机仍为上一成功样例. |
| 自动反馈 | 上述自动成功与跳过均只有模块状态行更新, 无 toast. |
| 前端回归 | `pnpm test`: 61 文件, 637 测试通过. TypeScript / Vite production build 通过. |
| macOS 后端回归 | release 测试 runner 的 182 项测试通过, 0.87 秒, 执行设 60 秒硬超时; `cargo fmt --check` 通过. |
| 最小化 | 10:15:40 最小化, 10:20:59 在 TextEdit 全选并实际复制新样例, 未切回 ADB GUI, 独立 DEX get 比对成功. |
| 完全遮挡 | TextEdit 全屏遮挡 ADB GUI 后实际复制另一段文本, 手机回读一致. |
| 设置同步和重置 | 原生设置通用行与模块共享开关; 通用分区重置及带确认框的全局重置均恢复关闭. |
| 重启恢复 | 正常退出再通过 LaunchServices 启动, 开关保持开启并恢复监听, 新样例 692 ms 到达手机. |
| A -> B -> A | 第二目标为只读模式的 Pixel_10 模拟器, Android 17 / API 37 / emulator-5554. 切换时目标 sentinel 保留; 显式再复制相同文本后只写入新目标, 回读同时证明旧手机不变. 切回真机后同一文本能再推送, 593 / 1027 ms. |
| 手动双向 | 自动关闭时, 原生按钮电脑 -> 手机及手机 -> 电脑均完成中文和 emoji 传输, 分别用独立 DEX get 和 pbpaste 比对. |
| 重启基线 | 退出应用后先设置手机 sentinel 和另一份电脑文本, 重启恢复监听后手机仍保留 sentinel, 未补推旧内容. |
| USB 断开与重连 | 用户物理拔掉 USB 后, adb 设备列表为空, 模块显示等待设备在线. 离线期间复制新样例, 插回解锁后手机仍保留断线前 sentinel, 不补推离线复制; 新复制 734 ms 成功. |
| 锁屏 | `KEYCODE_SLEEP` 后显示未推送: 手机已锁屏, 无 toast, 独立 DEX 也返回 locked. 用户手动解锁后手机仍为上次成功内容, 失败内容未自动补发; 再复制新文本 714 ms 成功. 未修改锁屏配置或绕过解锁. |

## macOS 隐私预览: 授权交互未完成

- 测试前 `EnablePasteboardPrivacyDeveloperPreview` 不存在. 临时设为 true, 重启打包应用, 自动监听恢复, 复制新文本后 4 秒内未观察到推送.
- 原生 UI 工具读取和截图均超时. `sample` 显示主线程进入 `CFPasteboardShowApprovalDialogIfNecessaryForPasteboard` / `NSPasteboardInstallPrevalidationCallbacks` 的系统授权流程. 用户反馈没有看到可用提示或未允许. 未获得完成授权的证据, 不将此项记为通过, 不推断已接受或已拒绝.
- 删除测试用 defaults key 恢复原配置. 回收受阻应用 PID 2265 和其 adb 子进程 2293 / 2294, 逐 PID 确认消失; 重启后原生 UI 恢复响应, 常规环境再次推送成功, 807 ms.
- 保留为兼容性/人工授权验证待办. 不修改 TCC, 不绕过剪贴板权限, 不新增自动重试或业务降级.

## 2026-10-22 隐私预览复测: 系统预览不显示授权界面

基线: 同一源码 `dd4bee4` 重新构建 release 包, 可执行文件 SHA-256 与 10-21 一致 (`80da99a5...c03f`). 旧包移入废纸篓后安装到 `/Applications`, ad-hoc 签名, 标识 `com.qi.adb-gui`, `codesign --verify --deep --strict` 通过. macOS 27.0.1 (26A434), Redmi K70 USB.

ADB GUI 复现:

- 开启 `EnablePasteboardPrivacyDeveloperPreview` 后启动, 打开自动推送, 模块显示正在监听. 电脑剪贴板变化后手机未收到内容, 2 分钟后仍未变化.
- `sample` 证据: 读取线程停在 `read_host_text` -> arboard `stringForType` -> `CFPasteboardCopyData` -> `_onqueue_CFPasteboardShowApprovalDialogIfNecessaryForPasteboard` -> `dispatch_block_wait`; 主线程停在 `CFPasteboardMainRunLoopPerformBlockSync` -> `NSPasteboardInstallPrevalidationCallbacks` -> `HIRunLoopSemaphore wait` 的嵌套 runloop. 主线程不再处理普通事件, 所以 UI 和辅助功能查询无响应.
- `CGWindowListCopyWindowInfo` 列出全系统窗口: 应用只有主窗口, UserNotificationCenter / CoreServicesUIAgent 等没有新窗口, 屏幕上没有授权提示. 统一日志只有 `data requested for type public.utf8-plain-text`, pboard 无对应审批记录. 通过 `open` 激活应用后同样没有提示.

最小 AppKit 探针对照 (独立 bundle id, 只用 `NSPasteboard`, 每 500 ms 查 changeCount):

| 组合 | 结果 |
| --- | --- |
| 后台线程读取, 应用在前台 | 调用 `accessBehavior` 时主线程即停在同一个 `HIRunLoopSemaphore wait`, 没有授权窗口 |
| 主线程直接 `string(forType:)`, 应用在前台, ad-hoc 签名 | 停在 read start, 没有授权窗口 |
| 同上, Apple Development 签名 (有 Team ID) | 停在 read start, 没有授权窗口 |

- 系统设置 > 隐私与安全性中没有"粘贴"或"从其他 App 粘贴"面板, 27.0.1 只有开发者预览开关这一条路径.

结论:

- 本机 macOS 27.0.1 的剪贴板隐私开发者预览本身不显示授权界面: 任何程序化读取都会无限等待, 与读取线程, 前台状态和签名方式无关. 这不是 ADB GUI 的缺陷, 本机也无法完成"授权后复测", 此项不记为通过.
- 遗留风险: 如果以后系统正式启用读取授权, AppKit 会把授权同步投递到主线程等待用户回答. 自动推送在后台线程读取, 授权期间主线程同样会被占用; 届时需要在正式版本上重新验证授权提示, 允许和拒绝三种路径, 以及 `accessBehavior` 在 always allow / always deny 下的表现.
- 恢复默认配置后, 新安装的包正常推送: 中文和 emoji 916 ms 到达手机 (含回读轮询开销), 独立 DEX 回读一致. 空文本被判为"最近一次复制不是文本, 未推送", 行为正确.

恢复与清理:

- 删除 `com.qi.adb-gui` 的预览 key, 以及两个探针 domain; 探针应用已从 LaunchServices 注销, 进程逐个确认退出.
- 被卡住的实例 PID 5804 用 SIGTERM 回收; 它留下的 adb 子进程 5850 / 5851 单独回收. 回归实例正常退出, 子进程 6661 / 6662 / 6858 均已消失.
- WebKit 数据从测试前备份恢复, 与备份 `diff -r` 一致 (测试期间 localStorage 写入的开关已还原). 电脑剪贴板 4 个类型逐字节恢复.
- 手机上的探针 DEX 已删除. 手机剪贴板原本为空, 现在保留测试文本 `privacy-preview-regression-02 中文 ✅`; 设备端没有可用的清空命令, 辅助程序也只支持 get / set.
- `/Applications/ADB GUI.app` 为本次安装的 0.1.11 测试包, 应用已退出; 旧包在废纸篓中, 未清空. 备份保存在 `/Users/qi/.cache/adb-gui/backups/20261022-privacy-preview`.

## 任务进度与未覆盖范围

- 常规 macOS + USB 真机路径完成, 所有 PRD 常规验收项已有原生或自动化证据.
- 保留 `in_progress`: 隐私预览下尚无完成系统授权的证据, 后续在可用的系统提示/许可环境中复测. 不宣称该实验设置下可正常推送.
- 2026-10-22 复测确认: 27.0.1 的系统预览本身不显示授权界面, 最小 AppKit 探针同样卡住, 本机无法完成该项. 见上方复测小节.
- Windows/Linux 原生运行, 无线连接和第二台物理手机未覆盖; 设备切换使用 Android 17 模拟器补验. Linux 禁用态由既有自动化覆盖.

## 恢复与清理

- 自动推送先关闭, 再正常退出最终应用实例. 最终应用 PID 2496 与采集子进程 3049 已回收.
- 原 WebKit 数据恢复后, 所有 localStorage 的键和值与测试前备份逐字节相等, 包含原设置和 UI 布局.
- 电脑完整 pasteboard 的类型与字节恢复后再次比对相同; 手机完整 ClipData 恢复为原来的空状态, 独立 DEX get 返回 no_text.
- 手机 `stay_on_while_plugged_in=0`, `show_touches=0`, `screen_off_timeout=300000` 均核对为原值. 隐私预览 key 恢复为不存在.
- 模拟器及 crashpad/netsimd 辅助进程全部退出. 只删除本轮创建的两个设备端 DEX, 临时构建缓存, 录屏, 探针, 备份和测试文稿; 不清理用户既有缓存或系统 adb server.
- `/Applications/ADB GUI.app` 保留本轮验收的 0.1.11 测试版, 签名校验通过, 应用处于退出状态.

## 检查命令说明

- 非交互 shell 没有设置 `LANG` 时, `pbcopy` 遇到非 ASCII 文本会写入空串. 用命令行准备中文样例前先设 `LANG=en_US.UTF-8`, 否则会被应用正确判为"不是文本".
- Rust 先用 `cargo test --release --no-run` 编译. 随后的 cargo 调用重新编译应用并触及 60 秒上限, 测试尚未开始; 改为直接执行已编译的 `release/deps/adb_gui_lib-*` runner, 仍设置 60 秒上限, 182 项全部通过. 不把编译超时记成业务测试失败或测试通过.

## 2026-10-25 Windows + Android 17 模拟器补验

- 源码 `main@9465993`, 0.1.11 debug 原生应用, `cargo build --manifest-path src-tauri/Cargo.toml --bin adb-gui` 成功; 前端由本机 Vite 提供, IPC 使用真实 Rust 后端, 未注入 mock.
- 恢复本机缺失的 Android SDK 运行时后启动现有 `ADB_GUI_API_37`, serial `emulator-5554`. Emulator 37.2.12 / build 16428233, Google APIs Android 17 / API 37 / x86_64 / system image r08. 运行时和系统镜像均核对官方仓库 SHA-1. 使用 `-read-only -no-snapshot -no-window -no-audio`, 不保存本轮设备数据; 无模拟器 GUI 的主机剪贴板同步参与测试.
- 通用设置开启自动推送后, 模块显示正在监听; 复制人工中文/emoji 样例后, 模块显示 `未推送: 此设备不支持当前剪贴板助手`. 独立运行仓库内置 DEX 的 get / set 同样返回 `unsupported`, 因此本机文本传输不记为通过, 去重/成功延时/双向手动传输均未获得通过证据.
- 不修改产品 DEX 的独立反射探针确认初始化失败点: `ClipboardAccess.<init>` -> `KeyguardManager` -> `WindowManagerGlobal.getWindowManagerService` -> `ApplicationSharedMemory.getInstance`, 抛出 `IllegalStateException: ApplicationSharedMemory not initialized`. 定位到 `scripts/build-app-info-dex/src/com/adbgui/clipboard/ClipboardAccess.java` 获取 KeyguardManager 的路径. 这是当前镜像上的兼容性缺陷, 与 macOS 隐私预览问题分开记录; 不推广到全部 Android 17 设备.
- 原生 watcher 边界通过: 262145 字节文本显示 `最近一次复制超过 256 KiB, 未推送`; 仅含 1x1 DIB 图片时显示 `最近一次复制不是文本, 未推送`. 这些结果不证明设备端文本写入成功.
- 测试后关闭自动推送. 电脑剪贴板 6 个可复制的数据格式按原字节恢复并比对相同 (OLE 所有者内部格式不复用); 备份正文未输出到日志. 两个本轮探针 DEX 已删除. 测试使用独立 WebView2 数据目录, 不改用户已安装版本的设置; 本轮没有修改产品代码或 DEX.

### 本次 Windows 回归汇总与待处理问题

> 本小节是首轮修复前的历史结果。最新修复和真机结果见文末「Windows 无线真机修复复验」。

以下为本次会话前序已执行的测试结果, 进度核对时未重跑测试. 与上方历史 macOS 结果分开计数.

| 检查 | 本次结果 |
| --- | --- |
| 前端全量测试 | 637 项中 636 通过, 1 失败. |
| 新功能前端子集 | 92 项通过, 属于针对性复测, 不与全量结果相加. |
| Rust 测试 | 169 项通过. |
| Rust 格式与 clippy | 通过. |
| TypeScript / Vite production build | 通过. |
| 浏览器冒烟 | 31 个场景通过; 拖拽冒烟 9 个场景通过. 使用临时 Windows 启动适配, 临时仓库脚本已移除. |

- 前端失败定位于 `src/i18n/catalog.test.ts:38`: `relative()` 在 Windows 返回反斜杠路径, 后续中文目录排除正则与英文目录例外比较使用正斜杠, 导致误报. 这是测试的跨平台路径缺陷, 尚未修复.
- 产品缺陷: 当前 Android 17 r08 镜像上剪贴板助手初始化失败, 自动推送和手动 get / set 均受阻. 已定位, 尚未修复, 不记为验收通过.
- 任务继续保持 `in_progress`: 保留历史 macOS 隐私预览未完成项, 新增上述 Android 镜像兼容性问题. 历史成功验收不代表所有平台通过.
- 本轮没有产品代码或 DEX 修复, 没有提交或推送本地测试记录.

### 本次测试收尾

- 测试结束时曾遗漏进程回收, 用户指出后补做清理: ADB GUI 正常退出, scrcpy / Logcat / WebView2 子进程退出, 只读模拟器及 qemu / crashpad / netsimd 退出, Vite 停止; 确认无其他设备与客户端后停止本轮启动的 ADB server.
- 最终进程检查无上述测试进程残留; 1420 / 5037 / 5199 / 5554 / 5555 无监听. 剪贴板备份文件已删除.
- `C:\Users\Gin\AppData\Local\Temp\adb-gui-qa-20261025` 删除被自动审批拒绝 (`blocked by policy`), 该临时目录仍保留, 不宣称文件清理完成.
- 为运行既有 AVD 补齐的 Android SDK emulator / API 37 系统镜像 / platform-tools 保留. 原 AVD 未删除, 本轮以只读且不保存快照的方式运行. scrcpy 仅临时解压, 未全局安装; PATH / WebView2 目录覆盖仅作用于测试进程.

## 2026-10-25 Windows 无线真机修复复验

- 基线 `9465993` / 0.1.11, 修复分支 `codex/fix-clipboard-android17`; 本节测试时修改尚未提交或推送; 后续提交见文末交付记录.
- 真机 Redmi K70 / Xiaomi 23113RKC6C, Android 16 / API 36, 无线 ADB `192.168.8.10:40213`; 同时补验 Android 17 / API 37 r08 只读模拟器.
- 原生 debug 应用通过实际 Rust IPC 测试; 剪贴板验收使用 Vite 开发前端, 最后投屏和内存对照使用 `pnpm build` 的生产前端由本机静态服务提供. 后者仍是 debug Rust 外壳, 不称为 Windows release 安装包验收.

### 实际修复

1. `ClipboardAccess` 不再创建 `KeyguardManager`, 改由 `DeviceLockState` 调用系统 window/trust Binder 接口查询设备锁和键盘锁. 兼容新旧 `isDeviceLocked` 签名, 只在方法不存在时回退; 权限/服务异常仍拒绝访问. 未绕过锁屏和主用户检查, 未构造假共享内存. 已重建并替换共用 `app-info.dex` (16,592 字节).
2. `catalog.test.ts` 把 `relative()` 的平台分隔符规范化为 `/`, 修复 Windows 将中文目录及英文目录唯一例外误报的问题. 没有放宽国际化检查规则.

### 原生及设备结果

| 场景 | 结果 |
| --- | --- |
| 自动推送关闭 / 开启基线 | 关闭时手机不变; 开启不会推送电脑已有文本. |
| Android 16 无线自动推送 | 中文、emoji、多行文本回读相同, 749 ms (含独立回读开销). |
| 去重 / 连续复制 | 同文再次复制不覆盖手机哨兵; 快速复制五次后最后一段到达, 986 ms. |
| 超限 / 非文本 | 262145 字节和 DIB 图片被拒绝, 目标不变. |
| 关闭开关 | 后续复制不推送. |
| 双向手动按钮 | 发送到手机及复制到电脑都通过实际字节/文本核对. |
| 锁屏 get / set | 用户锁屏后两者均返回 `locked`; 用户解锁后旧测试文本仍在, 被拒绝文本未写入. |
| 锁屏 UI 状态 | 本轮未完成原生 watcher 的锁屏文案验证, 因开发前端崩溃; 不把 helper 结果当作 UI 验收. |
| Android 17 模拟器 | 修复后 get/set 回读通过; 原生自动推送 1896 ms, 中文/emoji/CRLF/字面协议标记保持. |
| 切换设备 | 选中模拟器后新文本只到模拟器, 原真机测试内容保持. |
| 共用 DEX app-info | API 37 的 `--no-icons` 入口仍返回有效数组 (该模拟器零第三方应用). |
| 无线投屏 | 真实画面、键盘展开/收起通知栏和应用退出回收通过, 详见投屏任务最新记录. |

### 自动检查

- 前端全量 61 文件 / 637 项通过; TypeScript / Vite production build 通过 (现有 chunk size 警告仍在).
- Rust 169 项通过, `cargo fmt --check`、`cargo clippy --all-targets -- -D warnings` 和 debug 原生构建通过. 先编译测试 runner, 再使用 60 秒超时执行.
- `bash scripts/build-app-info-dex/test.sh` 通过: 新旧签名、解锁、设备锁、键盘锁、权限失败、缺失/故障服务、空返回值和禁止运行时错误回退. Java 及共用 DEX 构建通过, 实际 Android 16/17 运行已验证.
- 首轮浏览器 31+9 场景保留为历史证据, 本轮未重复运行或与单测数量相加.

### 新发现的开发模式内存问题（未修复）

> 此为前序诊断时的状态; 后续开发环境复现和修复见文末, 不再作为当前未修复结论.

- Windows WebView2 155.0.4283.62 + Vite 开发前端 + 真机 Logcat 可快速增长并显示 `Out of Memory`. 新启动且不调用 UI 自动化的实例, 渲染进程在 5–40 秒由 275 MB 增至 1020 MB; 较早实例超过 8 GB. 及时正常关闭测试实例避免耗尽主机内存.
- 真机当时约 350 行日志/秒. 浏览器模拟 30 秒 / 308000 行, 每 5 秒强制 GC 后 JS heap 约 25 MB、保留 10000 行, 此测试不能替代原生内存行为.
- 对照实验保留全部原生事件但不消费 batch, 40 秒内约 162–189 MB; 恢复消费但不渲染 LogcatList, 约 168–214 MB. 因此尚无证据需要迁移原生事件传输. 两处临时诊断修改均已撤销, 不包含在最终改动中.
- 相同 Rust 外壳及设备使用生产前端, 连续运行约 12 分钟并投屏, 渲染内存由约 179 MB 上升后稳定在约 287–294 MB, 未崩溃. 这只限定当前复现范围, 未证明根因或长时间运行绝对无泄漏; 开发模式缺陷保持待处理.
- 任务继续 `in_progress`: 还保留 macOS 隐私预览授权未完成项. 本次未覆盖 Linux 原生、真机物理重连、全部 Android 版本或全部投屏选项.

### 本轮恢复与清理

- 自动推送关闭; 最终应用 PID 9372 正常退出, scrcpy 17048、Logcat 7804、WebView2 renderer 14800 及测试 WebView 子进程均消失. 早先内存诊断实例也均回收.
- 手机原完整 ClipData 为 null: 内存中的 guardian 恢复并确认 null, 退出码 0; 独立 helper 回读为 `no_text`. 电脑原 4 种可复制数据格式逐字节恢复并比对相同; 原内容未写入日志或本轮备份文件.
- 删除本轮三个设备端测试 DEX; 保留应用正常部署的哈希 DEX 缓存. 模拟器及辅助进程已退出. Vite、生产前端静态服务和本轮 ADB server 均停止, 最终 1420/5037/5199/5554/5555 无监听.
- 保留用户原 AVD 和前序补齐的 SDK. 临时目录此前被自动审批拒绝删除, 仍保留; 没有改用另一种方式绕过拒绝. 不宣称临时文件已全部删除.

## 2026-10-25 开发环境 Logcat 内存问题复现与修复

### 根因与修复

- 按用户要求继续用 Vite 开发前端、React 19.2.7 + StrictMode、Windows WebView2 155.0.4283.62 和同一 Redmi K70 无线真机复测. 保留此前修改; 本节测试时尚无提交/推送, 后续提交见文末交付记录.
- 新一轮未修改代码的基线再次增长: renderer PID 13932 在 10–40 秒由 294 MB 增至 612 MB. 诊断发现 JS heap 大致 40–86 MB、DOM 约 1800–1900 节点、可视行约 44–55、数据缓冲上限 10000, 这些均不能解释进程快速增长.
- 精确定位 `LogcatVirtualRowsView` 的 React 开发性能记录: 每次传入新 `renderItems` 数组, React `logComponentRender` / `addObjectDiffToProperties` 递归展开整份 FIFO 的 props 差异, 保留到 `PerformanceMeasure.detail`. 单条约 582–590 KB, 真机每 5 秒约 25–30 MB 序列化详情. 原生事件接收正常, 不需要更换 Tauri 传输协议.
- `LogcatList.tsx` 改为传 `itemCount` 和捕获同一不可变 projection 的 `getRenderItem` 回调. 依赖仍包含 `renderItems`, 满缓冲追加时 callback 身份变化, `memo`/虚拟器键正常失效; 键和行读取使用同一 accessor, 筛选、折叠、锚点语义不变.
- 没有关闭 StrictMode、开发性能轨道或开发模式; 没有在产品代码中定时清空性能记录. 临时内存计数探针、console 包装和测试接收端均在最终验收前移除/停用, 不作为修复的一部分.
- 同时修复共享浏览器测试 Vite 启动器: 直接用 Node 执行入口, 避开 Windows `.bin/vite` shell shim; 服务和浏览器都使用 `127.0.0.1`, 消除 localhost IPv4/IPv6 不一致导致的连接拒绝, 并处理子进程启动错误.

### 对照及回归

| 检查 | 结果 |
| --- | --- |
| 旧实现, 10000 行 + 40 批更新 | 40 条目标组件性能记录, 合计 23,208,900 字节, 最大 581,660 字节. |
| 修复后固定行高 | 同一负载 40 条记录, 合计 8,880 字节, 最大 222 字节; 44 个 DOM 行, 最新 seq/text 正确. |
| 修复后自动换行 | 40 条记录, 合计 8,880 字节, 最大 222 字节; 43 个 DOM 行, 最新 seq/text 正确. |
| 新增持久回归 | `scripts/screenshots/logcatMemorySmoke.mjs` 接入 `smoke.mjs`; 明确断言开发性能记录存在、详情上限、FIFO 10000、可见行上限和最新行. 测量区间没有清空记录, 仅清除准备阶段数据. |
| 前端全量 | 61 文件 / 637 测试通过; TypeScript / Vite build 通过, 保留既有 chunk size 警告. |
| 浏览器完整冒烟 | 42 场景全部通过 (原 31 + 新内存 2 + 拖拽 9), 使用本机 Edge / Playwright 临时启动适配, 未安装浏览器. |
| 原生开发实例 | 移除诊断探针后应用 PID 18588 / renderer 19232, 首 6 分钟按 10 秒采样: 268–454 MB, 第 6 分钟 434 MB. 同一实例继续运行至约 20 分钟, 投屏和 UI 操作期间观察到约 518 MB 后回落, 最后 385 MB, 日志保持实时, 未 OOM. Vite 日志确认最终实例期间没有代码触发的页面重载. 不将本轮结果宣称为无限期运行稳定. |
| 无线投屏 | 开发环境实际开始 PID 13376, 点击停止后该进程消失且按钮恢复; 再次开始 PID 21644 成功. 日志采集在两次投屏之间持续运行. |
| 原生日志交互 | 暂停按钮切为恢复并显示已暂停; 恢复后再次显示暂停按钮, 状态 `10000/10000, 实时`, 日志继续更新. |

### 为什么前序检查没发现

- 测试覆盖缺口: 有界 store、虚拟 DOM、强制 GC 后的 JS heap 和 production 构建都绕开了开发性能记录的大数据详情. 不能把生产构建未复现当作开发环境问题不存在.
- 隐含假设: memoized 子组件接收大数组不会产生额外持久数据; React 当前开发版本的 props diff 打破了该假设.
- 预防已落地: 行读取改为 snapshot accessor, 开发浏览器回归验证记录大小和可见数据正确性, component/quality specs 明确原生进程内存与开发构建检查要求.

### 本轮开发复测收尾

- 正常退出最终应用 18588, 确认 19232 renderer、21644 scrcpy、对应 Logcat 和测试 WebView 子进程全部退出. 原始复现及中间验证实例同样已退出.
- Vite、临时诊断接收端和本轮 ADB server 已停止; 浏览器冒烟自行关闭全部测试浏览器和 Vite 子进程. 最终 1420/1422/5037/5199/5554/5555 无监听, 无本轮应用/投屏/ADB/模拟器残留.
- 本轮不再进行剪贴板写入测试, 前序恢复记录保留. 临时探针源码已从仓库删除, 测试原始日志仍在前序保留的 QA 目录. 本节测试时尚未提交/推送; 后续提交见下方交付记录.


## 2026-10-25 修复提交与交付记录

- `640635d` — Android 17 lock-state 兼容性修复, JVM 回归测试与重新生成的共用 DEX.
- `60357d9` — Logcat 开发模式性能记录内存修复, 固定/换行回归, Windows 浏览器测试启动兼容性.
- `d03a71f` — Windows i18n catalog 测试路径分隔符修复.
- 修复分支: `codex/fix-clipboard-android17`; 推送目标: `fork` (`yywq-git/adb-gui`). 上游 `zechuan-start/adb-gui` 无直接写权限.
- 提交前核对前端 637/637、浏览器 42 场景及构建日志, `git diff --check` 通过. 上述实际测试期间以后未再修改产品代码; Rust 169/169 与 Java 测试证据保持有效.
- Windows/Android 本轮修复与验收已完成, macOS 隐私预览授权仍待补验, 因此保留任务 `in_progress`, 不归档或宣称全平台完成.

## 2026-10-26 Windows release 安装包与锁屏 UI 补验

完整参数、进程、包哈希与异常记录见 [Windows release QA](./research/windows-release-qa-20261026.md)。源码基线 `codex/fix-clipboard-android17@7decbec`；本轮未修改产品代码。

### 安装包与检查

- 实际执行 optimized Rust + production frontend 的 NSIS/MSI 构建，版本 0.1.11。仅临时关闭 updater 签名产物，不算正式签名/自动更新验收。
- NSIS：原 0.1.10 升级、安装后启动、带 bundled ADB server 的重装及静默卸载均通过，安装/卸载退出码 0。
- MSI：普通权限安装 1925/1603；用户管理员安装成功。AppSearch 沿用 `%LOCALAPPDATA%/ADB GUI`，覆盖命令行临时 `INSTALLDIR`。实际安装版设备枚举、真机无线投屏、停止/重启和带活动会话退出回收通过。
- MSI 卸载：2026-10-26 21:33:55 MsiInstaller 1034/11724 确认状态 0；21:34:00 重复调用日志为 1605，HKLM 注册项及安装目录已消失。原 0.1.10 文件、卸载项及两个快捷方式随后从备份恢复。
- 本轮重跑前端 61 文件 / 637 项全部通过，TypeScript/Vite 与 release Rust 构建通过。Rust 169 项、Java 和浏览器 42 场景保留前日证据，不计为本轮重跑。

### 锁屏 UI 与恢复

| 场景 | 实际结果 |
| --- | --- |
| 中文锁屏状态 | `未推送: 手机已锁屏, 请解锁后重试`，模块内红色状态，无 toast。 |
| 英文锁屏状态 | `Not pushed: The phone is locked. Unlock it and try again`，实际安装版 UI。 |
| 解锁后失败复制 | 用户解锁后独立回读不匹配被拒绝的测试文本，没有补发。 |
| 解锁后新复制 | 中文/emoji 文本 761ms 回读一致，UI 显示 `Pushed`。 |
| 手机原剪贴板 | 完整 ClipData guardian 返回 `RESTORED original_is_null=false`、退出码 0。 |
| 电脑原剪贴板 | **未恢复**：后续投屏 UI 等待超时导致控制运行时重置，唯一内存快照丢失；当前遗留人工测试文本。已明确告知用户，关闭自动推送，停止继续写入。未将原剪贴板内容落盘或记录。 |

原生 UI 自动化遇到窗口激活/外部输入/几何错误，后半段使用同一安装版 WebView 的 loopback CDP 点击真实 DOM，保持真实 Rust IPC，无 mock。设置位于隔离 WebView profile；CDP 只监听 `127.0.0.1:9223`，应用退出后关闭。

### 投屏覆盖与剩余限制

- Windows 真机 + Android 17 只读模拟器两路画面、独立结束和退出回收通过；三画质、六开关的 UI/参数传递、额外参数校验和自定义路径通过。详见 [投屏验收](../archive/2026-10/10-19-scrcpy-launcher/validation.md#2026-10-26-windows-release-安装包补验)。
- `adb disconnect/connect` 覆盖无线 ADB transport 中断恢复；没有 WiFi 射频中断/路由变化/新端口证据。此阶段自动推送关闭，没有重做重连后的旧剪贴板抑制。
- 首轮用户无数据线；同日晚间接线后，Windows USB 物理拔插的投屏恢复已补验，见下节。无 Linux 桌面，Linux 原生保留未测；双设备为真机加模拟器，非两台物理手机。置顶 Z-order、实际无音频输出未独立测量。
- macOS 隐私预览授权仍待合适环境补验，任务继续 `in_progress`。

### 本轮收尾

- 原安装 10 个文件恢复，EXE 为 0.1.10，SHA-256 与原备份一致；HKCU 卸载项、桌面/开始菜单快捷方式恢复，未覆盖原用户设置 profile。
- 正常退出测试应用、scrcpy、采集、WebView、只读模拟器及本轮 ADB server；删除并复核两个本轮设备端 DEX，手机触摸与保持唤醒设置均回到 0。
- 电脑原剪贴板未恢复是本轮未解决异常。`%TEMP%/adb-gui-qa-20261025` 删除再次被自动审批拒绝，未绕过；`adb-gui-qa-20261026` 保留日志、隔离 profile 与安装备份，不宣称临时文件全清。

### 同日晚间 USB 物理拔插补验

- 用户接入并授权 Redmi K70 USB `275179f2`；无在线无线设备。重新安装同一 NSIS 0.1.11 release，退出码 0，使用新的隔离 WebView profile。应用自动推送关闭，scrcpy 加 `--no-clipboard-autosync`，本阶段不读写剪贴板。
- 开始前出现一次 offline，针对 serial 软件 reconnect 后恢复；这不算物理拔插证据。随后 USB 真实视频与投屏状态通过。
- 用户实际拔线并保持断开：ADB 列表为空，scrcpy/设备流/Logcat 均退出，应用继续运行；UI 显示未连接设备且开始投屏禁用，日志保留断前数据并标记断开。
- 用户插回并授权：同一 serial 自动在线、transport_id 4→5，开始按钮恢复；手动开始新投屏 PID 8216，有真实画面。日志点击“重连”后 PID 2380 采集正常、UI 显示实时；不是自动恢复日志或自动启动投屏。
- 带投屏和日志关闭应用后全部子进程/CDP 退出。NSIS 卸载码 0，再次恢复原 0.1.10；10 个文件、两个快捷方式、卸载项/安装器注册项全部与新备份哈希一致。ADB server 停止，5037/9223 无监听。
- **Windows USB 投屏物理拔插恢复现已通过**。没有新增剪贴板自动推送重连验收或剪贴板恢复结论；此前电脑剪贴板异常不变。无源码改动，不重跑单测/构建。原始备份/profile 位于 `%TEMP%/adb-gui-qa-20261026-usb`，保留不冒称已删。
