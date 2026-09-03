# Implement Plan: 设备列表合并同一设备的多传输连接

分支：`claude/app-info-read-stability-tj25vt`

与 `09-03-app-info-read-stability` / `09-03-app-info-cache` **无代码依赖**，
可以并行推进，不需要等它们。

> **⚠️ 规划复审未完成**：用户已指出本任务的规划产物存在若干处矛盾，尚未定位与修订
> （2026-09-03 记录）。开工前必须先和用户过一遍 `prd.md` / `design.md` / 本文件，
> 修订完再动手。**不要带着已知矛盾开始实现**，也不要自行猜测该按哪一边执行。

---

## 1. 前端纯函数与测试先行

`src/lib/device.ts` + `src/lib/device.test.ts`。先把不碰 UI、不碰 Rust 的部分做完。

新增 `transportKind` / `MergedDevice` / `mergeDevicesByIdentity`，
算法见 `design.md`「前端：合并纯函数」。

测试至少覆盖（都是 PRD 验收条件点名的）：

- 单设备单传输 → 一条，`transports.length === 1`
- 单设备 USB + WiFi → 一条，`primary` 是 USB
- 单设备只有 WiFi → 一条，`primary` 是 WiFi
- **两台不同设备各自双传输 → 两条，不串组**
- `device_id` 为 `null` 的条目各自成条，不与任何组合并
- 同组内 USB 离线、WiFi 在线 → `primary` 是 WiFi（在线优先于同类排序）
- **输出顺序保持各组首次出现的位置**（这条最容易漏，漏了体感很差）

同文件扩展 `getPreferredSelectedDeviceSerial`：在 `alias_identity` 回退之前插入
`device_id` 回退，`device_id` 从 `previousDevices` 里的那条取（当前列表里已经没了）。
补测试：选中的 USB 条目消失、同 `device_id` 的 WiFi 在线 → 落到 WiFi。

`pnpm test` 绿了再往下。此时还没有任何 UI 变化，可以安全提交一次。

## 2. Rust：身份字段

`src-tauri/src/commands/device.rs`。

1. `DeviceInfo` 加 `pub device_id: Option<String>`。用 snake_case，与现有的
   `is_network` / `alias_identity` 一致。
2. `static DEVICE_ID_CACHE: OnceLock<Mutex<HashMap<String, String>>>`。
3. `resolve_device_id(app, serial)`：`getprop ro.serialno` → 空则
   `ro.boot.serialno` → 都空则 `None`。trim 后为空也算 `None`。
   **只缓存成功结果**（失败不缓存，设备重新授权后自愈；无轮询所以代价可忽略）。
4. `list_devices` 里：只对 `state == "device"` 的条目解析；
   结束时剪掉缓存中不在当前在线 serial 集合里的条目。
5. `parse_devices_output` 是纯函数且已有测试——它构造 `DeviceInfo` 的地方
   要补上 `device_id: None`，**现有测试的断言要跟着更新**。
   身份解析发生在 `parse_devices_output` 之外，保持这个纯函数依旧可测。

注意 `getprop` 走的是 `device_info.rs:43` 已有的那个私有 helper 的同款写法
（`run_adb_with_serial` + `unwrap_or_default`），不要新造一套。
如果那个 helper 值得共用，提到 `device.rs` 里再让两边引用，不要复制。

## 3. 前端桥接层

`src/lib/tauri.ts` 的 `DeviceInfo`（:13-20）加 `device_id: string | null`。
纯类型改动，无函数变化。

## 4. DevicePicker

`src/components/layout/DevicePicker.tsx`：

1. `getDevicePickerOptions` 改为基于 `mergeDevicesByIdentity` 的结果生成，
   `value` 用 `merged.serial`；`label` 追加 `transportSummary`（见 `design.md`
   「可访问性」）。它有独立测试 `DevicePicker.test.ts`，同步补用例。
