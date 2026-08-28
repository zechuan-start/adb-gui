# 设备文件双向传递技术设计

## 1. 产品形态与设计原则

该功能是 ADB GUI 的一级“文件”工作台. 它使用完整内容区承载目录浏览、双向传输和图片预览, 不放入“工具”页的小卡片, 不暴露裸 ADB 命令, 不扩展成双栏本地/设备资源管理器.

设计原则:

- 当前选中设备是唯一设备上下文, 每个命令都显式携带 `serial`.
- Rust 后端是设备路径、类型识别、自动改名和 shell 转义的唯一事实源.
- 前端只消费结构化目录数据, 不解析 `ls` 输出, 不拼接 shell 命令.
- P0 只包含浏览、新建目录、多文件上传、单文件下载和图片预览.
- 不使用 root、沉默 fallback、静默覆盖或长期图片缓存.

## 2. 工作区布局

应用现有默认窗口为 1200x800, 最小窗口为 900x600. 在顶部页签中增加“文件”, 与“工具、日志、应用、生码”并列.

```text
+--------------------------------------------------------------------------------+
| 设备上下文和全局状态                                                           |
+--------------------------------------------------------------------------------+
| 工具 | 日志 | 应用 | 文件 | 生码                                               |
+--------------------------------------------------------------------------------+
| [下载目录] [上级] [可编辑绝对路径________________] [复制] [前往] [刷新] [新建] [上传] |
| / > sdcard > Download                                                          |
+--------------------------------------------------------+-----------------------+
| 名称                            类型      大小  修改时间 | 图片预览或文件详情    |
| [目录] images                   文件夹      -    ...    |                       |
| [图片] screenshot.png           PNG       2 MB  ...    |                       |
| [文件] notes.txt                TXT       4 KB  ...    |                       |
|                                                        | 复制完整路径 / 下载   |
|                                                        +-----------------------+
|                                                        | 最近一次传输结果      |
+--------------------------------------------------------+-----------------------+
```

- 主区采用约 70% 文件列表和 30% 详情区, 详情区最小宽度 260px.
- 工具栏按钮使用 Lucide 图标和 tooltip; 路径输入框承担复制、编辑和跳转职责.
- 面包屑紧邻工具栏, 每个路径段可点击.
- 文件列表行高固定并使用项目已有 `@tanstack/react-virtual` 虚拟渲染, 列为名称、类型、大小、修改时间; 目录优先, 其余条目按名称升序.
- 右侧不是嵌套卡片. 上半区显示选中项详情或图片, 下半区显示最近一次传输的逐项结果.
- 拖入本地文件时只高亮文件列表区域, 放下后上传到触发拖拽时的当前设备目录.

## 3. 前后端边界

### 3.1 Rust 数据契约

在 `src-tauri/src/commands/device_files.rs` 新增文件域命令. 序列化字段沿用项目现有 snake_case 契约.

```rust
struct DeviceFileEntry {
    name: String,
    path: String,
    kind: DeviceFileKind, // directory | file | symlink | other
    size: u64,
    modified_at: i64,    // Unix seconds
    previewable: bool,   // extension-based UI hint; backend still verifies magic bytes
}

struct DeviceDirectoryListing {
    path: String,
    parent: Option<String>,
    entries: Vec<DeviceFileEntry>,
}

struct DeviceTransferResult {
    name: String,
    remote_path: String,
    local_path: Option<String>,
}

struct DeviceImagePreview {
    data_url: String,
    mime_type: String,
    size: u64,
}
```

新增 Tauri commands:

```text
list_device_directory(serial, path: Option<String>) -> DeviceDirectoryListing
create_device_directory(serial, parent_path, name) -> DeviceFileEntry
upload_device_file(serial, local_path, remote_dir) -> DeviceTransferResult
download_device_file(serial, remote_path, local_path) -> DeviceTransferResult
preview_device_image(serial, remote_path) -> DeviceImagePreview
```

