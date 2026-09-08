# 后端错误码化与前端翻译

父任务: [界面中英双语与语言设置](../09-08-i18n-bilingual/prd.md) · 架构: [design.md](../09-08-i18n-bilingual/design.md)

依赖: [i18n-foundation](../09-08-i18n-foundation/prd.md) 定下的 `AppErrorPayload` 契约. 与子任务 2/3 无文件重叠, 可并行.

## 交付边界

Rust 命令不再返回面向用户的中文句子, 改为返回错误码 + 结构化参数 + 不翻译的原始细节; 文案落到前端 `errors` 词典. 完成后英文用户能读懂每一条失败提示, 同时保留 adb / OS 的原始输出用于排查.

涉及 12 个 Rust 文件约 181 处文案, 其中 `device_files.rs` (70), `clipboard.rs` (32), `screen_record.rs` (28), `capture_output.rs` (17) 占大头.

## 范围内

- Rust 侧 `AppError` 类型与 serde 序列化, 命令签名从 `Result<T, String>` 改为 `Result<T, AppError>`.
- 12 个命令文件的错误构造改造.
- 前端 `errors` 词典 (中英两份) 与 `translateError` 的完整映射.
- 前端归一化层 `toAppError` 的兜底路径.
- 长期停留的错误状态改存错误码: `ScreenRecordStatus.error`, `LogcatExit.detail`, `DeviceMetricsExit.detail` 等跨进程事件的失败信息.

## 范围外

- 不改命令的成功返回结构, 不改事件名, 不改 adb 调用逻辑.
- 不翻译 adb / OS 原始输出 (放 `detail`, 原样展示).
- 不改 Rust 侧的原生菜单文案 (子任务 1 已处理).
- 不动 `scripts/build-app-info-dex` 里的 Java 代码.

## 验收标准

- [ ] 英文界面下触发以下真实失败路径, 提示为英文且含可诊断细节:
  - 设备断开时上传文件.
  - 读取无权限的设备目录.
  - 预览超过 20 MiB 上限的图片.
  - 录屏保存到不可写目录.
  - 剪贴板读取失败.
  - 连接一个不可达的 WiFi 地址.
- [ ] 同样六条路径在中文界面下文案与改造前逐字一致.
- [ ] 错误提示里的设备路径, 包名, 字节数等参数正确带入, 不出现 `undefined` 或空占位.
- [ ] adb / OS 原始输出仍可见 (拼在译文之后或可展开), 不因为码化而丢失排查信息.
- [ ] 语言切换后, 界面上停留的失败状态 (录屏保存失败横幅) 同步变为另一种语言.
- [ ] 故意让某个命令返回裸字符串错误时, 界面显示 `errors.unknown` 兜底提示而不是崩溃或空白.
- [ ] `cargo check` 与 `cargo test` (若有) 通过; `pnpm test` 通过.
- [ ] `errors` 命名空间下每个 code 在两份词典中都有对应词条 (由类型保证, 并在 review 时核对 code 常量表).
