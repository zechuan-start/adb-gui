# 端口转发

## Goal

在工具 Tab 管理当前设备的 `adb forward` / `adb reverse` 规则：查看列表、新增、删除；切换设备时列表自动刷新。

## Confirmed Facts

- 所有 adb 调用走 `run_adb_with_serial`（`device.rs`）。
- forward/reverse 规则是** per-device** 的；必须带 `-s <serial>`。
- 原 PRD P1-6 命令：
  - `adb forward --list` / `adb reverse --list`
  - `adb forward tcp:L tcp:R` / `adb reverse tcp:R tcp:L`
  - `adb forward --remove tcp:L` / `adb reverse --remove tcp:R`

## Requirements

### 列表

- 工具 Tab「端口转发」卡片展示当前设备全部规则，表格列：
  - 方向（forward / reverse）
  - 本机端口
  - 设备端口
  - 删除按钮
- 进入卡片或 `selectedDevice` 变化时自动刷新列表。
- 无规则时显示空态文案。

### 新增

- 表单：方向下拉（forward / reverse）+ 本机端口 + 设备端口 +「添加」。
- 端口校验：1–65535 整数；非法输入 inline 提示，不发起 adb。
- 添加成功后刷新列表并 toast；adb 报错 toast stderr。

### 删除

- 每行删除按钮，无需二次确认（转发规则可逆、低风险）。
- 删除成功后刷新列表。

### 设备上下文

- 无设备 / offline：列表空态 + 表单 disabled。

## Acceptance Criteria

- [x] 可新增 forward 规则并在列表展示。
- [x] 可新增 reverse 规则并在列表展示。
- [x] 列表与 `adb forward --list` / `adb reverse --list` 一致（针对当前 serial）。
- [x] 可删除单条规则，删除后列表更新。
- [x] 切换设备后列表刷新为新设备规则。

## Verification Notes

- 真机 serial: `z5rc4hobfelv9tvc`。
- smoke: `forward tcp:49381 tcp:49382` 和 `reverse tcp:49384 tcp:49383` 新增、列表、删除、清理通过。
- 当前只有一台设备；切换设备刷新由 `selectedDevice` 变化触发，做了代码路径和构建检查，未做双设备真机对照。

## Out of Scope

- `adb forward --list` 中其他 transport（非 tcp）的可视化
- unix/localabstract 转发
- 批量导入/导出规则
- 持久化常用规则模板
