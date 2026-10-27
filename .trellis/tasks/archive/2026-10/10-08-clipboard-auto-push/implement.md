# 剪贴板自动推送 - 执行计划

按 "Rust 推送链路 -> 前端设置与绑定 -> 模块 UI -> 规范与真机" 推进. 每阶段结束都要能独立验证.

## 阶段 1: Rust 写入流程拆分 (不改行为)

- [x] `commands/clipboard.rs`: `run` 拆为 `prepare(app, serial)` 和 `submit(helper, request, is_set)`, `run` 组合两者. 校验和编码仍在提交前, 共用 `validate_text`.
- [x] 现有 clipboard 单元测试全部通过, 不改测试断言.

验证: `cargo test --manifest-path src-tauri/Cargo.toml clipboard`.
回滚点: 本阶段可单独提交; 出问题直接回退该提交.

## 阶段 2: Rust 自动推送模块

- [x] `Cargo.toml`: macOS 目标依赖加 `objc2-app-kit` (0.3, `NSPasteboard` feature, 与依赖树版本一致); `windows-sys` 加 `Win32_System_DataExchange`.
  - 实现补充: macOS 另加 `objc2 = "0.6"` (用 `autoreleasepool`); macOS / Windows 加 `arboard = "3"` (见下方 "偏离设计"). 三者都已在依赖树中, 版本不变.
- [x] `commands/clipboard_auto_push.rs`:
  - [x] `change_count()` 平台实现 (macOS / Windows), Linux 不编译该函数; 确认 `NSPasteboard` 线程约束. (objc2-app-kit 0.3.2 中 `NSPasteboard` 未标记 MainThreadOnly, `generalPasteboard` / `changeCount` 为 safe fn, 可在任意线程调用, 无需 `run_on_main_thread`.)
  - [x] 托管状态 `Mutex<{ generation, target }>`; `set_clipboard_auto_push`, `get_clipboard_auto_push_support` 命令. (实现为 `Arc<AtomicU64>` generation; Rust 不需要保存 target, 任务按值持有 serial.)
  - [x] 后台任务: 500 ms 轮询, 基线, 读文本 (`spawn_blocking` + 插件 `ClipboardExt::read_text`), 256 KiB 检查, 同代哈希去重, 提交前 / 提交后核对 generation, 状态事件.
  - [x] 把 "计数源 / 读文本 / 写入" 抽成可注入依赖, 循环逻辑做成可单测的纯状态机, 不在测试里起 adb.
- [x] `error_codes.rs`: `CLIPBOARD_AUTO_PUSH_UNSUPPORTED`, `CLIPBOARD_HOST_READ_FAILED`.
- [x] `lib.rs`: 注册状态和两个命令.

单元测试 (Rust):

- [x] 启动时记录基线, 基线之前的内容不推送.
- [x] 计数变化 -> 推送一次; 计数不变 -> 不读取文本.
- [x] 同代内同一文本不重复推送; 换代后同一文本会推送.
- [x] 推送期间计数多次变化 -> 结束后只推最新文本.
- [x] 失败后不重试同一计数; 再次变化后可推送; 失败不更新去重哈希.
- [x] `prepare` 之后 generation 已变 -> 不调用 `submit`, 不发事件.
- [x] `submit` 返回时 generation 已变 -> 不发事件.
- [x] 空文本 / 非文本 -> `skipped(no_text)`; 超限 -> `skipped(too_large)`, 都不调用写入.
- [x] 事件序列化不含文本字段.

验证:

```bash
cargo test --manifest-path src-tauri/Cargo.toml
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets
cargo check --manifest-path src-tauri/Cargo.toml --target x86_64-pc-windows-msvc
```

Windows 目标若本机未安装, 先 `rustup target add x86_64-pc-windows-msvc`; 若 `cargo check` 因 C 依赖无法交叉编译, 记录阻塞点, 由 CI Windows 构建兜底验证, 不跳过不说明.

