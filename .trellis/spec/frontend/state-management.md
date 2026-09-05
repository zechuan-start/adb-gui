# State Management

> Zustand v5 as global state; React useState for local.

---

## Overview

- **全局状态**: Zustand v5 (`create<StoreInterface>()`)
- **局部状态**: React `useState`
- 无 Context, 无 Redux, 无 server state cache (React Query 等)

---

## Stores

| Store | 文件 | 职责 |
|-------|------|------|
| `useDeviceStore` | `store/device.ts` | 设备列表, 选中设备, 当前 Activity/Package |
| `useFeedbackStore` | `store/feedback.ts` | Toast 通知 (kind + message) |
| `useThemeStore` | `store/theme.ts` | 明/暗主题切换 |
| `useCodeGeneratorStore` | `store/codeGenerator.ts` | 生码正文、正文修订版本和最近一次生成快照 (无持久化); 长期参数由 useSettingsStore.codegen 唯一持有 |
| `useLogcatStore` | `store/logcat.ts` | Logcat session identity, ring buffer, incremental filter index, and stream state |

---

## Store 模式

```typescript
import { create } from "zustand";

interface SomeStore {
  value: string;
  setValue: (v: string) => void;
}

export const useSomeStore = create<SomeStore>((set) => ({
  value: "",
  setValue: (v) => set({ value: v }),
}));
```

### High-Frequency Mutable Buffers

`useLogcatStore` is the exception to the usual immutable-object pattern. Its fixed-capacity `LogcatRingBuffer` and sorted `filteredSeqs` index mutate in place so each Logcat batch remains O(batch size), not O(window size). Every mutation that affects rendered rows must increment `revision`; consumers subscribe to `revision` and counters, then resolve rows by `seq`.

```typescript
set((state) => {
  appendEntries(state, entries);
  return {
    totalCount: state.buffer.count,
    filteredCount: state.filteredSeqs.length - state.filteredHead,
    revision: state.revision + 1,
  };
});
```

The stream controller calls `flushFrame(lines, sessionId, disconnectDetail)` once per animation frame. That action validates `sessionId` and commits final lines plus a same-frame disconnect in one Zustand `set`. Paused rows remain raw backend lines and receive contiguous `seq` values only when resumed. While paused, incoming frames may update only the bounded pending queue and backlog count; they must preserve the visible buffer, filtered index, `revision`, `nextSeq`, follow mode, and anchor.

### Logcat Sequence Identity

`nextSeq` is the only allocator for `LogcatEntry.seq`. Sequence values are monotonically increasing for the lifetime of the frontend store and are never reused because `seq` is both the virtual-list key and the filter-index address.

- `clearScreen()`, `restart()`, and `reset()` clear their scoped data but preserve `nextSeq`.
- `LogcatRingBuffer.clear()` may reset its internal `baseSeq`; the first subsequent `push()` adopts the entry's globally allocated `seq`.
- Tests must append before and after clear, restart, and device reset, then assert that the resulting sequence values remain strictly increasing.

```typescript
// Wrong: reuses keys from an earlier window.
return { buffer: new LogcatRingBuffer(), nextSeq: 0 };

// Correct: Zustand merges this reset while preserving nextSeq.
return { buffer: new LogcatRingBuffer() };
```

### Logcat View Identity

Keep viewport and selection identities separate even though both reference a row `seq`:

- `anchoredSeq` identifies the row used to compensate scroll position while detached.
- `selectedSeq` identifies the row copied when no native text selection exists.
- `expandedCrashSeqs` keys independent crash-fold state by crash-head seq.

Do not write any of these fields into `LogcatEntry`. When FIFO append evicts a referenced seq, clear stale selection and expansion in the same Zustand update that commits the batch. `clearScreen`, `restart`, and device reset clear row identities, while `autoFold`, `cozyRows`, column, and Soft-Wrap preferences remain view settings.

### Logcat Unread Baseline

Unread state uses the latest real buffer entry, not `nextSeq` alone. `nextSeq` remains monotonic across clear/restart/reset, so an empty buffer must report zero unread and advance its read baseline to `nextSeq - 1`.

```typescript
const latestSeq = totalCount > 0 ? buffer.at(totalCount - 1)?.seq ?? null : null;
const baseline = latestSeq ?? nextSeq - 1;
const unread = open || latestSeq === null
  ? 0
  : readThroughSeq === null
    ? totalCount
    : Math.max(0, latestSeq - readThroughSeq);
```

Do not clamp the seq difference to ring-buffer capacity: rows that arrived while hidden remain unread even after FIFO eviction. Tests must cover an empty cleared buffer, first-read state, open state, and a hidden interval larger than 10,000 rows.

---

## 何时用全局 vs 局部

- **全局 (Zustand)**: 多个组件共享的数据 (设备列表, 选中状态, toast).
- **会话级 (Zustand, no persistence middleware)**: 顶层页签卸载后仍需保留, 但应用重启后应清空的数据.
- **局部 (useState)**: 单组件 UI 状态 (loading/busy, 表单值, 展开/收起).

