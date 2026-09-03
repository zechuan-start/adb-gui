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
static DEVICE_ID_CACHE: OnceLock<Mutex<HashMap<String, String>>> = OnceLock::new();

fn resolve_device_id(app: &AppHandle, serial: &str) -> Option<String>
```

- 只对 `state == "device"` 的条目解析。其余一律 `None`——unauthorized/offline
  根本读不到属性，猜不得。
- 顺序：`getprop ro.serialno` → 空则 `getprop ro.boot.serialno` → 都空则 `None`。
  读到的值 trim 后为空串也算 `None`。
- **只缓存成功结果，不缓存失败**。失败不缓存意味着设备重新授权后下次刷新就能拿到，
  自愈；代价是失败的设备每次刷新多一次 getprop——而设备列表**没有轮询**
  （`listDevices()` 只在 `App.tsx:95` 启动、`TopBar.tsx:142` 手动刷新、
  `WifiConnect.tsx:57` 连接后调用），所以这个代价是可忽略的。
- 每次 `list_devices` 结束时剪掉缓存里不在当前在线 serial 集合中的条目，
  这样设备拔了再插、或重新授权，都会重新解析。

启动成本：首次列出 N 台在线设备会多 N 次 getprop（每次约 30–80ms）。
无轮询，所以只在启动和手动刷新时发生。可接受。

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

算法：

1. `device_id` 为 `null` 的条目**各自成为单传输的 `MergedDevice`**，不参与分组。
   拿不到身份就不猜——误合并两台设备远比不合并严重。
2. 其余按 `device_id` 分组。
3. 组内传输排序：USB（`is_network === false`）在前，网络在后；
   同类之间在线在前；再按原数组下标保持稳定。
4. `primary = transports[0]`，`serial = primary.serial`。
5. **输出顺序按各组在原数组中首次出现的位置**，不要重排——
   否则插拔一次线，整个下拉的顺序就跳一次。

`device_id` 非 null 蕴含 `state === "device"`（Rust 侧的不变量），
所以分组时不需要再判一次状态。这条不变量写进 `device.ts` 的注释里。

### 选中项回退

`getPreferredSelectedDeviceSerial`（`device.ts:44-77`）在现有的 `alias_identity`
回退**之前**插入一条：选中的 serial 已经不在列表里时，取 `previousDevices` 里
那条的 `device_id`，找当前列表中同 `device_id` 的在线条目。

回退链最终是：

1. 选中项仍在线 → 保持
2. **同 `device_id` 的在线条目**（新增）
3. 同 `alias_identity` 的在线条目（现状）
4. 第一个在线的
5. 选中项若仍可选
6. 第一个可选的

第 2 步放在第 3 步之前：`device_id` 是设备真实身份，`alias_identity` 只是 mDNS
名字的推断，前者更可信。函数已经接收 `previousDevices` 参数，正是为这类场景准备的，
不需要改签名。

这条覆盖的就是验收里那个场景：拔掉 USB → 选中项自动落到 WiFi，面板不中断。

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
**当前使用的那条** `text-ink`，可用但未使用的 `text-ink3`。只有一种传输时只画一个。

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
- `transportSummary`：单传输 → `"USB 连接"` / `"WiFi 连接"`；
  多传输 → `"USB 和 WiFi 连接, 当前使用 USB"`。
- 图标本体 `aria-hidden`，语义由外层的 `sr-only` 文本承担
  （参照 `PackageManager.tsx:236` 已有的 `sr-only` 写法）。

### 术语

一律写 **"WiFi"**，与 `WifiConnect.tsx` 里现有的 8 处保持一致。
不要写成 WLAN / 无线 / Wi-Fi。

### DeviceSpecStrip

`getDeviceSpecStripModel(device, deviceDetail)` 加第三个参数
`transports: DeviceInfo[] = [device]`（带默认值，现有测试与调用点不受影响），
在 `serial` 之后插一行：

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
- 最容易出错的两处：合并后的**输出顺序**（没保持首次出现顺序的话，
  插拔一次线整个下拉就重排一次，体感很差），
  以及 `getPreferredSelectedDeviceSerial` 里 `device_id` 要从 `previousDevices`
  取（当前列表里那条已经没了）。
- 误合并是本任务最严重的失败模式：会让用户对着 A 设备操作 B 设备。
  所以 `device_id` 为 null 一律不合并，宁可多一条也不能合错。
