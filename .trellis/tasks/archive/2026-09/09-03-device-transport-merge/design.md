# Design: 设备列表合并同一设备的多传输连接

## 核心决策：合并只发生在展示层

`selectedDevice` **保持为裸 serial 字符串**，就是主传输的 serial。

替代方案是引入"设备组 ID"，让 `selectedDevice` 变成组 ID。否决：全应用每个面板
都是 `getDeviceBySerial(devices, selectedDevice)` 然后拿 `.serial` 发命令
（PackageManager、logcat、文件管理、截图、录屏、端口转发……十来个文件），
改成组 ID 意味着每一处都要多一步"组 → 当前 serial"的解析。
而合并本质上是"别让用户看到两条"，是 UI 问题，没有理由污染整条数据通路。

所以：Rust 提供身份字段 → 前端纯函数分组 → `DevicePicker` 渲染合并项 →
选中的仍然是一个具体的 serial。

## Rust：身份解析

### DeviceInfo 新字段

```rust
pub struct DeviceInfo {
    // ...现有字段不变
    pub device_id: Option<String>,
}
```

前端 `tauri.ts` 的 `DeviceInfo` 同步加 `device_id: string | null`。
注意现有字段用的是 snake_case（`is_network` / `alias_identity`），
新字段跟着用 `device_id`，不要引入 camelCase 不一致。

### 解析与缓存

```rust
/// 每条 serial **最近一次在线时**解析到的身份。只为非在线条目服务，
/// 在线条目一律现场重新解析（理由见下）。std::sync::Mutex 即可。
static DEVICE_ID_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn resolve_device_id(app: &AppHandle, serial: &str, state: &str) -> Option<String>
```

规则只有三条，按条目的状态分：

- **`state == "device"`（在线）→ 每次都实际 getprop 解析**，不读缓存；
  成功则写入/覆盖缓存，失败则不写缓存、本条返回 `None`。
- **非在线（offline / unauthorized）→ 不发 getprop，只读缓存**：命中就用，
  没有就 `None`。所以 `device_id` **非 null 并不蕴含在线**——USB 条目掉成 `offline`
  时会沿用它在线时解析到的身份，继续和 WiFi 那条合并成一条。如果这里让它掉回
  `None`，下拉会在拔线的一瞬间从一条裂成两条，正好是本任务要消除的现象。
- **剪枝只看"这条 serial 还在不在 `adb devices` 的输出里"**，不看状态：
  每次 `list_devices` 结束时删掉缓存中不在本次输出 serial 集合里的条目。

解析顺序：`getprop ro.serialno` → 空则 `getprop ro.boot.serialno` → 都空则 `None`。
读到的值 trim 后为空串也算 `None`。

**为什么在线条目不吃缓存**（这条别"优化"掉）：网络条目的 serial 是 `IP:PORT`，
路由器把这个 IP 重新分给另一台手机之后，同一个 serial 指向的就是**另一台设备**了。
在线还吃缓存的话，新设备会顶着旧设备的身份被合并进旧设备那一条——
**误合并是本任务最严重的失败模式**（用户会对着 A 设备操作 B 设备）。
每次刷新多 N 次 getprop 换掉这个风险是可接受的，但设备列表实际存在后端 3 秒轮询：
`src-tauri/src/lib.rs` 的 `start_device_poll` 会持续调用 `list_devices` 并发出
`devices-updated`，`App.tsx` 订阅该事件。失败不缓存，未授权设备被授权后下一轮即可解析。

缓存于是只剩一个用途：**让刚掉线的条目保住身份**。这类条目要么是 USB
（serial 是设备自己的序列号，不会被别的设备复用），要么是离线网络条目
（`isSelectableDevice` 根本不显示它），所以不存在上面那种张冠李戴。

边界（接受并记录）：身份只活在本次进程运行内。App 启动时某条 USB 就已经是
`offline` / `unauthorized`，那它这一轮拿不到身份，按"null 不合并"各自成条。
这比"猜"安全，也不会比改动前更差。