所有阻塞 ADB 和本地文件操作通过 async command + `spawn_blocking` 执行. `commands/mod.rs` 注册模块, `lib.rs` 注册 commands.

### 3.2 TypeScript 桥接

`src/lib/tauri.ts` 定义与 Rust 一致的接口和唯一 `invoke` 封装. 同一文件负责:

- 多文件选择: `open({ multiple: true })` 规范化为 `string[]`.
- 本地保存位置: `downloadDir()` + `join()` 生成“系统下载目录/原文件名”, 再交给 `save()` 允许用户修改.
- 下载完成后的 `revealItemInDir` 入口.

组件不直接导入 `invoke`, `open`, `save`, `downloadDir` 或 `join`.

## 4. 设备路径契约

### 4.1 规范化

后端对每个远端路径执行同一套词法规范化:

- 必须是非空绝对路径并以 `/` 开头.
- 拒绝 NUL.
- 折叠重复 `/` 和 `.`.
- 解析 `..`, 但不允许越过根目录.
- 根目录的 `parent` 为 `None`; 其他路径由后端返回规范化后的父路径.

新建目录名称必须是单个非空路径段, 拒绝 `/`、NUL、`.` 和 `..`. 使用非递归 `mkdir`, 因此同名条目直接失败.

### 4.2 shell 调用

`adb push` 和 `adb pull` 使用独立进程参数传递本地与远端路径. 需要设备 shell 的列表、存在性检查、`stat` 和 `cat` 统一使用后端 POSIX 单引号转义器构造单个受控命令字符串. 用户输入永远不能成为未转义的 shell 片段.

路径转义覆盖空格、中文和单引号. 极端换行文件名不作为产品保证, 但目录记录协议不主动按空格切分.

## 5. 目录列表协议

设备 shell 使用受控脚本枚举普通项和隐藏项, 并用 `stat -c` 读取类型、大小和 Unix 修改时间. 脚本输出 NUL 分隔的固定四字段记录:

```text
kind NUL size NUL modified_at NUL absolute_path NUL
```

Rust 负责完整性校验、UTF-8 转换、名称提取、父路径计算和稳定排序. 记录字段不足、数值非法、路径越界、`stat` 不可用或 shell 返回非零状态都直接失败, 不退化为解析 `ls` 文本.

排序规则由后端唯一实现: 目录在前, 非目录在后, 各组按不区分大小写的名称升序, 同名再按原名称排序. 前端按返回顺序渲染.

软链接显示为 `symlink`, P0 不双击跟随. 用户仍可在绝对路径栏输入其目标路径.

## 6. 上传与自动改名

流程:

```text
本地选择/拖拽 -> 捕获 serial + 当前远端目录 -> 逐个调用 upload_device_file
-> 后端校验本地普通文件 -> 查询目标名称 -> 生成可用远端路径
-> adb push -> 返回实际远端路径 -> 前端记录逐项结果 -> 批次结束刷新列表
```

- 前端串行上传, 因此可以显示 `当前序号/总数/文件名` 并避免同一窗口内的命名竞争.
- 后端在每次上传前检查目标目录和文件名, 不信任前端现有列表.
- 同名规则为 `name.ext`, `name (1).ext`, `name (2).ext`. 无扩展名时为 `name (1)`.
- 已存在的设备文件不被主动覆盖. 后端返回实际使用的名称和路径.
- 本地目录、空路径、无文件名或不可读文件直接返回带上下文错误, 不跳过并伪装成功.
- 一批文件允许部分成功. 前端保留每一项结果, 最后用汇总 toast 报告成功数和失败数.
- P0 不处理目录递归、不解析字节级进度、不取消已启动的 ADB 子进程.

## 7. 下载与本地保存

流程:

```text
选中设备文件 -> 系统保存对话框(默认电脑下载目录/原文件名)
-> 用户确认本地路径 -> download_device_file -> adb pull 到同目录临时文件
-> 校验临时文件 -> 安全替换目标路径 -> 显示成功路径和“在文件管理器中显示”
```

