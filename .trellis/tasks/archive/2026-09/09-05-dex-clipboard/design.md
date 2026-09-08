# DEX 手动剪贴板技术设计

## 产品形态与状态

在工具页快捷按键附近新增 ClipboardTool, 沿用 ToolModule 的紧凑布局, 不显示正文预览或历史.
固定两个操作: 发送到手机, 复制到电脑. 展示当前目标设备名称, 名称可换行或截断并提供完整 tooltip. 不自动粘贴, 不自动广播.

| 状态 | 按钮与反馈 |
| --- | --- |
| 无设备/离线/未授权 | 两个操作禁用, 复用已有设备状态提示 |
| 就绪 | 两个操作可用, 无预读剪贴板 |
| 读取/准备 DEX/传输中 | 两个操作均禁用, 发起按钮显示 loading, 保持尺寸 |
| 成功 | toast 只显示方向和目标, 不包含正文 |
| 无文本/空字符串 | 提示无可用文本, 不清空目标 |
| 锁屏/权限/不兼容/协议失败 | 明确错误阶段, 不假报成功或降级为键盘输入 |
| 切换设备 | 旧操作结果失效, 不把请求重新发送到新设备 |

## 单 DEX 的扩展

- 保留 app-info.dex 文件名, com.adbgui.appinfo.Main, --no-icons/--icons-only 和原 APPINFO 协议.
- 在 scripts/build-app-info-dex/src/com/adbgui/clipboard/ 下新增独立 Main 与 ClipboardAccess 类, 两个入口编进同一个 DEX.
- 只在确有共用需求时抽取现有 Context 引导为共用类; 应用信息初始化行为不改变.
- build.sh 从编译单个 Main.java 改为收集本项目 src 下全部 Java 源文件, 继续兼容 macOS Bash 3.2, javac/d8 和 min-api 28. 编译平台要求提升为 API 31+, 用于 AttributionSource 类型; 运行最低版本仍为 Android 9, 新 API 按版本分支.
- 本地编译产物放临时/缓存目录, 不新增项目内大体积构建目录. 最终只更新跟踪的 resources/app-info.dex.
- 所有 Android 新 API 按 SDK 版本分支或反射使用, 不提高现有 Android 最低版本而不说明.

## Android API 与调用身份

复用现有 app_process/Looper 引导. 为剪贴板创建匹配 shell UID 的 Context, packageName/opPackageName 为 com.android.shell, Android 12+ 的 AttributionSource 也匹配实际调用身份. 参考 Android framework 和 scrcpy Context 处理, 不导入整个 scrcpy 依赖.

通过 ClipboardManager.getPrimaryClip/setPrimaryClip 和 ClipData.newPlainText 读写. 不依赖固定 Binder transaction 编号, cmd clipboard, input text, root, appops/权限配置修改或 APK 安装.

- 在当前用户已解锁时操作默认设备剪贴板. 锁屏时明确拒绝, 不尝试解锁.
- 默认范围为主用户的普通应用剪贴板. 工作资料, 双开空间, 多用户切换不在本版支持承诺内; 无法确认一致上下文时拒绝, 不猜 userId.
- 空 ClipData, 没有文本字段或空字符串返回 no_text. 不调用 coerceToText 自动读取 URI/文件.
- 保留前后空白, CRLF/LF, 表情和特殊符号, 不 trim 正文.
- 写入后同一进程读回并比较文本. API 返回但读取值不同/受限时返回未验证写入, 不返回成功; Android API 不保证跨进程原子事务, 不尝试覆盖回滚.
- 相同内容视为已满足目标. set 操作发生后立即 readback 的成功才是此时已确认, 不承诺其他应用之后不会改剪贴板.

## 新协议

只有新剪贴板入口采用下列协议. 请求经 stdin 传一个 UTF-8 JSON, 写完关闭 stdin; 不将正文放入命令行, 环境变量或设备临时文件.

~~~json
{"version":1,"operation":"get"}
{"version":1,"operation":"set","text":"example"}
~~~

响应由独占 stdout 的 buffered FileDescriptor.out 输出, 使用单独的整行标记后跟一个紧凑 JSON 对象:

~~~text
--ADBGUI-CLIPBOARD-V1--
{"version":1,"ok":true,"result":{"kind":"text","text":"example"}}
~~~

其他成功结果为 {"kind":"no_text"} 或 {"kind":"written"}. 错误使用 ok=false, error.code 和固定阶段描述, 不含正文.

- Rust 只匹配完整标记行, 随后严格解析唯一 JSON 对象及版本/结果类型; 不能沿用 APPINFO 的按任意子串取最后 sentinel 逻辑.
- 正文包含协议标记, 换行或 JSON 字符串时不能截断响应.
- 新协议不接受旧数组/无标记输出, 不做猜测式解析. 保留应用信息原协议兼容性.
- 退出码, envelope 和 set readback 都必须满足才可显示成功. 非零退出, 空输出, 非法字段或版本不符均失败.
- 纯文本上限为 256 KiB UTF-8, 作为明确的 IPC 资源边界, 超限拒绝且不截断. wire JSON 上限为 6 倍正文上限加 4 KiB envelope 预算, 覆盖 JSON 控制字符转义, 两项集中定义和测试.
- 错误解析不得复制 stdout/stderr 正文到日志或 toast. 仅记录操作, 阶段, 错误分类, 序列号和系统版本.

## ADB 调用与生命周期

