# 新增 APK 推送到设备功能

## Goal

在现有 ADB GUI 桌面工具中, 允许用户将本地 APK 原样推送到当前在线设备的下载目录, 用于后续手动分发或设备端处理, 不触发 APK 安装.

## Confirmed Facts

- 现有“APK 安装”工具已经支持文件选择和单个 APK 拖拽.
- 所有设备操作都必须使用当前选择设备的 serial.
- 前端通过 `src/lib/tauri.ts` 调用 Tauri command, 后端统一通过 `run_adb_with_serial` 执行 ADB.
- Android 设备端目标目录固定使用 `/sdcard/Download`.

## Requirements

- 在现有 APK 工具中提供“安装”和“推送”两种明确模式, 默认保持现有“安装”模式.
- 推送模式复用现有 APK 文件选择和拖拽能力, 一次只处理一个 `.apk` 文件.
- 推送时执行设备作用域的 ADB push, 目标路径为 `/sdcard/Download/<本地原文件名>`.
- 推送动作不得调用 package manager, 不得安装或启动 APK.
- 操作期间禁用重复触发, 成功时显示设备端完整路径, 失败时显示可读错误.
- 未选择在线设备时保持操作禁用并提示先选择设备.

## Acceptance Criteria

- [x] 默认进入“安装”模式, 现有 APK 安装行为保持不变.
- [x] 切换到“推送”模式后, 选择或拖入单个 APK 会推送到 `/sdcard/Download/<原文件名>`.
- [x] 推送成功后, 卡片状态和全局 toast 都显示设备端完整路径.
- [x] 推送过程中无法重复触发安装或推送.
- [x] 非 APK 文件、多 APK 和离线/未选择设备仍有明确反馈.
- [x] TypeScript 构建、Rust 格式检查和 Clippy 检查通过.

## Out Of Scope

- 自定义设备端目录.
- 推送任意类型文件或批量文件.
- 推送后自动安装、打开文件管理器或启动系统安装器.