结果 (2026-10-19, 云端 Linux 容器):

- `cargo test`: 162 passed (新增 14 个 `clipboard_auto_push::watcher` 测试). `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings` 通过.
- 阻塞: `cargo check --target x86_64-pc-windows-msvc` 失败于 `ring v0.17.14` 构建脚本: `error occurred in cc-rs: failed to find tool "lib.exe"` (缺 MSVC 工具链 / Windows SDK).
- 阻塞: `cargo check --target aarch64-apple-darwin` 失败于 `objc2-exception-helper v0.1.1` 构建脚本: 宿主 `cc` (GCC) 不认识 `-arch arm64` / `-mmacosx-version-min=11.0` (缺 Apple clang / macOS SDK).
- 补充证据 (不替代上面两项): 只含 `windows-sys` / `objc2` / `objc2-app-kit` / `arboard` 的临时 crate 对两个 target 类型检查通过, 覆盖 `change_count` 和读文本代码; 临时把 `NativeIo` 在 Linux 上编译 (平台读取打桩) 后 `cargo clippy -- -D warnings` 通过, 覆盖 trait 实现和 `Send` 约束. 两个平台的真实编译由打包构建验证.

## 阶段 3: 前端设置, 绑定与状态

- [x] `lib/settings.ts`: `clipboard: { autoPush }`, 默认值, 解码 (`flag`). 不提升版本.
- [x] `lib/settingsSections.ts`: `general` 增加 `clipboardAutoPush` 行 (标签, 说明, `modified`); 确认 `sectionResetPlan("general")` 覆盖它.
- [x] `lib/tauri.ts`: `setClipboardAutoPush`, `getClipboardAutoPushSupport`, `onClipboardAutoPushStatus`, 事件类型.
- [x] `store/clipboardAutoPush.ts`: 运行时 store (不持久化), generation 过滤, 状态推导.
- [x] `hooks/useClipboardAutoPush.ts`: 目标推导, 过期返回丢弃, 卸载停止; 在 `App.tsx` 根部挂载.
- [x] i18n: `settings.rows.clipboardAutoPush.*`, `tools.clipboardTool.autoPush.*` 中英文; 新错误码进 `backend-en.ts`, `backend-zh-CN.ts`, `backendErrorContract.ts`.
- [x] `scripts/screenshots/mock-tauri.js`: 新命令和事件的 mock, 支持切换 `supported`.

单元测试 (vitest):

- [x] 设置: 缺省为 `false`, 非布尔报 `settings.invalidField`, 重启持久化, general 分区重置和全局重置恢复为 `false`.
- [x] 目标推导: 关闭 / 设置不可用 / 设备离线 / 不支持 -> `null`; A -> B -> A 产生三次调用; 同一 `contextKey` 重渲染不重复调用.
- [x] 过期的 `setClipboardAutoPush` 返回不覆盖新 generation; 旧 generation 事件被忽略.
- [x] 卸载时调用 `setClipboardAutoPush(null)` 并释放事件监听.

验证: `pnpm test`, `pnpm build`.

实现补充: 目标推导和请求队列放在纯控制器 `lib/clipboardAutoPush.ts` (Node 环境无 jsdom, hook 只做转发); store 额外缓存 "命令返回前到达的新一代事件" (`early`), 返回后按 generation 应用或丢弃. 结果: `pnpm test` 589 passed, `pnpm build` 通过.

## 阶段 4: 模块 UI 与设置行

- [x] `ClipboardTool.tsx`: 开关行 (`Switch`, 整行可点, 调用 settings `update("clipboard", ...)`), 状态行 (`role="status"`), 禁用条件.
- [x] `GeneralSection.tsx`: `SettingSwitchRow id="clipboardAutoPush"`, 不支持时禁用并替换说明.
- [x] 组件测试: 每种状态的文案 (中英文), 开关与设置行写同一个 action, 不支持时两处都禁用, 失败状态不调用 `showToast`.
- [x] `ToolLocalization.test.tsx` / SSR 设置测试覆盖新行.

