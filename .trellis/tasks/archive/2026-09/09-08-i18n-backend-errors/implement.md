# 后端错误码化实施计划

## 阶段 1: 契约落地

1. 新建 `src-tauri/src/error.rs`: `AppError` 结构与构造辅助. 不实现 `From<String>`.
2. 新建 code 常量表 (`src-tauri/src/commands/error_codes.rs`).
3. 前端 `src/i18n/messages/*` 补 `errors` 命名空间骨架; `translateError` 打通.
4. `lib/tauri.ts` 的 `invoke` 统一走 `toAppError`.

验证: `cargo check`; `pnpm test`; 手工让一个命令返回裸字符串, 确认界面显示 `errors.unknown` 兜底而不是崩溃.

## 阶段 2: device_files.rs (70 行)

5. shell 片段的中文输出改为稳定标记串, Rust 侧映射成 code.
6. 全文件错误构造改造, 参数进 `params`, 原始错误进 `detail`.
7. 前端 `errors.files.*` 中英词条补齐.

验证: `cargo check`; 英文下触发无权限目录, 上传断连, 预览超限三条路径.

## 阶段 3: clipboard.rs (32 行)

8. 改造 + 前端 `errors.clipboard.*`.

验证: 英文下触发一次剪贴板读取失败与一次写入失败.

## 阶段 4: screen_record.rs + capture_output.rs (45 行)

9. 改造 + `ScreenRecordStatus.error` 字段类型改 `AppErrorPayload | null`.
10. 前端录屏失败横幅改为渲染时翻译.

验证: 英文下把保存目录指向不可写位置, 触发保存失败, 确认三种恢复动作可用; 切换语言确认横幅同步变化.

## 阶段 5: 其余七个文件 (34 行)

11. `wifi.rs`, `bug_report.rs`, `image_file.rs`, `device_info.rs`, `app_info.rs`, `screenshot.rs`, `app.rs`, `lib.rs`.
12. `LogcatExit.detail` 与 `DeviceMetricsExit.detail` 的类型同步改造.

验证: 英文下连一个不可达 WiFi 地址; 启动一个不存在启动 Activity 的应用.

## 阶段 6: 收口

13. 全仓搜索确认 `src-tauri/src/**` 内已无面向用户的中文文案 (菜单项除外).
14. 中文界面下重跑六条失败路径, 逐字对照改造前文案.
15. 记录 `validation.md`.

## 风险与回滚

| 风险 | 应对 |
| --- | --- |
| `?` 传播链上漏改, 静默变成 unknown | 不实现 `From<String>`; 阶段 6 全仓搜索兜底 |
| 参数漏进 `params`, 英文提示出现空位 | 每条带参词条在验收里实际触发一次, 不靠读代码确认 |
| shell 标记串与 Rust 映射不一致 | 标记串定义为 Rust 常量, shell 片段由同一常量拼出 |
| 录屏状态机字段类型变更影响保存流程 | 阶段 4 单独提交, 完整走一遍录屏保存/失败/重试/另存为/放弃 |

阶段 1 的兜底层让后续每个阶段都可独立合入与回滚, 未改造的命令始终能正常显示提示.
