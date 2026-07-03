# 实现计划：端口转发

预计工作量：小（~1 会话）。无子任务依赖。

## Agent Brief

- 分配给：Agent A。
- 目标：实现当前设备 `adb forward` / `adb reverse` 的列表、新增、删除核心能力。
- 可修改：`src-tauri/src/commands/port_forward.rs`, `src/components/PortForwardTool.tsx`。
- 需要声明给 Integration 的共享入口：
  - `src-tauri/src/commands/mod.rs`：`pub mod port_forward;`
  - `src-tauri/src/lib.rs`：注册 `list_port_forwards`, `add_port_forward`, `remove_port_forward`
  - `src/lib/tauri.ts`：新增 `ForwardRule`, `listPortForwards`, `addPortForward`, `removePortForward`
  - `src/App.tsx`：工具 Tab 挂载 `<PortForwardTool />`
- 不处理：录屏、Bug 收集、工具 Tab 最终 grid 排版。

## Step 1 — 后端 `port_forward.rs`

- [x] 新建 `src-tauri/src/commands/port_forward.rs`
- [x] 定义 `ForwardRule` + `parse_forward_list(output, serial, direction)`
- [x] 实现 `list_port_forwards(app, serial)`
- [x] 实现 `add_port_forward(app, serial, direction, local_port, remote_port)` — direction 仅接受 `"forward"` | `"reverse"`
- [x] 实现 `remove_port_forward(app, serial, direction, port)` — forward 删 local；reverse 删 remote（设备侧端口）
- [x] `commands/mod.rs` 加 `pub mod port_forward;`
- [x] `lib.rs` 注册三个命令
- [x] `cd src-tauri && cargo check`

## Step 2 — 前端封装

- [x] `src/lib/tauri.ts` 新增类型 `ForwardRule` + `listPortForwards` / `addPortForward` / `removePortForward`

## Step 3 — UI 组件

- [x] 新建 `src/components/PortForwardTool.tsx`（列表 + 表单 + 刷新）
- [x] `App.tsx` 工具 Tab grid 加入 `<PortForwardTool />`（建议第三行或与 Deep Link 同行，实现时按布局微调）

## Step 4 — 验证

- [x] `npm run build`
- [x] 真机验证：`adb forward tcp:49381 tcp:49382` 和 `adb reverse tcp:49384 tcp:49383` 新增、列表、删除、清理通过
- [x] 对照 `prd.md` Acceptance Criteria（当前只有一台设备，切换设备刷新由 `selectedDevice` 变化触发刷新，未做双设备实测）
- [x] `trellis-check`

## 风险 / 回滚

- `--list` 输出格式因 adb 版本略有差异；解析失败时 fallback 展示 raw 行。
- 可整模块 revert，无耦合。
