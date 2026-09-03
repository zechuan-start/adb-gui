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
- **下拉里能出现的条目由 `isSelectableDevice`（`device.ts:19-21`）决定**：
  在线的，或者非网络的（即 USB 条目哪怕 `offline` / `unauthorized` 也会显示，
  而离线的网络条目根本不显示）。所以"组内有离线成员"这件事**只可能是离线的 USB 条目**，
  合并也只在这份可选列表上做——本任务不改这条可见性规则。
- UI 现状：`DevicePicker.tsx` 的下拉项是 `min-h-[52px]`、菜单宽 `292px`，
  左侧两行（型号 / serial）、右侧一行状态标签；收起态在
  `clamp(190px,32vw,292px)` 宽度里显示「状态方块 + 型号 + serial」。
- **术语**：仓库 UI 统一用 "WiFi"（`WifiConnect.tsx` 里 8 处），
  不要写成 WLAN / 无线 / Wi-Fi。

## Requirements

### 身份识别

1. `DeviceInfo` 新增 `device_id: string | null`，由 Rust 侧解析：
   `getprop ro.serialno`，为空则 `ro.boot.serialno`，都拿不到 → `null`。
2. **只对 `state == "device"` 的条目发 getprop**。unauthorized / offline 读不到属性，
   不发这个命令。
3. Rust 侧按 serial 记住**最近一次在线时**解析到的身份，**只在该 serial 从
   `adb devices` 输出里消失时剪掉，不因状态离开 `device` 而失效**：
   - 在线条目：**每次都重新 getprop**，不吃缓存。网络 serial 是 `IP:PORT`，
     IP 被路由器重新分配后同一个 serial 会指向另一台设备，吃缓存就会误合并
     ——那是本任务最严重的失败模式，不能拿它换每次刷新省下的几十毫秒。
   - 非在线条目：不发 getprop，沿用记住的身份。USB 掉成 `offline` 的那一刻不该
     让它丢失身份、把下拉从一条裂回两条。
   - 失败不记，所以未授权设备被授权后下一次刷新就能解析出来。

   边界（接受并记录）：身份只在本次进程运行内记住。App 启动时就已经离线的条目
   拿不到身份，按 Requirement 4 各自成条。
4. `device_id` 为 `null` 的条目**一律不参与合并**，按现状各自成条。
   拿不到身份就不猜——误合并两台设备比不合并严重得多。

### 合并与主传输

5. `device_id` 相同的多条 `DeviceInfo` 合并成一条列表项。
6. 每条合并项有一个**主传输**，它的 serial 就是这条列表项对外的 serial。
   优先级：**先在线优先**（`state == "device"`），**再 USB 优先**
   （`is_network == false`），最后按原数组下标保持稳定。
   两级顺序不能对调：USB 掉成 `offline`、WiFi 仍在线时，主传输必须是那条真的能发
   命令的 WiFi，而不是排在前面的死 USB。
7. `selectedDevice` **仍然是裸 serial 字符串**，并且只要非 null，就必须等于当前
   合并列表中某一项的主传输 serial。合并是展示层的事，不引入设备组 ID，
   不改动任何面板取 serial 的方式；`setDevices` 每次刷新都要把仍指向组内次传输的
   旧值归一到当前主传输，不能只在旧 serial 掉线或消失时才处理。
8. 主传输变化时自动迁移选中项，不能变成"未选择设备"：既包括拔掉 USB 后从 USB
   落到同一 `device_id` 的在线 WiFi，也包括当前选中的 WiFi 仍在线、随后 USB 上线后
   按优先级归一到 USB。扩展 `getPreferredSelectedDeviceSerial` 现有的
   `alias_identity` 回退逻辑，并保证它只返回合并列表里真实存在的主 serial。

### UI

9. 下拉项要同时表达两件事：**现在有哪些连接方式可用**、**当前用的是哪条**。
   用 lucide 的 `Usb` / `Wifi` 图标：当前使用的用 `text-ink`，
   可用但未使用的用 `text-ink3`；只有一种方式时只显示一个图标。
   **只画在线的传输**——一条已经断掉的 USB 不该被画成灰图标，那会让用户以为
   还能切过去（整组都不在线时退化为只画主传输，见 `design.md`「下拉项」）。
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
- [ ] 先只有 WiFi 并选中它，再接入同一设备的 USB；即使原 WiFi serial 仍在线，
      `selectedDevice` 也会在刷新时归一到 USB 主 serial，且它始终对应下拉中的 option。
- [ ] 拔掉 USB 后，选中项自动落到 WiFi 那条，面板不中断、不回到"未选择设备"。
- [ ] 两台**不同**设备（哪怕同型号）绝不会被合并。
- [ ] unauthorized / offline **且本次运行里从没在线过**的条目（`device_id` 为 null）
      照旧各自成条，不参与合并。曾经在线、身份已记住的条目仍然参与合并，见下一条
      ——这两条不冲突，区别只在"有没有身份"。
- [ ] 拿不到 `ro.serialno` 的设备照旧各自成条，功能与改动前一致。
- [ ] **USB 条目掉成 `offline`、WiFi 仍在线时，两条仍然合并成一条，且主传输是
      那条在线的 WiFi**（身份来自缓存，排序是在线优先）。这条同时验证
      Requirement 3 的"缓存不因状态失效"和 Requirement 6 的两级优先级。
- [ ] 合并逻辑是纯函数并有单元测试，覆盖：单设备单传输、单设备双传输、
      两台设备各自双传输、`device_id` 为 null、
      **USB 离线 + WiFi 在线时主传输是 WiFi**、输出顺序保持首次出现位置。
- [ ] 下拉行高仍是 `min-h-[52px]`、菜单宽仍是 `292px`，收起态在最窄
      190px 下不溢出、不破坏截断。
- [ ] 键盘/读屏可用：仅靠 a11y label 就能知道连接方式，不依赖图标。
- [ ] `pnpm test`、`pnpm build`、`cargo test`、`cargo clippy` 通过。

## Open Questions（已全部决策完毕）

- [x] 收起态到底放不放图标？→ **放**，只放当前使用的那一个，位置在状态方块之后、
      文字之前（决策与理由见 `design.md`「收起态」）。若实现时发现 190px 下确实挤坏了
      截断，允许降级成"只在下拉项里显示"，降级后必须把决定写回 `design.md`。

## Notes

- **与 `09-03-app-info-read-stability` 无代码依赖**（那个任务只碰 `app_info.rs` /
  `PackageManager.tsx`），可以并行推进。
- **`09-03-app-info-cache` 依赖本任务**：它的缓存键复用本任务在 `DeviceInfo` 上加的
  `device_id`（不再自己发一次 `getprop ro.serialno`）。所以本任务的步骤 2、3
  （Rust 身份字段 + 前端类型）必须先合入 `main`，那个子任务才能开工。
  这不影响本任务自身的独立性——它不依赖那两个任务的任何东西。
- 本任务**不解决**并发问题：即使 UI 合并了，两条 serial 仍然存在（`adb devices`
  照旧返回两条，`list_devices` 不做后端合并），`09-03-app-info-read-stability`
  的全局锁依然必要，不要因为这个任务就去放宽它。
- 反过来也要注意：合并之后用户在下拉里**只能选到主传输那一条**，
  所以那两个任务里"在两条 serial 之间来回切"的真机验证步骤，
  必须在本任务合入 `main` **之前**做掉，或者按它们验证计划里写的方式临时构造。
