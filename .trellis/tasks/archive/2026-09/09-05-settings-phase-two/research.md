# 第二批代码依据

仅记录已核对现状与设计约束, 推荐行为尚未实现.

| 位置 | 现状 | 规划影响 |
| --- | --- | --- |
| src/lib/settings.ts, src/store/settings.ts | version 1, 缺失字段默认值, 保存成功后发布偏好, 损坏需显式恢复 | 扩展已有存储 |
| src/components/settings/SettingsDialog.tsx | 四组, 720 x 620 上限, dialog + Tab 边界 | 扩至七组并回归焦点/最小窗口 |
| src-tauri/src/commands/device_files.rs:14 | 默认 /sdcard/Download | null 保留默认, 不重复默认解析 |
| src-tauri/src/commands/device_files.rs:18 | 列举普通和点开头项 | 隐藏开关只改变显示过滤 |
| src-tauri/src/commands/device_files.rs:280 | 解析后固定目录优先/名称排序 | 排序收敛到前端, Rust 保留协议校验 |
| src/components/DeviceFileManager.tsx:180 | 激活和 serial 变化重置后加载 null, Home 也加载 null | 只在激活/Home 读起始目录快照 |
| src/lib/deviceFiles.ts:148 | serial/requestId 校验, list 成功清空选择/预览 | 显示偏好不派发 list-success/reset |
| src/lib/appInfo.ts:25 | zh-CN numeric collator 排名称, 包名打破平局 | 保留名称默认, 扩展维度 |
| src/components/PackageManager.tsx:148 | cache/fresh/packages 均提前排序, filtered 仅搜索 | 移除加载阶段排序, 统一显示投影 |
| src/store/codeGenerator.ts | draft 混合正文与选项, revision 记录过时, clear 回默认 | 迁出参数, 保留运行正文与生成快照 |
| src/lib/codeGenerator.ts | qr/newline 默认, 空自定义分隔符失败 | 保留解析/生成语义 |
| src-tauri/src/commands/screenshot.rs:77 | 独立目录函数, Pictures 缺失回 /tmp | 统一目录, 无默认目录时显式报错 |
| src-tauri/src/commands/screen_record.rs:34 | 开始时固定 local_path | 中途改目录只影响下次 |
| src-tauri/src/commands/screen_record.rs:89 | stop 先 take 会话, pull 后先删源再检查失败 | 保留失败会话/源, 提供恢复 |
| src/components/ScreenRecordTool.tsx:130 | pending_pull 自动 finalize | save_failed 禁止自动重试 |
| src-tauri/src/commands/device_files.rs:168 | 下载临时文件、大小比对后发布 | 复用模式, 不复用主动覆盖目标语义 |
| src-tauri/capabilities/default.json | 已有 dialog:default | 不放宽前端文件系统权限 |
| .trellis/spec/backend/quality-guidelines.md:407 | 旧合约要求 pull 失败删源, 签名部分早于第一批 | 实施时同步修订 |

复用 BlueprintSelect/lucide/useSettingsStore/原生 dialog 和 Tauri bridge. 保留 path/packageName 稳定键. 设备规范化/shell quoting 仍以原 Rust helper 为准, 本机用宿主 Path.

本轮没有操作真机或系统配置, 没有第二批功能测试结果, 只完成规划证据核对.