---

## 派生状态

通过 `useMemo` 在组件内计算, 或在 store 的 setter 中同步计算 (如 `setCurrentActivity` 同时解析 `currentPackage`).

---

## Common Mistakes

- 不要在 store 中存放可以从其他 store 字段直接派生的数据, 除非有性能原因.
- 使用 selector 订阅具体字段: `useDeviceStore((s) => s.selectedDevice)` 而非 `useDeviceStore()`.
- 草稿驱动昂贵批处理时, 将可编辑草稿与已提交结果快照分开. Setter 只更新草稿和 revision, 显式 action 才替换结果快照.
- Do not replace the Logcat ring or filter index with copied arrays on each batch; that restores O(window) work on the hot path.
- Do not mutate Logcat render data without incrementing `revision`.
- Do not increment `revision` or mutate visible Logcat data for paused incoming frames; a selected viewport must remain a stable snapshot until resume.
- Do not derive session freshness from serial alone; every batch, exit, and stop must use the current `sessionId`.
- Do not reset `nextSeq` when clearing the Logcat window or replacing a session/device.

## Scenario: Merged Device Transport Selection

### 1. Scope / Trigger

- Trigger: changing device discovery fields, transport grouping, device picker options, or either device-store selection action.
- Applies when one physical Android device is reachable through multiple ADB serials such as USB and WiFi.

### 2. Signatures

- Rust payload: `DeviceInfo { serial, state, model, transport, is_network, alias_identity, device_id }`.
- `mergeDevicesByIdentity(devices: DeviceInfo[]) -> MergedDevice[]`.
- `getPreferredSelectedDeviceSerial(devices, selectedSerial, previousDevices?) -> string | null`.
- `setDevices(devices: DeviceInfo[])` and `setSelectedDevice(serial: string | null)`.

### 3. Contracts

- `device_id` is the backend-provided physical identity. A null identity never participates in grouping.
- Group only the selectable devices, then choose the primary transport by online state first, USB second, and original order last.
- Every non-null `selectedDevice` is a merged group's primary serial. Both automatic refresh and explicit selection normalize a requested secondary serial to that primary.
- A standalone selectable USB `offline` or `unauthorized` row remains explicitly selectable because its one-member group is its own primary.
- Device-backed lifecycles still derive `onlineSerial` from the selected `DeviceInfo.state`; a non-null selection alone does not authorize ADB commands.

### 4. Validation & Error Matrix

- Requested serial belongs to a selectable merged group -> store the group's primary serial.
- Requested serial is an unavailable network-only row or is absent -> store `null`.
- Current primary disappears but an online transport with the prior `device_id` remains -> migrate to that group's primary.
- `device_id` is null -> keep the row independent and use alias migration or normal preference only; never guess a physical identity.

### 5. Good/Base/Bad Cases

- Good: WiFi is selected, then the same device appears over USB; the store moves to the online USB primary while the picker keeps one option.
- Base: an unauthorized USB device remains a selectable one-member group but does not produce an `onlineSerial`.
- Bad: preserving a still-online secondary WiFi serial leaves the store value absent from the merged picker options.

### 6. Tests Required

- Pure helper tests cover null identities, online-before-USB ordering, stable group order, and offline USB plus online WiFi.
- Store tests cover automatic WiFi-to-USB normalization, explicit secondary selection, standalone unauthorized/offline USB selection, and unavailable network rejection.
- Assert that every non-null store selection exists in `mergeDevicesByIdentity(getSelectableDevices(devices)).map(({ serial }) => serial)`.

### 7. Wrong vs Correct

#### Wrong

```typescript
const requested = getDeviceBySerial(devices, requestedSerial);
const selectedDevice = requested && isSelectableDevice(requested)
  ? requested.serial
  : null;
```

#### Correct

```typescript
const selectedDevice = mergeDevicesByIdentity(getSelectableDevices(devices))
  .find((group) => group.transports.some(({ serial }) => serial === requestedSerial))
  ?.serial ?? null;
```

### Serial-Bound Device Detail

`useDeviceStore` is the only owner of `getDeviceInfo` results. Components such as the specification strip and device information panel consume the same state and call the same refresh action; they must not keep local detail/loading/error copies.

```typescript
interface DeviceDetailState {
  serial: string | null;
  detail: DeviceDetail | null;
  loading: boolean;
  error: string | null;
}

refreshDeviceDetail(): Promise<void>;
```

- Bind every detail result to the requested serial and a monotonically increasing request generation. Serial comparison alone is insufficient because an A -> B -> A switch can make the first A response look current.
- Clear detail immediately when explicit selection, automatic selection, or online availability changes. Unauthorized/offline devices may display list metadata, but must never retain fields loaded while the serial was online.
- Share an in-flight request for the same current serial. A stale success or failure must not publish state or user feedback into the newer selection.
- Keep command errors in `DeviceDetailState.error`; background consumers may render that error without duplicating toast ownership.

Tests must cover same-serial request deduplication, immediate clearing, online-to-offline transition, and late A/B responses across A -> B -> A.
