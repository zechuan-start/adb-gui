# 条码二维码解析 — 技术设计

## 1. 架构与边界

沿用生码侧已验证的四层切分, 解码侧一一对应. 不新建目录, 不引入 feature 文件夹.

| 层 | 新增文件 | 职责 | 是否可单测 |
|---|---|---|---|
| 纯逻辑 | `src/lib/codeDecoder.ts` | 类型契约 + 纯函数 (扩展名判定, 路径过滤, ReadResult 归一, 复制文本拼接, URL 判定) | 是 |
| WASM 边界 | `src/lib/zxingReader.ts` | 编码图片字节经 WebView 解码为 `ImageData` + `locateFile` 覆盖 + `readBarcodes` 薄封装 + 缩略图生成, 唯一 import `zxing-wasm/reader` 的位置 | 否 (WASM) |
| Tauri 桥接 | `src/lib/tauri.ts` (改) | 新增 `readImageFile` / `pickImageFiles` / `readClipboardImage` / `openUrlExternal` | 否 |
| 状态 | `src/store/codeDecoder.ts` | zustand, 批次 + 进度 + 错误 | 是 |
| UI | `src/components/CodeDecoderPage.tsx` | 工作区: 投入区 + 结果列表 | 否 |
| 后端 | `src-tauri/src/commands/image_file.rs` | `read_image_file(path) -> Vec<u8>` | 否 |

`GeneratedCodeCanvas.tsx` 是生码侧的编码器边界, `zxingReader.ts` 是解码侧的对称物: 两者都把第三方码库锁在单文件内, 上层只见普通类型.

## 2. 三个输入源归一

三个来源的产物形态不同, 必须先归一再进解码器. 这是本设计最容易出错的地方.

```
文件选择 (plugin-dialog)  ──> string[] 路径 ─┐
拖拽 (onDragDrop)         ──> string[] 路径 ─┼─> read_image_file ──> Uint8Array
                                             ┘                         │
                                                                       └─> Blob -> createImageBitmap -> ImageData
剪贴板 (readImage)        ──> Image 资源 ────> .rgba() + .size() ─────────> ImageData
```

关键差异: `@tauri-apps/plugin-clipboard-manager` 的 `readImage()` 返回 Tauri `Image` 资源, `.rgba()` 给的是**原始 RGBA 字节**, 不是 PNG 编码字节. 因此剪贴板分支直接构造 `ImageData`:

```ts
const image = await readImage();
const [rgba, { width, height }] = await Promise.all([image.rgba(), image.size()]);
const imageData = new ImageData(new Uint8ClampedArray(rgba), width, height);
```

文件分支不能把 `Uint8Array` 直接交给 zxing: reader 内置的 stb_image 不支持 WebP, 会违反 PRD 的 WebP 验收条件. `zxingReader.ts` 必须先把编码字节包装为 `Blob`, 通过 `createImageBitmap` + `OffscreenCanvas` 解码为 `ImageData`, 并在 `finally` 中调用 `bitmap.close()`. 三个输入源最终只允许一种解码入口:

```ts
type DecodeInput = ImageData;
```

统一的来源描述对象. 像素不直接持有, 而是惰性 loader: 若投入时一次性物化 50 张图的 `ImageData`, 内存峰值可达 GB 级; 惰性化后由解码循环逐张取像素, JS 侧峰值恒为单张.

```ts
export interface DecodeSource {
  /** 展示用名称: 文件名, 或 "剪贴板图片" */
  name: string;
  /** 有路径的来源保留路径, 剪贴板为 null */
  path: string | null;
  /** 惰性取像素. 文件源在内部完成 读字节 -> Blob -> ImageData; 剪贴板源直接返回已组装的 ImageData */
  loadInput: () => Promise<DecodeInput>;
}
```

## 3. 数据契约

### 3.1 纯逻辑层类型 (`src/lib/codeDecoder.ts`)

```ts
export const SUPPORTED_IMAGE_EXTENSIONS = ["png", "jpg", "jpeg", "gif", "bmp", "webp"] as const;

/** 单个识别到的码 */
export interface DecodedCode {
  text: string;
  /** zxing 规范格式名, 如 "QRCode" / "Code128" */
  format: string;
  /** 是否 http/https URL, 决定是否显示"浏览器打开" */
  isUrl: boolean;
}

/** 一张图的解码结果 */
export interface DecodedImage {
  id: number;
  name: string;
  path: string | null;
  /** 缩略图 dataURL, 最长边 ~96px; 生成失败或整图失败时为空字符串 */
  thumbnail: string;
  codes: readonly DecodedCode[];
  /** 该图整体失败原因; 成功但零结果时为空字符串 */
  error: string;
}

export interface DecodedBatch {
  id: number;
  images: readonly DecodedImage[];
}
```