成本：每次 `list_devices` 对每台**在线**设备多一次 getprop（约 30–80ms）。

`list_devices` 当前是同步命令，而且后端轮询直接在 async runtime task 内调用它。
新增 N 次 getprop 后，简单把命令改成 `async fn` 仍会在 runtime worker 上同步阻塞，
也不能覆盖后端轮询入口。实现应把现有逻辑下沉到 blocking helper，公开的异步
`list_devices` 用 `tauri::async_runtime::spawn_blocking` 执行整条 ADB 链；
`start_device_poll` 改为 await 同一个异步入口。入口前用一把进程级 async mutex
串行化整次读取，避免轮询、启动读取和手动刷新重叠时同时跑多组 getprop、交叉剪枝缓存。
前端调用签名不变，仓库里 `get_device_info` 等其他同步命令本轮不动。

### 为什么是 ro.serialno

USB 连接时 adb 的 serial 通常**就是** `ro.serialno`，所以合并后主传输的 serial
和 `device_id` 往往相同——这不是问题，只是意味着 USB 条目天然是身份锚点。
WiFi 条目的 serial 是 `IP:PORT`，与设备身份无关，必须靠 getprop 才能对上。

## 前端：合并纯函数

`src/lib/device.ts` 新增（配套 `device.test.ts`）：

```ts
export type TransportKind = "usb" | "network";

export interface MergedDevice {
  /** 主传输的 serial，也就是这条列表项对外的 serial */
  serial: string;
  primary: DeviceInfo;
  /** 含 primary，已按优先级排序 */
  transports: DeviceInfo[];
}

export function transportKind(device: DeviceInfo): TransportKind;
export function mergeDevicesByIdentity(devices: DeviceInfo[]): MergedDevice[];
```

**输入是 `getSelectableDevices(devices)` 的结果，不是原始 `devices`。**
可见性规则（在线的、或非网络的）本任务一条都不改，合并只是把已经会显示的条目
收拢成一条。这也意味着组内唯一可能的非在线成员是 **离线 / 未授权的 USB 条目**
（离线的网络条目本来就不显示）。

算法：

1. `device_id` 为 `null` 的条目**各自成为单传输的 `MergedDevice`**，不参与分组。
   拿不到身份就不猜——误合并两台设备远比不合并严重。
2. 其余按 `device_id` 分组。
3. 组内传输排序，两级，**顺序不能对调**：
   1. **在线优先**：`state === "device"` 在前。
   2. **USB 优先**：`is_network === false` 在前。
   3. 都相同则按原数组下标保持稳定。

   先在线后 USB 的理由：USB 掉成 `offline`、WiFi 还在线时，主传输必须是那条真能
   发命令的 WiFi。反过来排的话，`selectedDevice` 会指向一条发什么都失败的死 serial，
   而这正是 Requirement 8「主传输断开时无缝落到另一条」要避免的。
4. `primary = transports[0]`，`serial = primary.serial`。
5. **输出顺序按各组在原数组中首次出现的位置**，不要重排——
   否则插拔一次线，整个下拉的顺序就跳一次。

注意：**`device_id` 非 null 不蕴含在线**（见上方「解析与缓存」——离线 USB 会沿用
缓存里的身份）。所以第 3 步的"在线优先"是真的会被用到的分支，不是死代码；
分组和排序都必须自己判状态，不要假设组内全员在线。这句话写进 `device.ts` 的注释里。

### 选中项归一化与回退

`getPreferredSelectedDeviceSerial`（`device.ts:44-77`）不能只在旧 serial 掉线或消失时
回退。刷新后旧 serial 可能仍在线、但已经变成合并组的次传输：例如先用 WiFi，
再接入优先级更高的 USB。此时若直接“在线就保持”，store 会保留 WiFi serial，
而 `DevicePicker` 只有 USB 主 serial 的 option，选中值与下拉立刻失配。

函数签名不变，但内部先计算：

```ts
const selectableDevices = getSelectableDevices(devices);
const mergedDevices = mergeDevicesByIdentity(selectableDevices);
```

