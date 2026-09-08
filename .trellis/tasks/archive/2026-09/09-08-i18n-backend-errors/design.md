# 后端错误码化设计

架构总纲与跨层契约见 [父任务 design.md](../09-08-i18n-bilingual/design.md).

## Rust 侧类型

```rust
#[derive(Debug, Clone, serde::Serialize)]
pub struct AppError {
    pub code: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub params: Option<serde_json::Map<String, serde_json::Value>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub detail: Option<String>,
}
```

配套构造辅助, 让调用点保持简短:

```rust
impl AppError {
    pub fn new(code: &str) -> Self
    pub fn with(code: &str, params: serde_json::Value) -> Self
    pub fn detail(mut self, detail: impl Into<String>) -> Self
}
```

典型改造:

```rust
// 改造前
.map_err(|error| format!("上传文件到设备失败: {error}"))?
// 改造后
.map_err(|error| AppError::new("files.uploadFailed").detail(error.to_string()))?
```

```rust
// 改造前
return Err(format!("图片超过 20 MiB 预览上限: {expected_size} 字节"));
// 改造后
return Err(AppError::with("files.previewTooLarge", json!({ "bytes": expected_size })));
```

`?` 传播链上的 `String` 错误较多, 加一个 `From<String> for AppError` 会让漏改静默通过, 因此**不实现** `From<String>`, 强制每处显式给码.

## code 命名

与前端词典路径一一对应: `<模块>.<动作或原因>`, 例如 `files.uploadFailed`, `files.previewTooLarge`, `clipboard.readFailed`, `recording.saveFailed`, `wifi.connectFailed`, `device.notFound`.

在 Rust 侧集中定义为常量 (`src-tauri/src/commands/error_codes.rs` 或各文件顶部常量), 避免字符串散落. 前端 `errors` 词典按同一路径组织, review 时两份清单对照.

## detail 的边界

`detail` 承载 adb stderr, `io::Error` 文本, 序列化失败信息等. 规则:

- 只放机器/工具产出的原文, 不放中文句子.
- 不放敏感信息 (本任务范围内无凭据类数据).
- 前端展示为"译文 + detail", detail 用等宽或次级样式, 不翻译.

## 前端消费

- `lib/tauri.ts` 的 `invoke` 调用统一经过 `toAppError` 归一化. Tauri 的 `invoke` 在 `Err` 时抛出的是序列化后的值, 拿到对象就直接用; 拿到字符串 (漏改的命令, 或插件自身的错误) 归到 `errors.unknown` 并把原文放 `detail`.
- 跨进程事件里的失败信息 (`LogcatExit.detail`, `DeviceMetricsExit.detail`, `ScreenRecordStatus.error`) 的字段类型改为 `AppErrorPayload | null`, 由 Rust 侧同样构造. 这几处是"长期停留"的错误状态, 必须存码而不是存译文, 否则语言切换后不会变.
- `store` 层只存 `AppErrorPayload`, 组件渲染时 `translateError(payload, t)`.

## 分批与兼容

`toAppError` 的兜底路径让改造可以分批合入: 已改的命令走结构化错误, 未改的仍是字符串, 界面退化为 `errors.unknown` + 中文原文, 不崩溃. 因此按文件分批, 每批 `cargo check` + 手工触发一条该文件的失败路径.

按文案量排批次, 大文件单独成批:

1. `device_files.rs` (70)
2. `clipboard.rs` (32)
3. `screen_record.rs` + `capture_output.rs` (45)
4. `wifi.rs` + `bug_report.rs` + `image_file.rs` + `device_info.rs` + `app_info.rs` + `screenshot.rs` + `app.rs` + `lib.rs` (34)

## 需要注意的具体位置

- `device_files.rs:19,23` 的中文文案在 shell 脚本片段里 (`echo "路径不是可访问目录: $target" >&2`), 由设备端 shell 输出后被 Rust 读取. 这类要么改为稳定的英文标记串再由 Rust 映射成 code, 要么保留原样进 `detail`. 推荐前者: shell 输出稳定标记 (如 `ERR_NOT_A_DIR`), Rust 识别后转成 code, 避免把中文塞进 `detail`.
- `screen_record.rs` 的保存失败路径与 `ScreenRecordStatus` 状态机耦合, 改造时确认 `phase: "save_failed"` 下的 `error` 字段类型同步变更, 且重试/另存为/放弃三条动作的错误也码化.
- `app.rs:96` `无法找到 {pkg} 的启动 Activity` 是带参文案, 参数 `pkg` 必须进 `params`, 不能拼进 code.
