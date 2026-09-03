# Implement Plan: 设备列表合并同一设备的多传输连接

分支：`claude/device-transport-merge`（从 `main` 开），**不要和
`09-03-app-info-read-stability` 挤同一条分支**——两者会同时改 `src/lib/tauri.ts`
与测试文件，同分支并行必然互踩。

与 `09-03-app-info-read-stability` **无代码依赖**（它只碰 `app_info.rs` /
`PackageManager.tsx`），可以并行推进，不需要等它。

反过来 `09-03-app-info-cache` **依赖本任务**：它的缓存键复用本任务在 `DeviceInfo`
上加的 `device_id`。所以本任务的步骤 2、3 合入 `main` 之前，那个子任务不能开工。

> **规划复审已完成（2026-09-03）**：上一版产物里的矛盾已定位并修订，主要是
> ①「组内排序 USB 优先」与测试用例「USB 离线时 primary 是 WiFi」互相打架、
> ②「`device_id` 非 null 蕴含在线」这条不变量让离线优先级变成死代码、
> ③ PRD 的 Open Question 已在 `design.md` 决策但仍标着未决。
> 现在的规则是：**缓存不因状态失效（离线条目沿用身份）+ 组内排序先在线后 USB**。
> 照现在的 `prd.md` / `design.md` / 本文件执行即可。

---

## 1. 前端纯函数与测试先行

`src/lib/device.ts` + `src/lib/device.test.ts`。先把不碰 UI、不碰 Rust 的部分做完。

新增 `transportKind` / `MergedDevice` / `mergeDevicesByIdentity` /
`activeTransports` / `transportSummary`，算法见 `design.md`「前端：合并纯函数」。

两条必须照做的前提：

- `mergeDevicesByIdentity` 的**输入是 `getSelectableDevices(devices)` 的结果**，
  可见性规则一条都不改。
- **不要假设组内全员在线**。`device_id` 非 null 不蕴含 `state === "device"`
  （Rust 侧会让离线 USB 沿用缓存里的身份），排序必须自己判状态。

组内排序是两级，**先在线、后 USB**，写反了 USB 掉线时主传输会指向一条死 serial。

测试至少覆盖（都是 PRD 验收条件点名的）：

- 单设备单传输 → 一条，`transports.length === 1`
- 单设备 USB + WiFi（都在线）→ 一条，`primary` 是 USB
- 单设备只有 WiFi → 一条，`primary` 是 WiFi
- **两台不同设备各自双传输 → 两条，不串组**
- `device_id` 为 `null` 的条目各自成条，不与任何组合并
- **同组内 USB 是 `offline`、WiFi 在线 → 仍是一条，且 `primary` 是 WiFi**
  （先在线后 USB；这条正是上一版矛盾所在，务必写出来）
- 整组都不在线（只有一条离线 USB）→ `primary` 就是它，`activeTransports` 退化为它
- **输出顺序保持各组首次出现的位置**（这条最容易漏，漏了体感很差）
- `activeTransports` / `transportSummary`：双在线 → 两项 + "当前使用 USB"；
  USB 离线 → 只剩 WiFi 一项，文案里不出现 USB

同文件扩展 `getPreferredSelectedDeviceSerial`：在 `alias_identity` 回退之前插入
`device_id` 回退，`device_id` 从 `previousDevices` 里的那条取（当前列表里已经没了）。
补测试：选中的 USB 条目消失、同 `device_id` 的 WiFi 在线 → 落到 WiFi。

`pnpm test` 绿了再往下。此时还没有任何 UI 变化，可以安全提交一次。

## 2. Rust：身份字段

`src-tauri/src/commands/device.rs`。

1. `DeviceInfo` 加 `pub device_id: Option<String>`。`DeviceInfo` 只 derive 了
   `Serialize`、没有 `rename_all`，所以字段名原样过到前端——用 snake_case，
   与现有的 `is_network` / `alias_identity` 一致。
2. `static DEVICE_ID_CACHE: OnceLock<Mutex<HashMap<String, String>>>`
   （`std::sync::Mutex` 即可，`list_devices` 是同步体，不跨 await）。
   它存的是"每条 serial 最近一次**在线时**解析到的身份"，只为非在线条目服务。
3. `resolve_device_id(app, serial, state)`：
   - `state == "device"` → **每次都实际 getprop**（不读缓存）：`ro.serialno` → 空则
     `ro.boot.serialno` → 都空则 `None`。trim 后为空也算 `None`。
     成功则写入/覆盖缓存；失败不写（设备重新授权后自愈）。
     **不要"优化"成缓存命中就跳过**——网络 serial 是 `IP:PORT`，IP 被重新分配后
     同一个 serial 会指向另一台设备，吃缓存就会误合并（见 `design.md`
     「为什么在线条目不吃缓存」）。
   - 非在线 → 不发 getprop，只读缓存：命中就用，没有就 `None`。
