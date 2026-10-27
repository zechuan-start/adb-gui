# 剪贴板自动推送 - 技术设计

## 1. 设计原则

- 推送链路完全在 Rust: 检测变化, 读取文本, 去重, 写入手机都在 Rust 后台任务里完成. 前端只负责 "推送到哪台设备 (或停止)" 和显示状态. 原因: 应用窗口被遮挡或最小化时 WebKit 可能节流或挂起网页任务, 网页计时器驱动的推送会悄悄停掉.
- 自动推送读到的剪贴板文本不进入网页, 不写日志, 不持久化. 事件只带状态, 不带内容.
- 只轮询变化计数, 不轮询内容. 计数变化才读取一次文本. 原因: 读取内容开销更大; Windows 上频繁 `OpenClipboard` 会和其他应用争用剪贴板; macOS 的剪贴板隐私提示针对的是读取内容.
- 设备绑定沿用现有剪贴板契约: 每次换目标都换一代 (generation), 提交写入前立即核对当前代, 旧代的结果不更新状态.
- 不新增敏感内容识别, 不新增重试.

拒绝的方案:

- 前端 `setInterval` 调用插件 `readText` 比较内容: 窗口在后台时不可靠, 且每次都读全文.
- 前端轮询计数, 变化时由前端读文本再调用 `set_device_clipboard`: 同样依赖网页计时器, 且把文本带进网页.
- 常驻线程监听系统事件 (Windows `AddClipboardFormatListener`): 需要隐藏消息窗口, macOS 没有对应事件, 收益不抵复杂度.

## 2. 职责划分

| 层 | 职责 |
| --- | --- |
| `settings` (前端) | 持久化 `clipboard.autoPush`, 默认 `false`. |
| `useClipboardAutoPush` (前端, App 根部挂载) | 由 设置可用 + 开关 + 选中设备在线 推导目标, 变化时调用 `set_clipboard_auto_push`; 订阅状态事件, 写入运行时 store. |
| `useClipboardAutoPushStore` (前端, 不持久化) | 当前代, 平台是否支持, 最近状态. |
| `ClipboardTool` / `GeneralSection` | 开关和状态行展示, 调用同一个 settings `update`. |
| `commands/clipboard_auto_push.rs` (Rust) | 目标状态, 后台任务, 变化计数, 读文本, 去重, 调用现有写入流程, 发状态事件. |
| `commands/clipboard.rs` (Rust) | 拆出 "准备辅助程序" 和 "提交请求" 两步, 让自动推送能在提交前核对当前代. 手动命令行为不变. |

## 3. 跨层契约

### 3.1 命令

```ts
// lib/tauri.ts
type ClipboardAutoPushTarget = { serial: string; contextKey: string } | null;
setClipboardAutoPush(target: ClipboardAutoPushTarget): Promise<number>; // 返回新的 generation
getClipboardAutoPushSupport(): Promise<boolean>;                      // Linux 为 false
onClipboardAutoPushStatus(cb: (event: ClipboardAutoPushEvent) => void): Promise<UnlistenFn>;
```

```rust
#[tauri::command] fn set_clipboard_auto_push(app, state, target: Option<Target>) -> Result<u64, AppError>
#[tauri::command] fn get_clipboard_auto_push_support() -> bool
```

- `set_clipboard_auto_push(Some)` 每次调用都递增 generation, 记录当前变化计数作为基线 (基线之前的内容不推送), 启动该代的后台任务.
- `set_clipboard_auto_push(None)` 递增 generation, 不启动任务. 旧任务在下一次循环或提交前发现代已变化而退出.
- 同一 `contextKey` 重复调用也换代. 前端只在目标真的变化时调用 (依赖数组), A -> B -> A 会得到三代.
- Linux 上 `set_clipboard_auto_push(Some)` 返回 `clipboard.autoPushUnsupported`. 前端在 `get_clipboard_auto_push_support()` 为 `false` 时不会走到这里, 这条错误只防止契约被绕过.

### 3.2 状态事件 `clipboard-auto-push`

```ts
type ClipboardAutoPushEvent = { generation: number; at: number } & (
  | { kind: "watching" }                                   // 任务已启动, 基线已记录
  | { kind: "pushing" }
  | { kind: "pushed" }
  | { kind: "skipped"; reason: "no_text" | "too_large" }
  | { kind: "failed"; error: AppErrorPayload }            // locked, timeout, writeUnconfirmed, hostReadFailed ...
);
```

- Rust 发事件前核对 generation, 前端再按 store 里的当前 generation 过滤一次 (两端都核对, 因为换代和事件发送可能交错).
- 事件不含剪贴板文本.

### 3.3 设置

```ts
interface SettingsPreferences { ...; clipboard: { autoPush: boolean } }
defaultSettings().clipboard = { autoPush: false }
```