零结果与失败是**两个不同状态**, 不合并: `codes: [], error: ""` 表示"图片正常但没找到码", `error` 非空表示"图片读不了/解不了". UI 文案不同, 不能靠 `codes.length === 0` 一个条件混判.

### 3.2 Rust 命令契约

```rust
#[tauri::command]
pub fn read_image_file(path: String) -> Result<tauri::ipc::Response, String>
```

返回 `tauri::ipc::Response::new(bytes)`, 底层走 `InvokeResponseBody::Raw(Vec<u8>)`, 前端 `invoke` 得到 `ArrayBuffer`. 已在 `tauri-2.11.3/src/ipc/mod.rs:103` 确认该 variant 存在.

不用项目现有 `app_icon.rs` 的 base64 data URL 约定: 那里的 PNG 图标只有几 KB, 而这里的截图可达数 MB, base64 会膨胀 33% 并多一轮字符串编解码. 二进制回传是同一个 Tauri 版本内的既有能力, 不是新机制.

命令内的顺序: 规范化路径 -> 校验扩展名 -> 校验体积上限 -> 读字节. 扩展名和体积在 Rust 侧再校验一次不是"平行校验", 而是因为前端校验挡不住后续直接调用该 command 的路径; 这是信任边界, 不是重复逻辑.

### 3.3 桥接层新增 (`src/lib/tauri.ts`)

```ts
export async function readImageFile(path: string): Promise<Uint8Array>
export async function pickImageFiles(): Promise<string[]>
export async function readClipboardImage(): Promise<ImageData | null>
export async function openUrlExternal(url: string): Promise<void>
```

`readClipboardImage` 在剪贴板无图时返回 `null` 而不抛错 — 无图是正常状态, 不是异常.

## 4. WASM 加载

```ts
// src/lib/zxingReader.ts
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";

prepareZXingModule({
  overrides: {
    locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path),
  },
});
```

要点:

- 默认 `fireImmediately` 为 false, 模块顶层调用只登记覆盖, 不触发下载. WASM 在首次 `readBarcodes` 时实例化, 应用启动不受影响.
- 用 `zxing-wasm/reader` 子路径 (1.04 MiB), 不用 `full` (1.46 MiB) — 编码侧已有 `qrcode` + `jsbarcode`, 不需要 zxing 的 writer.
- `?url` 让 Vite 把 wasm 作为本地资源打进 `dist/assets/`, 彻底断开 jsDelivr CDN 依赖. 桌面应用必须离线可用.
- 该 import specifier 依赖 `zxing-wasm` 的 exports map 已显式暴露 `./reader/zxing_reader.wasm` (已确认). 若实际构建中 Vite 解析失败, 回退方案是 `vite-plugin-static-copy` 或手工拷贝 wasm 到 `public/`, 再把 `locateFile` 指向 `/zxing_reader.wasm`. 实施时必须实际验证产物, 不能只看 dev 通过.
- 实施补充 (S5 落地确认): 即使 `locateFile` 已覆盖, zxing-wasm 的 `share.js` 仍会把 jsDelivr 默认前缀作为死代码字符串打进产物. `vite.config.ts` 新增 `removeZxingCdnFallback` 插件在构建期将该 CDN origin 置空, 使 G1 的 `rg "jsdelivr"` 门禁可机械核验; 运行时加载不受影响, 且覆盖若失效只会本地 404, 不会回落 CDN. zxing-wasm 改版后插件自动 no-op, 由 G1 门禁兜底.

解码选项:

```ts
{ formats: [], tryHarder: true, maxNumberOfSymbols: 0 }
```

`formats: []` 表示全格式 (`readerOptions.d.ts` 默认值), `maxNumberOfSymbols: 0` 解除数量上限, 二者共同满足 PRD 的 R2 全码制和 R5 多码要求.

## 5. 解码流程与并发

```
用户投入 -> store.decode(sources)
  ├─ 生成新 batchId, runToken += 1
  ├─ 逐张 (顺序, 非并发):
  │    ├─ 检查 runToken 是否失效 -> 失效则整体丢弃
  │    ├─ loadInput() -> ImageData (惰性物化, 峰值恒为单张)
  │    ├─ readBarcodes(imageData, opts)
  │    ├─ 生成缩略图 dataURL, 此后不再持有 ImageData
  │    ├─ ReadResult[] -> DecodedCode[] (纯函数归一)
  │    └─ 追加到 batch, 更新进度
  └─ 完成, 清进度
```

顺序而非并发的理由: WASM 模块单实例, 并发解码多张数 MB 图会让 WASM 堆同时驻留多份像素缓冲, 内存峰值不可控. 顺序处理配合逐张进度反馈, 体验上已经足够 (单张典型 < 200ms).

