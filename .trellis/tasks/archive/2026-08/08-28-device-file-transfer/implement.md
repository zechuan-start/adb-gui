# 设备文件双向传递实施计划

## 1. 实施顺序

### 阶段 A: 建立设备文件后端契约

- [x] 新增 `src-tauri/src/commands/device_files.rs` 和 Rust 数据类型.
- [x] 实现远端绝对路径规范化、父路径、单段目录名称校验和 POSIX shell 转义.
- [x] 实现 NUL 分隔目录记录解析和目录优先稳定排序.
- [x] 实现 `list_device_directory` 和 `create_device_directory`, 所有阻塞操作进入 `spawn_blocking`.
- [x] 在 `commands/device.rs` 增加共享二进制 ADB 输出 helper, 现有文本 helper 继续通过同一执行路径传播 stderr.
- [x] 添加 Rust 单测, 覆盖空格、中文、单引号、隐藏文件、根路径、`..`、畸形记录和错误映射.

阶段验证:

```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml device_files
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### 阶段 B: 完成双向传输和图片预览

- [x] 实现上传前目标目录校验和 `名称 (序号).扩展名` 自动改名.
- [x] 实现单文件 `adb push` 并返回实际设备路径.
- [x] 实现系统确认路径后的单文件 `adb pull`: 同目录临时文件、结果校验、已有目标备份、安全替换和失败恢复.
- [x] 实现图片 `stat` 前置检查、20 MiB 上限、`exec-out cat`、读取后上限检查和魔数 MIME 识别.
- [x] 注册 `device_files` 模块和全部 Tauri commands.
- [x] 添加自动改名、下载边界、图片格式和超限单测.

阶段验证:

```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

### 阶段 C: 建立前端文件工作台

- [x] 在 `src/lib/tauri.ts` 增加设备文件类型、commands、多文件选择和系统下载目录保存对话框封装.
- [x] 新增 `src/lib/deviceFiles.ts` 及测试, 实现面包屑、显示格式和带设备/请求上下文的 reducer.
- [x] 新增 `src/components/DeviceFileManager.tsx`, 在同一文件内用小组件拆分工具栏、列表、详情/预览和传输结果.
- [x] 在 `src/App.tsx` 增加“文件”一级页签和完整高度工作区.
- [x] 实现默认 `/sdcard/Download`、绝对路径输入、路径复制、面包屑、上级、刷新和返回下载目录.
- [x] 使用已有 `@tanstack/react-virtual` 实现固定行高文件列表, 显示名称、类型、大小和修改时间, 支持隐藏文件、目录双击进入和选中项详情.
- [x] 实现新建目录弹窗和行内错误.

阶段验证:

```bash
pnpm test
pnpm build
```

浏览器检查:

- [x] 用 Browser 打开当前 Vite 页面, 确认“文件”页签和无设备态真实渲染.
- [x] 检查 1200x800 和 900x600 两个视口, 工具栏、路径、列表、详情区和弹窗无重叠或横向溢出.
- [x] 检查亮色和暗色主题下列表选择、拖拽状态和错误状态可读.

### 阶段 D: 接通上传、下载、预览和竞态保护

- [x] 文件选择和拖拽统一进入顺序上传函数, 捕获触发时的 `serial` 和远端目录.
- [x] 显示当前序号、总数、实际设备路径和逐项成功/失败结果, 批次结束只刷新一次目录.
- [x] 通过系统保存对话框完成单文件下载, 成功后提供“在文件管理器中显示”.
- [x] 图片单击自动预览, 非图片、超限和失败清空旧图并保留下载入口.
- [x] 设备变化原子重置; 列表和预览响应通过上下文与请求序号拒绝过期写入; 设备变化或页签卸载通过 operation revision 终止旧批次的后续 commands 和完成副作用.
- [x] 操作忙碌时禁用会改变页面目标上下文的控件, 不增加沉默重试或后台队列.

阶段验证:

```bash
pnpm test
pnpm build
```

定向行为检查:

- [x] reducer 测试证明旧设备、旧目录和旧预览响应不能写回新状态.
- [x] 多文件上传中单项失败不会抹掉其他项结果.
- [x] operation snapshot 测试证明 A -> B -> A 和页签卸载后旧上下文不会重新生效.
- [x] 取消文件选择或保存对话框不显示错误.

### 阶段 E: 合并旧推送能力

- [x] 简化 `src/components/AppManager.tsx`, 只保留 APK 安装、APK 选择和 APK 拖拽.
- [x] 从 `src-tauri/src/commands/app.rs` 移除 `push_file`、固定下载目录和旧测试.
- [x] 从 `src/lib/tauri.ts` 和 `src-tauri/src/lib.rs` 移除旧推送桥接与 command 注册.
- [x] 使用 `rg` 确认 `push_file`、`pushFile`、APK/文件分段和旧固定推送提示没有残留调用.
- [x] 更新 README 中英文功能列表.
- [x] 按 `trellis-update-spec` 更新后端文件命令契约, 删除已过时的单文件固定目录推送规范.

阶段验证:

```bash
rg -n "push_file|pushFile|APK / 文件|选择并推送|推送到 /sdcard/Download" src src-tauri/src README.md .trellis/spec
pnpm test
pnpm build
```

## 2. 最终质量门