新入口使用 adb -s <serial> shell -T -e none <固定的 app_process 命令>. 固定命令形如 CLASSPATH=<remote> /system/bin/toybox timeout -s KILL 8 app_process /data/local/tmp com.adbgui.clipboard.Main. 使用支持 stdin/stdout/stderr 的 shell 通道, 禁止 -n, -t, -x. 应用信息已有 exec-out 路径保持原行为.

Rust 使用 prepare_async_command, stdin/stdout/stderr pipe, 同时写入与消费输出, 避免管道互锁. stdin 写入和进程等待共享执行期限. 设备侧 Toybox timeout 在 app_process 启动前生效, 预算 8 秒; host 预算为该常量加 2 秒传输余量. 当前真机已确认该命令及 KILL 选项存在, 实际超时清理仍需验证. 旧版设备缺少此能力时明确返回不兼容, 不静默启用无界路径. 不把本地 kill_on_drop 当作远端进程必然退出.

部署沿用现有 30 秒 inspect/push 预算, 准备阶段和执行阶段分别反馈. 一次只允许一个剪贴板 UI 操作. 所有等待, 写入和进程必须有界, 超时后不保留桌面后台监听.

## 共享部署与并发

将 DEX 定位, 哈希路径, 检查和下发移至 src-tauri/src/device_helper.rs. app_info.rs 与 clipboard.rs 共用, 不复制部署代码.

现有 app_info_cache.rs 也引用 fnv1a_64. 移动哈希函数时同步其 import, 保持同一算法和缓存键, 不复制函数或让已有缓存失效.

- 保留进程级全局部署互斥, 避免同一物理设备的 USB/WiFi 别名同时写同一个 DEX.
- 部署锁只覆盖部署; 应用元信息/图标运行期间不占该锁. 应用查询原有串行锁若仍需要, 留在应用查询模块.
- 为强制刷新采用唯一暂存路径 push 后原子 rename 发布, 防止另一个入口运行时被原地覆盖. 同一全局部署锁协调暂存检查/发布/清理, 不添加按序列号的平行部署规则.
- 保留应用查询既有只读错误重试合约. 剪贴板只复用部署, 不复用 Vec<T> 解析或整个只读 retry wrapper.
- set 已经启动后禁止自动重发. 超时或断线时可能已经改变原手机剪贴板, 提示结果未确认并由用户决定是否再点, 不伪称已回滚.
- 新剪贴板请求遇到部署/校验失败就显式返回, 不自动反复重装或修改手机配置.
- 共享部署改造是结构调整, 必须同步 backend spec 中原助手全局锁的范围及原子发布合约.

## 桌面桥接与设备时序

计划桥接 API:

~~~ts
readHostClipboardText(): Promise<string>
writeHostClipboardText(text: string): Promise<void>
getDeviceClipboard(serial: string): Promise<
  { kind: "text"; text: string } | { kind: "no_text" }
>
setDeviceClipboard(serial: string, text: string): Promise<void>
~~~

电脑端使用已有 clipboard-manager 的 readText/writeText, 所有封装在 lib/tauri.ts. capabilities/default.json 只增加 allow-read-text 和 allow-write-text. 现有插件仅返回字符串错误, 无文本读取失败不能依赖英文错误内容做分类, 统一报告无法读取可用文本并保留目标; 空字符串可明确判断为无文本. 不新增第二套系统剪贴板库.

前端控制器在点击时捕获 serial + contextRevision + operationId. contextRevision 在选择变化, 在线状态变化和 USB/WiFi 传输切换时单调递增, 包括 A -> B -> A. 操作尚未完成时也要通过同步订阅及时失效, 不能只在迟到的 effect 中比较 serial.

- 电脑到手机: 点击 -> 读取电脑文本 -> 校验非空和长度 -> 校验当前 context -> 向捕获的 serial 发出 set -> 有效响应才反馈成功.
- 手机到电脑: 点击 -> 获取捕获 serial 的文本 -> 校验当前 context -> 调用电脑 writeText -> 有效响应才反馈成功.
- 每个写副作用的提交点在最后一次 context 校验之后. 已发送给系统/手机的写操作无法撤回, 切换设备只能阻止尚未提交的写及后续旧反馈.
- 不因旧 finally 清除新操作的 busy, 不将旧错误显示到新目标上.
- 页面切换不改变目标身份, 已提交的一次性操作可以完成; 组件真正卸载/应用退出时释放订阅与句柄.

## 测试与证据边界

- 真机已确认 shell 背景读取权限和 Toybox timeout 命令存在, 尚未验证新 Context/get/set 和超时退出. 首个实现阶段必须验证这些项目再完成 UI.
- Android 16 主力真机为首要验收目标. Android 9 最低支持路径至少做 API 审查和可获得的旧版设备/模拟器测试, 缺失时明确写未覆盖.
- 旧 DEX 配新宿主的应用信息兼容回归保留; 剪贴板遇到旧 DEX 必须明确不支持, 不能把应用 JSON 当作成功.
- 不在本轮执行读写测试, 因为本轮是规划. 后续真机测试使用非敏感样例, 不记录或持久化用户原剪贴板正文.

## 影响文件

新增 Java clipboard 入口/访问类, Rust device_helper.rs 和 commands/clipboard.rs, src/lib/clipboardTransfer.ts 或同等边界清晰的控制器, src/components/ClipboardTool.tsx.
调整 Java 构建脚本与 DEX, app_info.rs, app_info_cache.rs 的共用哈希引用, lib.rs/commands/mod.rs, lib/tauri.ts, capabilities/default.json, App.tsx, resources/README.txt, 对应 spec 与测试.
