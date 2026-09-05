# 本机目录与录屏恢复设计

## UI 与偏好归属

在截图与录屏分组顶部增加整行保存目录, 右侧 FolderOpen(选择)/RotateCcw(恢复默认)图标和 tooltip. 保留下方三个打开开关. 目录可完整选择复制, 窄宽度换行, 不挤压按钮.

- SettingsPreferences 增加 capture: { directory: string | null }, 默认 null. null 表示系统 Pictures/ADB GUI, 自定义保存原生选择器返回的宿主绝对路径.
- 已有 screenshot/recording 只保存打开行为, 不再复制目录字段. resetSection("capture") 同时重置 capture/screenshot/recording, 单独目录重置只写 capture.directory.
- 目录的实际默认路径由一个 Rust helper 解析, 设置和保存命令共用. 前端显示解析结果但不把它作为第二持久配置.
- 选择对话框结果为 null 时无变更, 不触发校验和写入. 选中后检查目录存在且是目录再保存偏好, 可写性以实际文件 IO 为准, 不额外维护权限布尔值.
- 目录选择/解析中的局部 busy 状态只禁用该行, 其他组仍可编辑. 异步校验带操作代次, 旧选择返回不能覆盖后选值或恢复默认.
- 偏好保存失败保留旧值并反馈. 恢复系统默认路径无法解析时目录偏好仍可表示 null, 显示解析错误并允许重新选择, 不伪造默认路径.

## 唯一目录服务与桥接

建议新增 src-tauri/src/commands/capture_output.rs, 只负责截图/录屏的目录解析、输出路径和受控临时文件, 不构造通用文件系统抽象.

~~~ts
type CaptureDestination =
  | { kind: "default" }
  | { kind: "directory"; path: string };

type RecordingSaveTarget =
  | { kind: "session" }
  | { kind: "file"; path: string };

pickCaptureDirectory(): Promise<string | null>;
resolveCaptureDirectory(destination: CaptureDestination): Promise<string>;
takeScreenshot(serial: string, behavior: ScreenshotBehavior, destination: CaptureDestination): Promise<ScreenshotResult>;
startScreenRecord(serial: string, destination: CaptureDestination): Promise<ScreenRecordStatus>;
stopScreenRecord(request: { sessionId: string; behavior: SaveBehavior; target: RecordingSaveTarget }): Promise<ScreenRecordResult>;
discardScreenRecord(sessionId: string): Promise<DiscardRecordingResult>;
~~~

- 字段以最终代码命名为准, 但使用必填的显式 tagged 对象区分默认/自定义, 不用可缺省参数掩盖调用点漏传. Rust serde 与桥接同步.
- lib/tauri.ts 是唯一 invoke/原生对话框入口. 设置的 null 在此明确映射为 default, 不是失败回落.
- default 使用 dirs::picture_dir().join("ADB GUI"), 无 Pictures 则 Err. 默认子目录可在实际保存/录屏准备时创建.
- directory 只接受宿主绝对路径且已有目录. 自定义根目录消失时不 create_dir_all 自动重建. 不把本机路径拼入设备 shell.
- 设置展示解析不创建文件. 实际开始录屏时在目标目录准备本次暂存输出, 创建失败则不启动手机录制; 实际保存仍检查 IO 结果, 不保证目录之后永不失效.
- 输出文件采用唯一名字及排他创建, 不覆盖已有文件. 复用 device_files 下载中 "临时拉取 -> 校验 -> 发布" 的模式, 不复用其允许替换用户指定目标的语义.
- 另存为的原生保存对话框可以明确确认覆盖, 后端按这个明确目标执行受控替换; 未经过选择的默认输出不能覆盖. 复用既有下载目标发布逻辑前先核对覆盖/失败恢复边界, 仅抽取确有两处共用的 helper.

## 截图保存

- 点击时一起读取目录和两个打开标志, 不在 await 后重新取设置.
- 目录解析和受控输出创建失败立即报错, 实际 capture_screenshot 沿用原 ADB 捕获函数.
- 完成 PNG 写入才返回最终路径, 失败清理仅本次临时文件, 不删除旧截图.
- after_save 继续根据快照执行, 返回 opened/revealed 实际结果. 所有历史路径动作使用返回值.
- copy_screenshot 完全绕过目录解析/准备, 即使自定义目录不可用也可复制图片.

## 录屏会话状态

保留全局单录屏, 将隐式 Child/Option + pending_pull 升级为明确阶段, 用会话 ID 绑定命令. 不是新增持久存储.

~~~text
idle -> recording -> pending_save -> saving -> idle
                                \-> saving -> save_failed
save_failed -> saving (用户重试/另存为) -> idle 或 save_failed
save_failed -> idle (用户确认放弃)
~~~