自动验证:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml --check
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
pnpm test
pnpm build
git diff --check
```

2026-08-29 执行结果:

- [x] `pnpm test`: 3 个测试文件, 24 项测试通过.
- [x] `pnpm build`: TypeScript 与 Vite 生产构建通过.
- [x] 60 秒限制的 `cargo test`: 28 项测试通过.
- [x] 严格 Clippy、`git diff --check` 和本任务改动 Rust 文件的 `rustfmt --check` 通过.
- [x] 全仓 `cargo fmt --check` 仅报告任务前已存在且本任务未改动的 `adb.rs`、`device_info.rs`、`keys.rs`、`screenshot.rs`; 为避免混入无关格式化, 本次不修改这些文件.

真实设备冒烟:

- [x] 默认打开 `/sdcard/Download`, 复制路径内容正确.
- [x] 输入 `/sdcard` 和 `/data/local/tmp` 可跳转; 输入无权限路径时保留旧目录并报错.
- [x] 浏览包含隐藏文件、空格、中文和单引号名称的目录.
- [x] 新建目录成功; 同名目录直接失败.
- [x] 连续上传两个同名文件, 第二个落为 `名称 (1).扩展名`, 原文件未被覆盖.
- [x] 一批多文件中制造一个失败项, 核对逐项结果和最终汇总.
- [x] 下载文件时保存对话框默认位于电脑下载目录, 修改目录和名称后文件内容一致.
- [x] 预览 PNG、JPEG、WEBP、GIF; 非图片和大于 20 MiB 图片不显示旧预览.
- [x] 传输/预览期间切换设备, 新设备不显示旧设备路径、文件或响应.
- [x] APK 工具仍能安装 APK, 且不再存在通用推送模式.

最终 UI 验证:

- [x] Browser 截图覆盖 1200x800 和 900x600, 亮色和暗色各一组.
- [x] 文件列表、路径栏、按钮文字、预览图和传输结果不重叠, 无非预期布局跳动.
- [x] 使用真实 Tauri 窗口验证文件选择、保存对话框、拖拽和 reveal 系统集成.

## 3. 风险文件与复核点

- `src-tauri/src/commands/device_files.rs`: shell 转义、路径边界、记录解析和内存上限.
- `src-tauri/src/commands/device_files.rs`: 本地临时下载和备份替换必须保证失败时不破坏已有目标文件.
- `src-tauri/src/commands/device.rs`: 共享 ADB helper 不能改变其他 commands 的 stdout/stderr 行为.
- `src/components/DeviceFileManager.tsx`: 异步请求竞态、拖拽监听 cleanup、设备切换重置.
- `src/lib/tauri.ts`: Rust/TypeScript 字段和 Tauri 参数名必须完全一致.
- `src/components/AppManager.tsx`: 删除推送时不能回归 APK 安装拖拽.
- `src/App.tsx`: 新页签不能影响现有工具、日志、应用和生码页签的挂载行为.

Diff 复核:

- [x] 无前端远端路径拼接或 shell 命令字符串.
- [x] 无静默覆盖、失败吞掉、空成功结果或自动 root.
- [x] 无旧 `push_file` 第二入口和重复下载目录常量.
- [x] 图片数据在选择、目录和设备变化时明确释放.
- [x] 测试能在删除对应实现后失败, 不写同构式或只断言 mock 调用的弱测试.

## 4. 回滚策略

- 后端命令和前端页签按阶段独立落地, 每个阶段通过构建后再进入下一阶段.
- 旧 APK 推送入口在新上传工作流通过代码验证后才移除, 在真实设备冒烟通过前不结束任务.
- 如果设备 shell 的结构化列表协议在目标 Android 版本不可用, 停止发布并记录具体设备/命令证据, 回到设计阶段选择显式兼容方案, 不添加 `ls` 文本解析 fallback.
- 本功能无数据库、配置或持久化迁移, 回滚只涉及代码和文档.

## 5. 真实设备验收记录

2026-08-28 至 2026-08-29 使用以下设备完成 ADB 边界和真实 Tauri 窗口验收:

- 物理设备 `192.168.8.4:37047`, 型号 `23113RKC6C`, Android 16.
- Android 模拟器 `emulator-5554`, AVD `Pixel_10`.

验收结果:

- [x] 用 `adb exec-out` 列举物理设备非空 `/sdcard/Download`, NUL 记录完整且最后一字节为 NUL.
- [x] `/sdcard` 和 `/data/local/tmp` 跳转成功; `/data` 权限失败后保留原路径和列表.
- [x] 隐藏、中文、空格和单引号文件名完整显示.
- [x] PNG、JPEG、GIF、WEBP 真实预览; 21 MiB 图片拒绝预览且不保留旧图.
- [x] 新建目录成功, 同名创建明确失败; 同名上传生成 `upload-same (1).txt`.
- [x] 批量上传的成功/失败数量正确; 保存对话框可改目录和文件名, 下载内容一致.
- [x] Finder 拖拽上传和 reveal 均通过; 文件选择与保存对话框取消不显示错误.
- [x] 物理设备 512 MiB 传输中切换到模拟器, 新设备立即可操作; 旧任务完成后未写回状态或解锁新任务.
- [x] 进入子目录后虚拟列表回到顶部; 双击已选图片不重复发起预览.
- [x] APK 工具将 `mqtt-controller.apk` 安装到 `emulator-5554`, UI 显示“APK 安装成功”, 包 `com.qi.mqtt_controller` 可由 `pm path` 查询.