4. `list_devices` 里：对每条解析出的 `DeviceInfo` 调 `resolve_device_id`；
   结束时**按"本次输出里出现过的 serial 集合"剪枝**——注意是"出现过"，
   不是"在线"。写成"在线集合"就等于让缓存在状态离开 `device` 时失效，
   USB 一掉线下拉就会从一条裂成两条，正好把本任务要修的现象重新制造出来。
5. `list_devices` 改标 `#[tauri::command(async)]`：函数体保持同步、签名不变、
   前端调用方式不变，只是让这批 getprop 离开主线程（见 `design.md`「解析与缓存」）。
   其余同步命令本轮不动。
6. `parse_devices_output` 是纯函数且已有测试——它构造 `DeviceInfo` 的地方
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

1. `getDevicePickerOptions` 改为基于 `mergeDevicesByIdentity(getSelectableDevices(devices))`
   的结果生成，`value` 用 `merged.serial`；`label` 追加 `transportSummary`
   （见 `design.md`「可访问性」）。它有独立测试 `DevicePicker.test.ts`，同步补用例。
2. 新增 `TransportBadges` 小组件（就放本文件内，不单开文件——
   只有这里和收起态用得到）。lucide `Usb` / `Wifi`，`h-3 w-3`，
   当前使用 `text-ink`、可用未使用 `text-ink3`，图标 `aria-hidden`。
   **只画 `activeTransports(merged)` 里的传输**（在线的；整组都不在线时退化为
   主传输那一条），和 `transportSummary` 的文案由同一份数据派生。
3. `renderOption` 的右侧 `<span>` 从一行改成两行列
   （`flex flex-col items-end gap-0.5`）：状态标签在上，`TransportBadges` 在下。
   **行高保持 `min-h-[52px]`、菜单宽保持 `292px`，不要改这两个值。**
4. `renderValue` 在状态方块之后、文字之前插当前传输的单个图标，`shrink-0`。
5. `optionDevice` 现在要能从合并结果里找回 `MergedDevice`，
   不再是直接 `getDeviceBySerial(selectableDevices, ...)`——按 `merged.serial` 索引。

## 5. DeviceSpecStrip

`src/components/DeviceSpecStrip.tsx`：`getDeviceSpecStripModel` 加第三参数
`transports: DeviceInfo[] = [device]`（**带默认值**，现有测试不受影响），
在 `serial` 那行之后插一行「连接方式」。

接线在**组件内部**，不要改 `DeviceSpecStripProps`：`DeviceSpecStrip.tsx:113`
已经从 store 取了 `devices`，在 `DeviceSpecStrip.tsx:125` 那次调用之前用
`useMemo` 算一次 `mergeDevicesByIdentity(getSelectableDevices(devices))`，
按 `device.serial` 找到所属组，传 `merged?.transports ?? [device]`。
（上一版这里只写了"调用方传入"，而唯一的调用点就在组件自己身上，会卡住执行。）

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
4. **USB 变 `offline` 时仍合并**：这条真机上不好稳定构造（`adb devices` 里 USB 显示
   `offline` 通常出现在设备重启途中或线材接触不良），主要靠步骤 1 的单元测试保证。
   真机上有机会的话，在 `adb reboot` 过程中刷新一次设备列表观察：
   条目应当仍是一条、主传输落到 WiFi，而不是裂成两条。
5. **拿不到身份的设备**：找一台读不到 `ro.serialno` 的设备（或临时把
   `resolve_device_id` 强制返回 `None`），确认各自成条、功能与改动前一致。
6. **unauthorized 设备**：接一台没授权的，确认它单独成条、不参与合并、
   不会因为 getprop 失败而拖慢或报错。
7. **UI 不破**：把窗口收窄到顶栏设备选择器最小宽度（190px），
   确认收起态不溢出、截断正常；下拉打开确认行高没变、图标没换行。
8. **读屏/键盘**：用键盘打开下拉逐项浏览，确认朗读文本里能听出连接方式
   （不依赖图标）。
9. **启动不卡**：接 2–3 台设备后冷启动 App，确认设备列表出现的时间没有明显变长
   （这条验的是 `#[tauri::command(async)]` 那一改）。

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

- [ ] 用户已阅读并认可 `prd.md` / `design.md` / 本文件（2026-09-03 复审版）
- [ ] 本任务从 `main` 单开分支 `claude/device-transport-merge`，不与
      `09-03-app-info-read-stability` 共用分支
- [ ] 收起态图标：若实现时降级成"只在下拉项显示"，要把决定写回 `design.md`，
      不能默默留一个溢出的顶栏
- [ ] 明确真机验证（尤其是同型号两台设备不误合并）由用户完成
- [ ] 本任务合入 `main` 之后，`09-03-app-info-cache` 才能开工（它复用 `device_id`）；
      同时 `09-03-app-info-read-stability` 里"在两条 serial 之间切换"的真机验证
      要赶在本任务合入前做掉