- start 创建唯一 session_id, 冻结 serial/remote_path/目标目录/输出名称/started_at. Child 与会话继续由 Rust 持有.
- 状态返回 phase: idle/recording/pending_save/saving/save_failed, session_id, serial, elapsed_secs, 必要时 local_path/remote_path/错误. 移除可与 phase 矛盾的 active/pending_pull 第二套状态, 前端按 phase 派生.
- start 在任何非 idle 状态拒绝, 避免旧录屏待保存时启动新段覆盖源.
- stop 校验 expected session_id, 同一时刻只能一个保存/放弃操作. 用 Saving 占位保留全局所有权, 长时间 ADB/磁盘 IO 不持锁; 完成或失败后按同一 ID 发布新状态.
- recording 时先沿用设备 SIGINT/进程回收规则, 确认录制已停再进入保存. 停止失败不得被当作 pending_save 成功状态.
- 原目录的准备结果在会话中固定. 录制中改公共目录不改当前段, stop 的 session target 不能从最新设置重新算目录.
- 手动另存为只允许待保存/保存失败会话, 将明确选择的文件目标仅用于本次尝试, 不改会话原目标或公共目录偏好. 取消保留原态. 另存为失败后重试保存仍用会话原目标, 可再次另存为; 失败提示必须显示本次失败目标, 不与原目标混淆.

## 保存与清理顺序

1. 校验会话身份并独占本次保存, 如有必要完成设备停止.
2. 查询本段手机源大小, 必须大于零. 拉取到当前目标附近的独立暂存文件, 比对本机大小与停止后的手机源大小.
3. 在约定目标完成发布, 成功后才算已保存. 失败清理本次部分产物, 保留手机源及 SaveFailed 会话.
4. 本机已验证后尝试删除原会话的精确 remote_path, 不使用通配符清理或当前选中设备.
5. 清理失败仍返回保存路径, 同时带 sourceCleanupError 等明确结果, UI 提示手机源未删除. 本机保存已完成, 不重新进入待 pull 状态.
6. 根据此次保存的 openAfterSave 打开视频. 打开失败作为单独反馈, 不抹去保存成功路径.

实现必须移除现有 "pull 失败也删源" 和 "take 后错误永久丢会话" 路径. 重试保存属于用户明确动作, 不复用自动定时重试.

## 前端状态与迟到操作

- ScreenRecordTool 和 screenRecordPollingController 同步新状态合约, 整段自动保存按 session_id 最多提交一次. 配置读取/桥接失败也消耗自动尝试, 后续交给手动重试.
- save_failed 不触发自动 finalize. 错误区显示简短阶段信息、目标路径、重试保存/另存为/放弃入口.
- 手动停止、自然结束和切设备结束复用同一 finalize 控制器, busy/ref/会话 ID 防重复. 不使用多个 effect 各自独立保存.
- 异步保存对话框打开前捕获 session_id, 返回后校验仍为同一会话再提交; Rust 再依据 ID 独占实际会话, 防止迟到 UI 操作误伤新段.
- 重试读取当次自动打开标志, target=session 继续原目录. 另存为不读取新全局目录, 只用用户选择目标.
- confirmed discard 只作用原会话, 尝试停止/删除该会话源并清理本次临时文件. 删除失败可按用户明确放弃意图释放恢复状态, 返回残留路径和错误, 不宣称删除成功. 取消无任何删除/状态变化.
- 进程退出不主动删除未保存源, 不承诺跨启动恢复; 保存失败界面显示可供人工恢复的设备和远端路径.

## 平台与权限

保持既有 dialog:default, 不增加前端任意目录 fs scope. 使用宿主 Path API 处理 Windows 盘符/UNC 和 macOS/Linux 路径, 不硬编码 /tmp 为跨平台默认.

目录选择路径可含中文、空格、引号. 系统权限或外接盘失效用准确 IO 错误反馈, 不自动提权或修改 ACL. Browser 无 Tauri 时禁用原生选择, 不制造成功路径.

## 影响文件与验证

- settings schema/store/dialog, lib/tauri.ts, Screenshot.tsx, ScreenRecordTool.tsx, screenRecordPollingController 及相邻测试.
- commands/capture_output.rs(新), screenshot.rs, screen_record.rs, commands/mod.rs/lib.rs 命令注册; 必要的既有下载发布 helper 复用边界.
- 更新 backend/quality-guidelines.md 的录屏签名/清理/状态条款, frontend/settings-clipboard.md, 两份 README 默认位置与自定义目录说明.
- DEX/手机权限/剪贴板协议不变. 自动检查覆盖真实失败顺序, 按本轮用户指定的 Android 模拟器演练一次目录失效后保留源并另存为成功, 不将模拟器结果记为真机覆盖.

## 模拟器验收边界

- 使用 macOS 原生 Tauri 包连接 Pixel_10, 通过应用界面验证目录选择、设置持久化、保存、重试、另存为和放弃. 仅 ADB 命令成功不能替代应用验收.
- 在专用本机测试目录注入目录移动/失效, 在模拟器核对原会话文件仍存在, 恢复发布成功后再核对精确源路径已删除.
- 验证 Windows/Linux 宿主路径和其他 ROM 时另记实测结果, 当前 Android 17 / SDK 37 模拟器不代表这些平台.
- 保留现有前置子任务的串行依赖. 当前指针由创建顺序形成, 不据此提前修改共享 schema/dialog.