浏览器冒烟 (内置浏览器 + `mock-tauri.js`, 1200x800 与 900x600, 亮/暗):

- [x] 工具页剪贴板模块: 开关切换, 状态行 (监听中 / 已推送 / 锁屏失败 / 超限) 显示, 无横向溢出.
- [x] 设置 > 通用: 新行显示, 与模块开关同步, 分区重置恢复关闭.
- [x] `supported=false` 时两处禁用并显示暂不支持.
- [x] `smoke.mjs` 增加上述断言, `pnpm test:browser` 通过.
  - 注: 云端环境 `pnpm test:browser` 原样运行失败: playwright 1.63 需要 `chromium_headless_shell-1243`, 环境只预装 1194, 且环境规定不得 `playwright install`. 用不改仓库的包装脚本把 `chromium.launch` 的 `executablePath` 指向预装 Chromium 141 后, `smoke.mjs` (23 项) 和 `toolDragSmoke.mjs` (9 项) 全部通过. 自动推送断言覆盖 900x600 / 1200x800, 亮 / 暗, 中 / 英.
  - `ToolLocalization.test.tsx` 未改: 它已渲染 `ClipboardTool` 英文态; 新行的 SSR 覆盖在 `ClipboardTool.test.tsx` 和 `ownership.test.tsx`.

## 阶段 5: 规范更新

- [x] `.trellis/spec/frontend/settings-clipboard.md`: 修订 "不轮询" 契约, 增加自动推送设置, 目标推导, generation 过滤, 测试要求.
- [x] `.trellis/spec/backend/clipboard.md`: 增加自动推送小节和 `prepare` / `submit` 拆分说明.

## 阶段 6: 打包应用真机验证 (macOS + Redmi K70)

> 历史状态 (2026-10-19): 云端未执行, 需要 macOS 打包应用和 Android 真机.
> 当前状态 (2026-10-21): 常规原生路径全部通过, 隐私预览的系统授权交互未完成. 详见 [validation.md](./validation.md).

构建: `pnpm tauri build --bundles app -c '{"bundle":{"createUpdaterArtifacts":false}}'`, 安装到 `/Applications`, 用 LaunchServices 启动.

- [x] 开关默认关闭; 关闭时复制文本, 手机剪贴板不变.
- [x] 打开开关, 当时剪贴板里的内容不推送.
- [x] 在 TextEdit 实际复制新文本, 不切回本应用, 手机回读一致; 常规复制延迟均小于 2 秒.
- [x] 重复复制同一文本不再推送 (状态时间不变); 连续快速复制 5 段, 手机得到最后一段.
- [x] 本应用最小化 5 分钟以上, 复制新文本仍推送成功; 被其他窗口完全遮挡时同样成功.
- [x] 手机锁屏 -> 复制 -> 模块显示锁屏原因, 无 toast; 解锁后旧内容未补发, 复制新文本 714 ms 成功.
- [x] 复制图片 -> 显示 "不是文本"; 复制超过 256 KiB 文本 -> 显示超限, 手机剪贴板不变.
- [x] 拔掉 USB -> 显示等待设备在线; 重新插上 -> 不推送已有内容, 新复制 734 ms 可推送.
- [x] 重启应用, 开关保持打开且自动恢复监听; 启动前旧内容不会补推.
- [x] 手动 "推送到手机" / "复制到电脑" 行为不变.
- [ ] macOS 隐私预览授权后复测: 已开启测试 key 并重启, 原生调用等待系统授权, 用户未确认可用提示/允许结果, 未记通过. 测试 key 已恢复原来的不存在状态, 受阻实例已完整回收, 常规路径复测 807 ms 成功.
  - 2026-10-22 复测: 系统预览在 27.0.1 上不显示授权界面, 最小 AppKit 探针 (主线程, 前台, Team ID 签名) 同样无限等待, 本机无法完成, 不属于应用缺陷. 恢复默认后新包 916 ms 推送成功. 详见 validation.md.