- 解码用现有 `flag(group, "autoPush", false)`: 缺省取默认值, 非布尔抛 `settings.invalidField`. 不提升 `SETTINGS_VERSION`.
- 设置行 id `clipboardAutoPush`, 放在 `general` 分区 `background` 之后, 带 `modified` 判断. `general` 的分区重置和全局重置把它恢复为 `false`.

## 4. Rust 后台任务

```text
set_clipboard_auto_push(Some(target))
  gen += 1; baseline = change_count(); spawn task(gen, target, baseline)

task loop (每 500 ms):
  if gen != current -> exit
  count = change_count()
  if count == last_seen -> continue
  last_seen = count
  text = spawn_blocking(read_host_text)          // 插件 ClipboardExt::read_text
    Err(no text / 非文本) -> emit skipped(no_text); continue
    Err(other)            -> emit failed(clipboard.hostReadFailed); continue
  if text.len() > 256 KiB -> emit skipped(too_large); continue
  if hash(text) == last_pushed_hash -> continue  // 同一代内去重, 换代即清空
  emit pushing
  helper = prepare(app, serial).await            // DEX 部署, 可能 await
  if gen != current -> exit                      // 与提交之间不再有 await
  result = submit(helper, text).await            // 现有 exchange + parse + readback
  if gen != current -> exit                      // 旧代结果不发事件
  Ok  -> last_pushed_hash = hash(text); emit pushed
  Err -> emit failed(error)                      // 不重试, 计数已消费
```

- 推送期间计数可能已经多次变化. 推送结束后下一轮只看到最新计数, 读到最新文本, 实现 "只保留最新一条", 不排队.
- 失败不记录 `last_pushed_hash`. 用户再次复制同一文本时计数变化且哈希不同于上次成功, 会再推一次.
- `writeUnconfirmed` 按现有契约不重试, 也不当作成功.
- 哈希用进程内随机种子的 `std::collections::hash_map::RandomState`, 只用于同一代内比较, 不保存文本本身.
- 任务用 `tauri::async_runtime::spawn`, 与 `start_device_poll` 一致; 检查 `adb::is_shutting_down` 退出.
- 新旧两代任务可能短暂并存: 旧任务已在 `submit` 中, 新任务开始轮询. 两者写的是不同代, 旧任务的结果被丢弃. 对同一设备的并发写入与手动按钮并发时一样被辅助程序接受.

### 4.1 变化计数

| 平台 | 实现 | 依赖 |
| --- | --- | --- |
| macOS | `NSPasteboard::generalPasteboard().changeCount()` | `objc2-app-kit` (已在依赖树中, 0.3.x) 打开 `NSPasteboard` feature |
| Windows | `GetClipboardSequenceNumber()` | `windows-sys` 增加 `Win32_System_DataExchange` feature |
| Linux | 无, `get_clipboard_auto_push_support()` 返回 `false` | - |

- 实现时确认 `NSPasteboard` 在 objc2 中是否标记为主线程专用; 若是, 通过 `AppHandle::run_on_main_thread` 取计数, 不绕过类型约束.
- Windows 的序列号在无剪贴板访问权限的会话里返回 0, 此时视为 "计数不变", 不读取内容.

### 4.2 拆分 `clipboard.rs::run`

```rust
async fn prepare(app, serial) -> Result<PreparedHelper, AppError>   // DEX 读取/部署, adb 命令组装
async fn submit(helper, request, is_set) -> Result<ClipboardResult, AppError> // exchange + parse + write_failure 映射
async fn run(app, serial, text) { submit(prepare(app, serial).await?, ...).await }  // 手动命令不变
```

- 文本校验 `validate_text` 和请求编码保持在 `submit` 之前, 自动推送和手动推送共用同一份校验.
- 自动推送读到空文本按 `skipped(no_text)` 处理, 不调用写入.

## 5. 前端

### 5.1 `useClipboardAutoPush` (App 根部)

```ts
const enabled = useSettingsStore(s => s.available && s.preferences.clipboard.autoPush);
const device = 选中设备且 state === "device";
const target = supported && enabled && device && isTauriRuntime()
  ? { serial: device.serial, contextKey: clipboardContextKey(device) } : null;
useEffect(() => { setClipboardAutoPush(target).then(gen => store.bind(gen, target)) }, [target?.contextKey]);
```

- 挂在 App 根部而不是 `ClipboardTool`, 因为工具页或剪贴板模块可能被隐藏, 开关是全局生效的.
- 卸载时调用 `setClipboardAutoPush(null)`.
- `setClipboardAutoPush` 失败: store 记录 `failed`, 模块显示原因; 不 toast.
- 前端用请求序号丢弃过期的 `setClipboardAutoPush` 返回, 只有最后一次调用的 generation 写入 store.

### 5.2 `useClipboardAutoPushStore`

```ts
{ supported: boolean | null; generation: number | null; status: AutoPushStatus }
type AutoPushStatus =
  | { kind: "off" } | { kind: "unsupported" } | { kind: "waitingDevice" } | { kind: "settingsUnavailable" }
  | { kind: "watching" } | { kind: "pushing" } | { kind: "pushed"; at: number }
  | { kind: "skipped"; reason: "no_text" | "too_large"; at: number }
  | { kind: "failed"; error: AppErrorPayload; at: number };
```