此后任何非 null 返回值都必须是 `mergedDevices[*].serial`。归一化 / 回退链为：

1. 当前选中的 serial 属于某个合并组，且该组主传输在线 → 返回**该组主 serial**。
   这一步既保留已经正确的主 serial，也把仍在线的次传输归一到主传输。
2. 从 `previousDevices` 找旧选中条目的 `device_id`，找到当前同身份且主传输在线的组
   → 返回该组主 serial。
3. 从当前或旧选中条目取 `alias_identity`，找到当前含同 alias 在线传输的组
   → 返回该组主 serial。
4. 第一个主传输在线的合并组 → 返回其主 serial。
5. 当前选中的 serial 若仍属于某个可选但整组离线的合并组 → 返回该组主 serial。
6. 第一个合并组 → 返回其主 serial；没有组才返回 `null`。

第 2 步放在第 3 步之前：`device_id` 是设备真实身份，`alias_identity` 只是 mDNS
名字的推断，前者更可信。第 1 步不能写成“选中项仍在线就原样返回”，必须先映射到组；
函数已经接收 `previousDevices`，不需要改签名。

`setSelectedDevice` 的显式选择也必须遵守同一不变量：先在可选设备的合并结果中
找到包含请求 serial 的组，再保存该组主 serial。这样仍允许用户选择单独成组的
USB `offline` / `unauthorized` 条目，但不会把在线组内的次传输写进 store。

必须单测两个方向：WiFi 已选中且仍在线 → USB 上线后归一到 USB；USB 消失或离线
→ 同组 WiFi 成为主传输并被选中。两种情况下返回值都必须能在
`mergedDevices.map((item) => item.serial)` 中找到。

## UI

### 下拉项（`renderOption`）

行高与菜单宽度**不变**（`min-h-[52px]` / `292px`）。右侧列从一行变两行，
和左侧已有的两行对齐：

```
┌────────────────────────────────────────────┐
│ ■  Pixel 7                          在线   │
│    ABC123XYZ                       [⌁][≋]  │
└────────────────────────────────────────────┘
     ↑ 左列 flex-1 truncate        ↑ 右列 shrink-0 items-end
```

结构改动只在最后那个 `<span>`：

```tsx
<span className="flex shrink-0 flex-col items-end gap-0.5">
  <span className="font-data text-[10.5px] text-ink3">{getDeviceStateLabel(...)}</span>
  <TransportBadges transports={merged.transports} activeSerial={merged.serial} />
</span>
```

`TransportBadges`：lucide 的 `Usb` / `Wifi`，`h-3 w-3`，`flex items-center gap-1`。
**当前使用的传输类型** `text-ink`，可用但未使用的类型 `text-ink3`。按
`transportKind` 去重，同一设备有多个 WiFi serial 时只画一个 WiFi 图标；
当前主传输属于该类型时该图标高亮。只有一种传输类型时只画一个。

**画哪些传输**：只画组内 `state === "device"` 的传输；若整组都不在线
（只可能是离线 / 未授权的 USB 条目独自成组），就画主传输那一条。
理由是徽标要回答的是"现在能用哪几种连接"，把一条已经断掉的 USB 画成灰图标
只会让用户以为还能切过去。`transportSummary` 的文字必须与画出来的徽标一致，
两者由同一个 `activeTransports(merged)` 派生，不要各算各的。
`activeTransports` 保留每种传输类型的第一条代表项并保持现有排序，
因此徽标和可访问性文案不会因多个 IP 出现重复的 WiFi。

宽度核算：状态标签「未授权」最宽约 34px，图标行 2×12+4=28px，
右列取两者较大值约 34px；292px 菜单减去 padding 与左侧图标后，
左列仍有 200px 以上，`truncate` 照常工作。

### 收起态（`renderValue`，顶栏 `clamp(190px,32vw,292px)`）

只显示**当前使用**的那一个图标，放在状态方块之后、文字之前，`shrink-0`：