- [x] 测试结束恢复用户原有设置 (`adb-gui-settings`) 和两端完整剪贴板, 并清理临时文件和进程.

未覆盖项必须在测试记录中写明: Windows 真机, Linux 真机 (只验证禁用态), 无线连接.

## 2026-10-26 Windows release 补验

- [x] 实际 NSIS/MSI 0.1.11 构建、安装、启动及卸载；恢复原 0.1.10 安装的 10 个文件、卸载项与两个快捷方式，文件和快捷方式哈希逐一一致。
- [x] 安装版中英文锁屏 UI、无 toast、解锁不补发、新复制恢复（761ms）。
- [x] Windows 真机 + 模拟器并发，三画质、六开关 UI/argv、额外参数、自定义路径、transport 断连恢复和退出回收；详见 validation.md 最新小节。
- [x] 手机 ClipData 和触摸/保持唤醒设置恢复，测试进程、监听端口和设备端探针清理。
- [ ] 电脑原剪贴板恢复失败：控制运行时超时重置导致唯一内存备份丢失，已告知用户并停止写入。此项不沿用前轮恢复通过结论。
- [x] 同日晚间用户接线后，用安装版完成 Windows USB 真机投屏、物理拔线清理、插回自动识别、手动重开投屏/日志和退出回收；再次完整恢复原安装。此阶段关闭剪贴板同步，不新增剪贴板重连验收结论。
- [ ] 物理 WiFi 中断/端口变化、两台物理手机、Linux 原生、置顶/无音频独立行为测量未测。
- [ ] 旧临时目录删除被自动审批拒绝；本轮目录保留日志/备份。macOS 隐私预览授权仍待补验，任务不归档。

## 2026-10-27 结项

- [x] 用户确认验收完成, 修复经 #15 合入 main, 随 v0.1.12 发布; 任务归档.
- 上面未勾选的项目保持原状, 作为已知未覆盖范围, 不再阻塞归档: macOS 隐私预览授权, Linux 原生, 物理 WiFi 中断/换端口, 两台物理手机, 置顶/无音频独立测量, 剪贴板自动推送的 USB 重连去旧内容复验.

## 风险文件

- `src-tauri/src/commands/clipboard.rs`: 拆分可能改变手动写入的错误映射 (`write_failure`), 阶段 1 用现有测试兜住.
- `src/lib/settings.ts`: 解码新增字段, 错误时整个设置不可用, 必须有缺省值测试.
- `src/App.tsx`: 根部挂载 hook, 注意 StrictMode 双调用下的过期返回丢弃.

## 继续实现前需要确认

- 无. 4 项产品决策已在 PRD "已确认决策" 中记录.

## 偏离设计

- 读电脑剪贴板文本用 `arboard` (剪贴板插件内部用的同一个库, 版本 3.6.1 不变), 不用插件的 `ClipboardExt::read_text`. 原因: 插件把 arboard 错误压成英文字符串 (`Error::Clipboard(String)`), 要区分 "不是文本" (`skipped(no_text)`) 和 "读取失败" (`clipboard.hostReadFailed`) 只能匹配英文文案, 违反 `settings-clipboard.md` "不按英文文本分类插件错误" 的规定. `arboard::Error::ContentNotAvailable` 是类型化的.
- `setClipboardAutoPush` 只把 `{ serial }` 发给 Rust; `contextKey` 只在前端决定何时重新绑定. Rust 的 `Target` 用 `deny_unknown_fields`.
- 前端运行时状态里只有 `pushed` 带时间, `skipped` / `failed` 不带 (状态行不显示它们的时间). 事件本身仍带 `at`.
- 开关关闭 (`off`) 时不渲染 `role="status"` 区域, 与设计 "off 不显示状态行" 一致; 绑定进行中渲染空行保持高度.