`runToken` 解决的是竞态: 用户在解码中途点"清空"或再次投入新图, 旧的 await 链仍会回来. 每次 `decode` / `clear` 递增 token, 回调写回前比对, 不匹配就丢弃. 生码侧的 `sourceRevision` 是同一思路的同构物.

单图失败不中断整批: 每张图的解码包在自己的 try/catch 内, 失败写入该图的 `error` 字段, 循环继续. 这是 PRD R6 的直接落地.

## 6. UI 结构

```
CodeDecoderPage (section, grid 与生码页同断点)
├── 左栏 投入区 (320px)
│   ├── 拖拽落区 (虚线框, dragState 反馈)
│   ├── [选择图片] 按钮
│   ├── [从剪贴板粘贴] 按钮
│   ├── 进度 / 错误行
│   └── [清空] 按钮
└── 右栏 结果区
    ├── 头部: "N 张图 / M 个码" + [复制全部]
    └── 结果列表 (虚拟滚动, 按图分组)
        └── 每图一卡: 图名 + 缩略图 + 码列表
             └── 每码一行: format 徽章 + 文本 + [复制] + [浏览器打开]?
```

复用生码页的布局骨架 (`grid-cols-[320px_minmax(0,1fr)]` + 900px 断点), 保证两个页签手感一致, 也直接满足 PRD 的最小窗口 900×600 约束.

虚拟滚动沿用 `@tanstack/react-virtual`, 与 `CodeGeneratorPage.tsx:233` 同配置思路. 分组结构下虚拟化的单位是"图", 不是"码" — 一张图内的码数量有限, 整卡渲染即可.

拖拽处理复刻 `src/components/AppManager.tsx:111-137` 的 effect 模式 (disposed 标志 + unlisten 兜底). 已确认"工具"页用 `&&` 条件渲染 (`src/App.tsx:269-294`), 离开时 `ApkTool` 卸载并解绑其监听, 解码页与 APK 拖拽不会同时在线, 无事件互抢. ("日志"页在 logcat 重构后改为常驻隐藏, 不再走 `&&`, 但它不监听拖拽, 与此结论无关.)

## 7. 权限与配置改动

`src-tauri/capabilities/default.json` 新增:

```json
"clipboard-manager:allow-read-image"
```

只加读图片这一条, 不加 `clipboard-manager:default` (含写权限) — 写文本走的是 `navigator.clipboard.writeText`, 不需要插件写能力. 最小权限.

**不改** `fs` capability: 图片字节由自建 Rust command 读取, 不放宽 `fs:default` 的 `deny-default` 边界. 这是有意选择 — 放宽 `fs` scope 会给整个前端敞开任意路径读能力, 而自建 command 的作用域仅限"读一张校验过的图片", 权限面小一个数量级.

`src-tauri/Cargo.toml` 新增 `tauri-plugin-clipboard-manager = "2"`, `lib.rs` 注册 plugin 并挂载新 command.

`package.json` 新增 `zxing-wasm@3.1.2` 与 `@tauri-apps/plugin-clipboard-manager@2.3.2`, 按项目现有风格用 `^` 前缀 (与 `qrcode`, `jsbarcode` 一致).

## 8. 取舍记录

| 决策 | 选择 | 放弃的方案与原因 |
|---|---|---|
| 解码库 | zxing-wasm reader | jsQR 只支持二维码且 2021 后停更; rxing (Rust) 会拉长编译并让前端拿不到即时反馈 |
| 解码位置 | 前端 WASM | Rust 侧解码需要新增图像解码依赖, 且与"生码在前端"不对称 |
| 图片字节传输 | `ipc::Response` 二进制 | base64 data URL 膨胀 33%, 数 MB 图片代价明显 |
| 文件读取 | 自建 command | 放宽 `fs` capability 会敞开任意路径读, 权限面过大 |
| 剪贴板 | clipboard-manager 插件 | 原生 paste 在 Tauri webview 中拿图片不可靠, 跨平台不一致 |
| 批内并发 | 顺序 | 并发让 WASM 堆内存峰值不可控 |
| WASM 子路径 | reader | full 多 400 KiB 的 writer, 编码侧已有库覆盖 |

## 9. 兼容性与回滚

新增功能与现有链路无共享写状态: 新页签, 新 store, 新 command, 新 capability 条目. 对工具/日志/应用/文件/生码五个既有页签零改动 (`App.tsx` 只加一个 `TabId` 成员, 一个 `TABS` 条目和一行条件渲染).

回滚粒度: 移除 `App.tsx` 的页签注册即可让功能下线而不影响其余部分; 完整回滚为撤销本任务全部新增文件 + 三处配置改动 (`package.json`, `Cargo.toml` / `lib.rs`, `capabilities/default.json`).
