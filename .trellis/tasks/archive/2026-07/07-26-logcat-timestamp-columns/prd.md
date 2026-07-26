# Logcat 时间戳与列布局优化

## Goal

解决日志（Logcat）面板两个最影响日常排查的可用性问题：

1. 日志行没有时间戳，无法定位问题发生的时间点，导出的日志文件也没有时间信息。
2. tag 列只有 56px 宽（`w-14`），几乎所有 tag 都被截断，且无法基于 tag 快速过滤。

## Confirmed Facts (from codebase inspection)

- `src-tauri/src/commands/logcat.rs`：`start_logcat` 用 `adb -s <serial> logcat -T 5000 -v brief` 常驻子进程。**brief 格式本身不含时间戳**，格式为 `LEVEL/tag( pid): message`，因此前端和导出文件都拿不到时间。切换到 `-v threadtime` 即可获得 `MM-DD HH:MM:SS.mmm  PID  TID LEVEL TAG : message` 格式，时间戳来自设备端。
- `parse_logcat_line` 目前**每行都重新编译一次正则**（`Regex::new` 在函数体内），高频日志下是无谓开销；文件顶部已有 `LazyLock` 的使用先例（`LOGCAT_CHILD`），正则应同样改为 `LazyLock<Regex>`。
- 解析失败的行（如 `--------- beginning of main` 分隔行）走 fallback 分支：level 填 `I`、tag/pid 为空、message = raw。切换格式后 fallback 逻辑要保留，时间字段留空。
- `LogcatLine` 结构体（Rust）与 `src/lib/tauri.ts` 的同名 interface 需要同步加字段；事件通道 `logcat-line` 与前端 `onLogcatLine` 不需要变。
- `src/components/Logcat.tsx`：行渲染在虚拟列表内，列依次为 level（`w-3`）、tag（`w-14`，truncate + title）、pid（`w-12`）、message（flex-1 截断）。行高固定 `estimateSize: 20`。
- 前端已有三种过滤（等级阈值 / 文本搜索 / 应用 PID 过滤），全部在 `filtered` 的 `useMemo` 里叠加；新增 tag 过滤要加入同一处，并同步更新 `filterSignature`（它驱动自动滚动的 effect）。
- 导出（`handleExport`）拼接 `line.raw`。切到 threadtime 后 raw 自带时间戳，导出文件自动获得时间信息，无需改导出逻辑。

## Requirements

### 1. 时间戳

- 后端 `start_logcat` 从 `-v brief` 切换为 `-v threadtime`，解析出设备端时间戳。
- `LogcatLine` 新增 `time`（`MM-DD HH:MM:SS.mmm` 完整值）与 `tid` 字段（tid 暂不展示，仅保留数据）。
- 前端在 level 列之前新增时间列，显示 `HH:MM:SS.mmm`（去掉日期部分省宽度），悬停 title 显示含日期的完整时间。
- 解析失败的行时间列留空，raw 内容照常完整显示。
- 解析正则改为 `LazyLock<Regex>`，只编译一次。

### 2. 列布局与 tag 快速过滤

- tag 列加宽到约 160px（`w-40`），仍保留 truncate + 悬停显示完整 tag。
- 点击任意行的 tag：按该 tag **精确匹配**过滤日志。
- 生效时工具栏显示一个可清除的过滤标签（如 `tag: MyTag ×`）；点 × 或再次点击同一 tag 取消过滤。
- tag 过滤与现有等级 / 搜索 / 应用过滤叠加生效；`filtered/total` 计数正确。
- 切换设备时 tag 过滤随其他状态一并重置。

## Acceptance Criteria

- [ ] 日志行展示时间列，值来自设备端 threadtime 时间戳，格式 `HH:MM:SS.mmm`，悬停可见完整 `MM-DD HH:MM:SS.mmm`
- [ ] 分隔行等无法解析的行时间列为空，原始内容完整显示，不报错
- [ ] tag 列约 160px 宽，悬停可见完整 tag
- [ ] 点击 tag 即按精确 tag 过滤，工具栏出现可清除的标签；点 × 或再次点击同一 tag 恢复
- [ ] tag 过滤与等级 / 搜索 / 应用过滤可任意叠加，计数与自动滚动行为正常
- [ ] 导出的日志文件每行含时间戳（threadtime 原始格式）
- [ ] 现有功能不回归：暂停 / 跟随 / (+N) 计数 / 清屏 / 导出 / 应用过滤 / 等级过滤 / 搜索 / 设备切换重置
- [ ] `cargo check`（src-tauri）与前端 `tsc` 构建通过

## Notes

- 本任务为 lightweight：改动集中在 `logcat.rs`、`tauri.ts`、`Logcat.tsx` 三个文件，PRD-only，不另写 design.md / implement.md。
- 搜索增强、行展开复制、跟随 UX 等其余改进方向本次明确不做（用户仅选择了本组）。
