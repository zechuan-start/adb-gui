# 设备列表合并同一设备的多传输连接

## Goal

一台设备同时通过 USB 和 WiFi 连接时，`adb devices` 会返回两条不同 serial，
设备下拉里就出现两条看起来是两台设备的条目（`DevicePicker.tsx:27-32`）。
用户不知道它们是同一台，切来切去还会让加载中的操作互相打断。

本任务把同一台物理设备的多条传输合并成**一条**列表项，并在条目上标明
「有哪些连接方式」和「当前正在用哪条」。

## Confirmed Facts（代码库已确认）

- `list_devices`（`device.rs:88`）解析 `adb devices -l`，返回
  `DeviceInfo { serial, state, model, transport, is_network, alias_identity }`。
- **现有去重只处理 mDNS 端口别名**（`device.rs:128-136`）：把
  `xxx._adb-tls-connect._tcp` 和它的 `:port` 变体收敛成一条。
  USB 与 WiFi 是两条完全不同的 serial，不在这个逻辑覆盖范围内。
- **`DeviceInfo` 里没有任何可以判定"同一台物理设备"的字段**。`model` 不行
  （同型号两台会误合并），`alias_identity` 只对 mDNS 设备有值。
- **设备列表没有轮询**：`listDevices()` 只在 App 启动（`App.tsx:95`）、
  手动点刷新（`TopBar.tsx:142`）、WiFi 连接成功后（`WifiConnect.tsx:57`）调用。
  所以在 `list_devices` 里为新出现的设备做一次 getprop 代价可忽略。
- `selectedDevice` 是一个**裸 serial 字符串**，全应用所有面板都靠
  `getDeviceBySerial(devices, selectedDevice)` 拿设备再取 `.serial` 发命令。
  改成"设备组 ID"会波及十来个文件。
- `getPreferredSelectedDeviceSerial`（`device.ts:44-77`）已经有一套
  "选中的设备掉线后按 `alias_identity` 找同一台的在线条目"的回退逻辑，
  本任务要扩展的正是这套机制。
- UI 现状：`DevicePicker.tsx` 的下拉项是 `min-h-[52px]`、菜单宽 `292px`，
  左侧两行（型号 / serial）、右侧一行状态标签；收起态在
  `clamp(190px,32vw,292px)` 宽度里显示「状态方块 + 型号 + serial」。
- **术语**：仓库 UI 统一用 "WiFi"（`WifiConnect.tsx` 里 8 处），
  不要写成 WLAN / 无线 / Wi-Fi。

## Requirements

### 身份识别

1. `DeviceInfo` 新增 `device_id: string | null`，由 Rust 侧解析：
   `getprop ro.serialno`，为空则 `ro.boot.serialno`，都拿不到 → `null`。
2. 只对 `state == "device"` 的条目解析。unauthorized / offline 拿不到属性，
   一律 `null`。
3. Rust 侧按 serial 缓存解析结果，避免每次 `list_devices` 都发 getprop。
   缓存在设备从列表消失、或状态离开 `device` 时失效
   （设备重新授权后要能重新解析）。
4. `device_id` 为 `null` 的条目**一律不参与合并**，按现状各自成条。
   拿不到身份就不猜——误合并两台设备比不合并严重得多。

### 合并与主传输

5. `device_id` 相同的多条 `DeviceInfo` 合并成一条列表项。
6. 每条合并项有一个**主传输**，它的 serial 就是这条列表项对外的 serial。
   优先级：USB（`is_network == false`）优先于网络；同类之间在线优先。
7. `selectedDevice` **仍然是裸 serial 字符串**，就是主传输的 serial。
   合并是展示层的事，不引入设备组 ID，不改动任何面板取 serial 的方式。
8. 主传输断开时（例如拔掉 USB 线），选中项自动落到同一 `device_id` 的
   另一条在线传输上，不能变成"未选择设备"。
   扩展 `getPreferredSelectedDeviceSerial` 现有的 `alias_identity` 回退逻辑。

### UI

9. 下拉项要同时表达两件事：**有哪些连接方式**、**当前用的是哪条**。
   用 lucide 的 `Usb` / `Wifi` 图标：当前使用的用 `text-ink`，
   可用但未使用的用 `text-ink3`；只有一种方式时只显示一个图标。
10. 收起态（顶栏，宽度紧张）只显示**当前使用**的那一个图标。
11. 图标不能是唯一的信息载体：`getDevicePickerOptions` 生成的 a11y label
    必须包含连接方式的文字描述，图标本身配 `sr-only` 或 `aria-label`。
12. `DeviceSpecStrip` 增加一行「连接方式」，合并设备显示全部方式并标出当前使用的。
13. 行高与菜单宽度不变（`min-h-[52px]` / `292px`）——图标放进右侧列的第二行，
    与左侧已有的两行对齐，不要为此加高或加宽。

## Out of Scope

- **手动指定用哪条传输**。当前的自动优先级已经覆盖主要场景：
  连上 WiFi → 合并进 USB 条目 → 拔掉 USB → 无缝落到 WiFi。
  手动切换留作后续，本轮只保证信息可见。
- 合并项在 UI 上展开查看各条传输明细。
- 三条及以上传输（同一设备多个 IP）——数据结构要支持 N 条，
  但 UI 只保证 USB + WiFi 两种图标的呈现。
- 设备列表轮询/热插拔自动刷新（现状是手动刷新，本任务不改）。
- `list_devices` 之外的任何命令签名变更。

## Acceptance Criteria

- [ ] 同一台设备同时接 USB 和 WiFi 时，设备下拉只出现**一条**，
      条目上能看出两种连接方式都可用、且当前用的是 USB。
- [ ] 拔掉 USB 后，选中项自动落到 WiFi 那条，面板不中断、不回到"未选择设备"。
- [ ] 两台**不同**设备（哪怕同型号）绝不会被合并。
- [ ] unauthorized / offline 的条目照旧各自成条，不参与合并。
- [ ] 拿不到 `ro.serialno` 的设备照旧各自成条，功能与改动前一致。
- [ ] 合并逻辑是纯函数并有单元测试，覆盖：单设备单传输、单设备双传输、
      两台设备各自双传输、`device_id` 为 null、主传输离线时的优先级。
- [ ] 下拉行高仍是 `min-h-[52px]`、菜单宽仍是 `292px`，收起态在最窄
      190px 下不溢出、不破坏截断。
- [ ] 键盘/读屏可用：仅靠 a11y label 就能知道连接方式，不依赖图标。
- [ ] `pnpm test`、`pnpm build`、`cargo test`、`cargo clippy` 通过。

## Open Questions

- [ ] 收起态到底放不放图标？190px 下已经要塞状态方块 + 型号 + serial。
      倾向放（图标只占约 12px），但如果实现时发现挤坏了截断，
      允许降级成"只在下拉项里显示"，在 `design.md` 里记下这个决定。

## Notes

- 与 `09-03-app-info-read-stability` / `09-03-app-info-cache` 无代码依赖，
  可以并行推进。三者都受益于同一个观察（一台设备可能有两条 serial），
  但那两个任务是在自己内部处理并发，本任务是让 UI 不再暴露这个细节。
- 本任务**不解决**并发问题：即使 UI 合并了，两条 serial 仍然存在，
  父任务的全局锁依然必要，不要因为这个任务就去放宽它。
