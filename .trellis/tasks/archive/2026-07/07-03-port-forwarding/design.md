# 设计文档：端口转发

## 架构

沿用现有分层，新增 `src-tauri/src/commands/port_forward.rs` + `src/components/PortForwardTool.tsx`。

```
PortForwardTool.tsx
  → lib/tauri.ts (list/add/remove)
    → port_forward.rs #[command]
      → run_adb_with_serial
```

## 数据契约

### ForwardRule

```rust
#[derive(Serialize, Clone)]
pub struct ForwardRule {
    pub direction: String,   // "forward" | "reverse"
    pub local_port: String,  // tcp 本地端口
    pub remote_port: String, // tcp 远端端口
    pub raw: String,         // adb --list 原始行，便于调试
}
```

### 命令

| 命令 | 参数 | adb |
|------|------|-----|
| `list_port_forwards` | `serial` | `forward --list` + `reverse --list` |
| `add_port_forward` | `serial, direction, local, remote` | `forward tcp:L tcp:R` 或 `reverse tcp:R tcp:L` |
| `remove_port_forward` | `serial, direction, local_port` | `forward --remove tcp:L` 或 `reverse --remove tcp:R` |

> **reverse 删除键**：`adb reverse --remove` 的参数是 **remote（设备侧）端口**，与 `reverse tcp:R tcp:L` 的第一个端口一致。UI 表格应保存 direction + 两个端口，删除 reverse 时传 `remote_port`。

### 解析 `--list` 输出

`adb forward --list` 典型行：

```
emulator-5554 tcp:8080 tcp:8080
```

解析：命令调用已经带 `-s <serial>`，输出可视为当前设备范围；不要依赖第一列一定等于 serial，直接提取行内两个 `tcp:PORT` 对。

`adb reverse --list` 典型行：

```
UsbDevice tcp:8080 tcp:8080
```

同样提取两个 tcp 端口；direction 标记为 `reverse`。真机上第一列可能是 transport label（如 `UsbFfs`），不是设备 serial。

空输出 → 返回 `Vec::new()`。

## 前端

- 组件内 state：`rules: ForwardRule[]`, `loading`, `direction`, `localPort`, `remotePort`, `busy`.
- `useEffect([selectedDevice])` → `listPortForwards(serial)`.
- 端口输入 `<input type="number" min={1} max={65535}>`，提交前 JS 校验。
- 样式对齐 `ScreenshotTool.tsx` section 卡片；表格用紧凑 `text-xs` + border rows。

## 兼容性 / 回滚

- 纯新增模块，不影响现有命令。
- 回滚：删除 `port_forward.rs`、组件、`lib.rs` 注册行。