2. 新增 `TransportBadges` 小组件（就放本文件内，不单开文件——
   只有这里和收起态用得到）。lucide `Usb` / `Wifi`，`h-3 w-3`，
   当前使用 `text-ink`、可用未使用 `text-ink3`，图标 `aria-hidden`。
3. `renderOption` 的右侧 `<span>` 从一行改成两行列
   （`flex flex-col items-end gap-0.5`）：状态标签在上，`TransportBadges` 在下。
   **行高保持 `min-h-[52px]`、菜单宽保持 `292px`，不要改这两个值。**
4. `renderValue` 在状态方块之后、文字之前插当前传输的单个图标，`shrink-0`。
5. `optionDevice` 现在要能从合并结果里找回 `MergedDevice`，
   不再是直接 `getDeviceBySerial(selectableDevices, ...)`——按 `merged.serial` 索引。

## 5. DeviceSpecStrip

`src/components/DeviceSpecStrip.tsx`：`getDeviceSpecStripModel` 加第三参数
`transports: DeviceInfo[] = [device]`（**带默认值**，现有调用点和测试不受影响），
在 `serial` 那行之后插一行「连接方式」。调用方传入合并后的 `transports`。
`DeviceSpecStrip.test.ts` 补用例：单传输、双传输、双传输时标出当前使用的那条。

---

## 验证计划

### 会话内必须跑通

```bash
pnpm test
pnpm build
cd src-tauri && cargo test
cd src-tauri && cargo clippy --all-targets -- -D warnings
```

缺工具链就逐条写明哪条没跑、为什么。

### 必须在真机上验

1. **合并生效**：一台手机同时接 USB 和 `adb connect`，设备下拉只出现一条，
   图标显示两种方式可用、当前是 USB。
2. **无缝落到 WiFi**：在上一步状态下拔掉 USB 线 → 点刷新 → 选中项仍是这台设备、
   走 WiFi，面板没有跳回"未选择设备"。
3. **绝不误合并**（最严重的失败模式）：两台设备同时连着，
   最好是**同型号两台**，确认是两条而不是一条。
4. **拿不到身份的设备**：找一台读不到 `ro.serialno` 的设备（或临时把
   `resolve_device_id` 强制返回 `None`），确认各自成条、功能与改动前一致。
5. **unauthorized 设备**：接一台没授权的，确认它单独成条、不参与合并、
   不会因为 getprop 失败而拖慢或报错。
6. **UI 不破**：把窗口收窄到顶栏设备选择器最小宽度（190px），
   确认收起态不溢出、截断正常；下拉打开确认行高没变、图标没换行。
7. **读屏/键盘**：用键盘打开下拉逐项浏览，确认朗读文本里能听出连接方式
   （不依赖图标）。

### 回归观察点

- 单传输设备（只有 USB，或只有 WiFi）的下拉表现应与改动前完全一致。
- `WifiConnect.tsx` 连接成功后的刷新流程不受影响；连上后应当合并进已有的 USB 条目。
- `parse_devices_output` 的现有测试全绿（补了 `device_id: None` 之后）。

## 风险点 / 回滚

- 回滚：`DevicePicker` 改回直接用 `getSelectableDevices` 即可；
  Rust 的 `device_id` 是纯增量字段，留着无害。
- 最容易写错的三处：合并结果的**输出顺序**（没保持首次出现顺序 → 插拔一次线
  下拉就重排）、`getPreferredSelectedDeviceSerial` 里 `device_id` 要从
  `previousDevices` 取、以及 `parse_devices_output` 现有测试的断言更新。
- 误合并会让用户对着 A 设备操作 B 设备，是本任务最严重的失败模式。
  实现时守住"`device_id` 为 null 一律不合并"，宁可多一条。

## Follow-up（`task.py start` 前需要确认）

- [ ] 用户已阅读并认可 `prd.md` / `design.md` / 本文件
- [ ] `design.md` 里收起态图标的 Open Question：若实现时降级成"只在下拉项显示"，
      要把决定写回 `design.md`，不能默默留一个溢出的顶栏
- [ ] 明确真机验证（尤其是同型号两台设备不误合并）由用户完成