- 取消保存对话框是正常无操作状态, 不显示错误.
- 系统保存对话框负责本地同名提示; 后端只写用户最终确认的路径.
- 后端拒绝下载目录条目, P0 不递归拉取目录.
- 下载先写目标目录内的唯一临时文件. `adb pull` 或校验失败时只删除临时文件.
- 目标已存在时, 完整拉取后先将原文件移动到临时备份, 再将新文件移动到目标; 任一步失败都尝试原位恢复备份并返回错误. 成功后删除备份.
- 下载失败不能显示成功路径, 也不能把不完整内容留在用户最终目标路径.

## 8. 图片预览

- 支持 PNG、JPEG、WEBP、GIF, 以文件魔数确认真实 MIME, 不只信任扩展名.
- 后端在读取前重新 `stat` 文件大小. 超过 20 MiB 时返回明确的“超过预览上限”, 前端只显示元数据和下载入口.
- 读取使用设备作用域的 `adb exec-out cat`, 后端再次检查实际字节数并转成 `data:<mime>;base64,...`.
- 前端单击图片文件自动加载. 选择非图片、切换目录、切换设备或开始新的预览时立即清除旧 `data_url`.
- 预览请求带序号和设备上下文. 过期响应不得覆盖新选择或新设备状态.
- 不写临时预览文件, 不在 Zustand、磁盘或 localStorage 建立长期缓存.

## 9. 前端状态与交互

新增 `src/lib/deviceFiles.ts` 保存纯类型辅助和 reducer, 新增同目录测试. `DeviceFileManager.tsx` 使用 `useReducer` 管理页面会话状态, 不新增全局 store.

状态至少包含:

- 当前设备上下文、已加载路径、路径输入草稿.
- 目录列表、选中项、列表加载/错误.
- 图片预览加载/数据/错误.
- 新建目录弹窗状态.
- 当前传输批次和逐项结果.
- 列表请求与预览请求序号.
- 设备操作上下文 `{ serial, revision }`; revision 只增不减, 用于区分相同 serial 的不同生命周期.

规则:

- 设备变化时原子重置到 `/sdcard/Download`, 清空列表、选择、预览和传输结果, 然后加载新设备.
- 无设备或设备非在线时显示禁用态, 不调用文件 commands.
- 目录跳转失败时保留原目录和列表, 路径输入恢复为已加载路径.
- 最新请求序号和设备上下文共同决定响应是否可写入状态, 防止快速导航和切换设备产生旧响应覆盖.
- 每次设备变化或文件页卸载都递增 operation revision. 上传、下载、新建目录和系统对话框返回值必须同时匹配捕获的 serial 与 revision, 只比较 serial 不能抵御 A -> B -> A.
- 上传或下载期间禁用会改变目标上下文的页面操作. 如果用户从全局切换设备, 已启动命令仍绑定捕获的旧 serial, 但其响应会被丢弃; 多文件上传在每个后续 command 前后重新校验 operation revision, 失效后不再启动下一项、刷新目录或显示旧 toast.
- 文件列表单击选中, 图片自动预览; 双击只对目录执行进入动作.
- 文件类型由条目 `kind` 和文件扩展名派生, 仅用于展示, 不参与后端权限或预览格式判断.

## 10. 可见状态