- 不持久化. `off` / `unsupported` / `waitingDevice` / `settingsUnavailable` 由前端条件推导, 其余来自事件.
- 换代时状态重置为等待 `watching` 事件, 不保留上一台设备的 "已推送".

### 5.3 剪贴板模块 (A-09) 布局

```text
┌ 剪贴板 ───────────────────────────────┐
│ [推送到手机]        [复制到电脑]      │  h-9, 现有
│ 自动推送到手机                   [◯━] │  h-8, Switch, 整行可点
│ ● 已推送 · 14:03:21                    │  min-h-5, 11px, text-ink2
│ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ │
│ Redmi K70 · USB                        │  现有设备行
└────────────────────────────────────────┘
```

状态行文案 (中文, 英文同步):

| 状态 | 文案 | 颜色 |
| --- | --- | --- |
| off | 不显示状态行 | - |
| unsupported | 当前平台暂不支持自动推送 | ink3 |
| settingsUnavailable | 设置不可用, 自动推送未生效 | warn |
| waitingDevice | 等待设备在线 | ink3 |
| watching | 正在监听电脑剪贴板 | ink2 |
| pushing | 正在推送… | ink2 |
| pushed | 已推送 · HH:MM:SS | ok |
| skipped no_text | 最近一次复制不是文本, 未推送 | ink3 |
| skipped too_large | 最近一次复制超过 256 KiB, 未推送 | warn |
| failed | 未推送: {本地化错误} | err |

- 开关禁用条件: 非 Tauri 运行时, `supported === false`, 设置不可用. 设备离线不禁用开关, 只显示 "等待设备在线".
- 状态行使用 `role="status"` / `aria-live="polite"`, 不抢焦点.
- 失败和跳过都不 toast. 手动按钮的 toast 行为不变.
- 900x600 下模块不能出现横向溢出; 若纵向高度不够, 先确认 A-09 槽位高度, 再决定是否压缩状态行, 不改其他模块.

### 5.4 设置 > 通用

`SettingSwitchRow id="clipboardAutoPush"`, 放在 `background` 之后:

- 标题: 自动推送剪贴板到手机 / Push clipboard to phone automatically
- 说明: 开启后, 电脑上新复制的文本会自动写入当前选中的手机, 包括密码等敏感内容. / When on, newly copied text on this computer is written to the selected phone, including passwords and other sensitive text.
- Linux: 行禁用, 说明替换为 "当前平台暂不支持" (由 `supported` 决定, 不用 userAgent 判断平台).

## 6. 错误码

| code | 来源 | 说明 |
| --- | --- | --- |
| `clipboard.autoPushUnsupported` | Rust | Linux 上被调用 |
| `clipboard.hostReadFailed` | Rust (新增 Rust 常量, 前端已有同名码) | 插件读取失败, cause 带原始错误 |
| 其余 | 复用 `set_device_clipboard` 的错误 | locked, timeout, writeUnconfirmed 等 |

新增码同步 `error_codes.rs`, `backend-en.ts`, `backend-zh-CN.ts`, `backendErrorContract.ts`.

## 7. 规范修订

- `settings-clipboard.md`: "Read source clipboard only on click... Do not poll" 改为: 手动传输只在点击时读取; 自动推送只在 Rust 轮询变化计数, 计数变化才读取内容; 两者都不预览, 不持久化, 不记录内容, 自动推送的内容不进入网页. 补充 `clipboard.autoPush` 设置, 前端目标推导, generation 过滤.
- `backend/clipboard.md`: 新增自动推送小节: 计数平台实现, 基线, 去重, 不排队, 不重试, 提交前核对 generation, 事件不含文本, `prepare` / `submit` 拆分.

## 8. 平台差异与风险

- macOS 剪贴板隐私提示: 若系统启用, 每次自动读取可能弹出提示, 用户可以选择始终允许. 用 `defaults write com.qi.adb-gui EnablePasteboardPrivacyDeveloperPreview -bool yes` 在打包应用里实测并记录结果; 不做绕过.
- Android 13+ 剪贴板浮层: 每次推送手机上会出现一次, 属于系统行为, 不处理.
- 手动 "复制到电脑" 会改变电脑剪贴板, 自动推送会把同一文本写回手机一次. 内容相同, 无害, 不做特殊处理.
- Windows 只能做交叉编译检查 (`cargo check --target x86_64-pc-windows-msvc`), 真机行为由发布后反馈验证, 在测试记录里注明.

## 9. 回滚

- 前端: 移除 `useClipboardAutoPush` 挂载即停用, 设置字段保留无害.
- Rust: `clipboard_auto_push.rs` 独立模块, 移除命令注册即可; `prepare` / `submit` 拆分不改变手动命令行为, 可保留.