```
■ ⌁ Pixel 7  ABC123
```

放在前面而不是行尾，是为了让它不参与 `truncate` 的争抢——放行尾的话
190px 下会被型号和 serial 挤掉，而"当前用什么连接"恰恰是这里唯一要传达的新信息。

> **Open Question 决策记录**：如果实现时发现 190px 下仍然挤坏截断，
> 允许降级成"收起态不显示图标，只在下拉项里显示"。降级了就把这个决定写回本文件，
> 不要默默留一个溢出的顶栏。

### 可访问性

图标不能是唯一信息载体：

- `getDevicePickerOptions` 的 `label`（下拉的 a11y 文本）追加连接方式描述：
  `` `${型号}, ${serial}, ${状态}, ${transportSummary(merged)}` ``
- `transportSummary`：基于与徽标同一份 `activeTransports(merged)`。
  单传输 → `"USB 连接"` / `"WiFi 连接"`；
  多传输 → `"USB 和 WiFi 连接, 当前使用 USB"`。
- 图标本体 `aria-hidden`，语义由外层的 `sr-only` 文本承担
  （参照 `PackageManager.tsx:236` 已有的 `sr-only` 写法）。

### 术语

一律写 **"WiFi"**，与 `WifiConnect.tsx` 里现有的 8 处保持一致。
不要写成 WLAN / 无线 / Wi-Fi。

### DeviceSpecStrip

`getDeviceSpecStripModel(device, deviceDetail)` 加第三个可选参数
`transports?: DeviceInfo[]`。通过 `if (!device) return null` 后再计算
`const resolvedTransports = transports ?? [device]`，避免默认参数引用可空的 `device`
造成 TypeScript 错误，并在 `serial` 之后插一行。

接线位置说明：唯一的调用点在 `DeviceSpecStrip.tsx:125` 组件内部，不是外部传进来的。
该组件已经从 store 取了 `devices`（`DeviceSpecStrip.tsx:113`），所以在组件里
`mergeDevicesByIdentity(getSelectableDevices(devices))` 之后按 `device.serial`
找到所属的那一组，把 `merged?.transports ?? [device]` 传进去即可，
不需要改 `DeviceSpecStripProps`，也不需要动父组件。合并结果用 `useMemo` 包一下，
和 `DevicePicker.tsx:38-39` 现有的写法保持一致。
完整详情由 6 项变为 7 项，桌面布局同步改为 `lg:grid-cols-7`，避免连接方式单独换行。

插入的那一行：

```ts
{ key: "transport", label: "连接方式", value: "USB 和 WiFi (当前 USB)" }
```

单传输时值就是 `"USB"` / `"WiFi"`。`DeviceSpecStrip.test.ts` 补对应用例。

## 不解决的问题

**本任务不解决并发问题。** UI 合并之后两条 serial 仍然真实存在，用户仍可能
在两条之间切换（比如从别的入口），`09-03-app-info-read-stability` 的全局锁
依然必要。不要因为"UI 已经合并了"就去放宽那把锁。

## 风险与回滚

- 回滚：`DevicePicker` 改回直接用 `getSelectableDevices`，
  `mergeDevicesByIdentity` 留着不调用即可。Rust 的 `device_id` 字段是纯增量，
  留着无害。
- 最容易出错的四处：合并后的**输出顺序**（没保持首次出现顺序的话，
  插拔一次线整个下拉就重排一次，体感很差）；
  `getPreferredSelectedDeviceSerial` 不能对仍在线的次传输原样早退；
  `getPreferredSelectedDeviceSerial` 里 `device_id` 要从 `previousDevices`
  取（当前列表里那条已经没了）；
  以及**组内排序的两级顺序**——写成"USB 优先 → 在线优先"的话，
  USB 掉线时主传输会指向一条发什么都失败的死 serial。
- 误合并是本任务最严重的失败模式：会让用户对着 A 设备操作 B 设备。
  所以 `device_id` 为 null 一律不合并，宁可多一条也不能合错。