- 默认态: 在线设备进入 `/sdcard/Download`, 列表与详情区可操作.
- 无设备态: 显示“先选择在线设备”, 所有设备文件命令禁用.
- 加载态: 列表保留稳定尺寸并显示局部加载指示, 不让布局跳动.
- 空目录: 显示“此目录为空”, 上传和新建目录仍可用.
- 权限/路径错误: 列表区域显示行内错误, toast 提示摘要, 原目录保持不变.
- 新建目录: 小型确认弹窗, 名称输入为空时禁用确认; 同名或无权限显示在弹窗内.
- 上传: 右侧传输区显示当前文件和已完成结果; 批次完成后刷新一次目录.
- 下载: 保存对话框确认后显示忙碌状态; 成功后显示本地完整路径和 reveal 操作.
- 预览: 图片居中使用 `object-contain`, 不裁剪; 非图片、超限和失败显示文件信息及原因.
- 拖拽: 仅文件页挂载全局 Tauri drag/drop listener, 进入和离开时恢复稳定布局.

## 11. 现有推送能力迁移

- `AppManager.tsx` 移除 `install/push` 分段控件、任意文件选择和 `pushFile` 调用, 标题恢复为 APK, 仅保留 APK 安装与 APK 拖拽.
- `app.rs` 移除 `push_file`, 固定 `/sdcard/Download` 和旧路径测试.
- `src/lib/tauri.ts` 移除旧 `pushFile`/`pickAnyFile` 单文件桥接, 由新文件域 API 取代.
- `lib.rs` 移除旧 command 注册并增加新 commands.
- README 将“APK install / push”拆成“APK install”和“Device files”, 不保留两个推送入口.
- `.trellis/spec/backend/quality-guidelines.md` 中旧“Device File Push Commands”契约更新为文件工作台命令契约.

## 12. 兼容性、风险与回滚

### 兼容性

- 桌面端保存路径通过 Tauri `downloadDir`、`join` 和系统 dialog 处理 macOS、Windows、Linux 差异.
- 设备端依赖 Android shell 提供 `sh` 和 Toybox `stat -c`. 不支持时明确报错, 不使用脆弱的 `ls` 解析 fallback.
- ADB 权限不足按原始 stderr 加操作上下文返回, 不尝试 root.

### 风险

- Android 版本间 shell 工具行为差异是目录列表最大风险, 必须用真实设备验证.
- 大图片通过 base64 会额外占用内存, 20 MiB 上限必须在读取前后双重检查.
- Tauri 全局拖拽监听必须只在文件页挂载, 防止与 APK 安装卡片争用.
- 设备切换和快速导航存在异步竞态, 必须通过请求序号和不可复用的 operation revision 消除旧响应写入; serial 本身不是上下文版本.
- 自动改名检查与外部进程同时写同名文件仍存在极小竞争窗口. P0 保证本应用串行上传不互相覆盖, 不提供跨进程文件锁.

### 回滚点

- 新后端模块和新页签可整体移除, 不涉及数据库、配置迁移或持久化数据.
- 旧推送入口最后删除. 若新文件上传未通过真实设备验证, 不进入最终收口阶段.
- 回滚时恢复原 `push_file` 注册和 APK 工具推送模式, 不触碰其他设备工具.

## 13. 验证策略

- Rust 单测: 路径规范化、父路径、新目录名称、shell 转义、NUL 记录解析、稳定排序、自动改名、图片魔数和 20 MiB 限制.
- 前端单测: 面包屑、格式化、reducer 设备重置、旧列表响应丢弃、旧预览响应丢弃、传输逐项结果, 以及 A -> B -> A 和页签卸载后的 operation snapshot 失效.
- 静态验证: `cargo fmt --check`, 60 秒硬超时 `cargo test`, 严格 Clippy, `pnpm test`, `pnpm build`, `git diff --check`.
- 浏览器冒烟: 真实打开最新 Vite 页面, 检查 1200x800 和 900x600 下页签、文件工作区、空状态、弹窗和无重叠.
- 真实设备冒烟: `/sdcard/Download` 浏览、绝对路径跳转、中文/空格/单引号文件名、多文件上传自动改名、单文件下载改名、20 MiB 边界图片预览、无权限路径、设备切换.

规划阶段执行 `adb devices -l` 时没有在线设备. 真实设备冒烟必须在实施完成后连接设备再执行, 不能用构建成功代替.
