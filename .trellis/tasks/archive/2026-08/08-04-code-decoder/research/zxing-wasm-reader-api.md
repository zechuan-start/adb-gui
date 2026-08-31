# zxing-wasm reader API 与集成约束

调研时间: 2026-08-04
调研对象: `zxing-wasm@3.1.2` (npm latest, 发布 2026-07-18)

---

## 选型结论

`zxing-wasm` 是 `zxing-cpp` 的 WASM 编译版, 同时覆盖二维码和一维条码, 与本项目生码侧的 `qr` + `code128` 完全对称.

对比被排除的候选:

| 候选 | 版本 | 排除原因 |
|---|---|---|
| `jsqr` | 1.4.0 | 只支持 QR, 不支持任何一维条码; 上游 2021-04-24 后未再发版 |
| `@zxing/library` | 0.23.0 | 纯 JS 移植, 解码成功率和维护活跃度均弱于 wasm 版 |
| `rxing` (Rust) | 0.9.2 | 需要 Rust 侧解码, 增加编译时长与二进制体积; 本任务已定为前端解码 |

---

## 子路径与产物体积

包内有三个入口, 只需要 reader:

| 子路径 | wasm 产物 | 体积 |
|---|---|---|
| `zxing-wasm` / `zxing-wasm/full` | `zxing_full.wasm` | ~1.46 MiB |
| `zxing-wasm/reader` | `zxing_reader.wasm` | ~1.04 MiB |
| `zxing-wasm/writer` | `zxing_writer.wasm` | ~636 KiB |

本任务只用 `zxing-wasm/reader`. 生码侧继续用现有的 `qrcode` + `jsbarcode`, 不切换到 `zxing-wasm/writer` (超出范围, 且会动到已验收的生码链路).

---

## 关键约束: 默认从 CDN 加载 wasm

`readBarcodes` 首次调用会实例化 wasm 模块, **默认从 jsDelivr CDN 下载**. 桌面离线工具不能接受这个行为.

必须用 `prepareZXingModule` 覆盖 `locateFile`, 指向本地打包产物:

```ts
import { prepareZXingModule, readBarcodes } from "zxing-wasm/reader";
import wasmUrl from "zxing-wasm/reader/zxing_reader.wasm?url";

prepareZXingModule({
  overrides: { locateFile: () => wasmUrl },
});
```

`?url` 可行性已验证: 包的 `exports` 字段显式暴露了 wasm 子路径, Vite 能解析并把它 emit 成本地资源.

```
"./reader/zxing_reader.wasm" -> { "default": "./dist/reader/zxing_reader.wasm" }
```

`prepareZXingModule` 的重载:

- `fireImmediately` 省略或 `false` -> 返回 `void`, 只登记 overrides, 首次 `readBarcodes` 时才实例化
- `fireImmediately: true` -> 返回 `Promise<ZXingReaderModule>`, 立即下载并实例化

配套还有 `purgeZXingModule()` 可释放已实例化的模块.

---

## 解码 API

```ts
declare function readBarcodes(
  input: Blob | ArrayBuffer | Uint8Array | ImageData,
  readerOptions?: ReaderOptions,
): Promise<ReadResult[]>;
```

`Uint8Array` 和 `Blob` 都直接接受, 不需要先画到 canvas 取 `ImageData`. 图片解码由 wasm 内部完成.

`readBarcodesFromImageFile` 和 `readBarcodesFromImageData` 已 deprecated, 不要用.

### ReadResult 有用字段

| 字段 | 类型 | 说明 |
|---|---|---|
| `text` | `string` | 解码文本, 按 `textMode` 转码 |
| `bytes` | `Uint8Array` | 原始字节, 未做字符集转换 |
| `format` | `ReadOutputBarcodeFormat` | 规范格式名, 如 `"QRCode"` / `"Code128"` / `"EAN13"`; 空结果为 `"None"` |
| `symbology` | `BarcodeSymbology` | 格式所属族, 如 `EAN13` -> `EANUPC`, `MicroQRCode` -> `QRCode` |
| `isValid` | `boolean` | 结果是否有效 |
| `error` | `string` | 错误信息, 需要 `returnErrors: true` 才有内容 |
| `position` | `Position` | 码在图中的四角坐标 |
| `orientation` | `number` | 旋转角度 |
| `contentType` | `ContentType` | 内容类型提示 |
| `isMirrored` / `isInverted` | `boolean` | 镜像 / 反色 |

注意 `format` 是规范枚举名形式 (`"QRCode"`), 不是 HRI 标签 (`"QR Code"`).

### ReaderOptions 默认值

| 选项 | 默认 | 说明 |
|---|---|---|
| `formats` | `[]` | 空数组表示搜索全部支持格式 |
| `tryHarder` | `true` | 牺牲速度换准确率 |
| `tryRotate` | `true` | 尝试 90 / 180 / 270 度旋转 |
| `tryInvert` | `true` | 尝试反色码 |
| `tryDownscale` | `true` | 尝试降采样检测 |
| `tryDenoise` | `false` | 形态学闭运算去噪, experimental, 仅 2D |
| `maxNumberOfSymbols` | `255` | 单图最多识别几个码, `0` 表示无限制 |
| `isPure` | `false` | 输入是单个完美对齐的码时可设 `true` (生成图) |
| `returnErrors` | `false` | 是否返回带错误的结果 |
| `binarizer` | `"LocalAverage"` | 灰度转二值算法 |
| `downscaleThreshold` | `500` | `min(width,height)` 超过才降采样 |
| `downscaleFactor` | `3` | 降采样倍数, 有效值 2/3/4 |
| `minLineCount` | `2` | 一维码需要几条扫描线一致 |
| `validateOptionalChecksum` | `false` | 校验 Code39 / ITF 等可选校验位 |
| `eanAddOnSymbol` | `"Ignore"` | EAN-2/5 附加码处理 |

默认值对"截图里找码"这个场景已经够用, 不需要额外调参. `tryHarder` / `tryRotate` / `tryInvert` 默认都是 `true`.

---

## 编码图片输入支持哪些格式

README 没有记录这一点. 通过扫描 `dist/reader/zxing_reader.wasm` 的可打印字符串确认: wasm 内置 **stb_image**.

判定依据是 stb_image 的特征错误串:

```
bad png sig
bmp jpeg/png
xxxx png chunk not known
not BMP
no SOI          (JPEG 起始标记)
outofmem
```

同时命中 `psd`, `pnm`, `hdr`, `gif` 等格式名.

因此 `readBarcodes` 直接吃 `Blob` / `ArrayBuffer` / `Uint8Array` 时, 可解的编码格式是 stb_image 的支持集:

**PNG, JPEG, BMP, GIF, PSD, TGA, PNM, HDR, PIC**

关键缺口: **不支持 WebP**. 扫描中没有任何 `webp` 字符串.

### 应对: 统一走浏览器解码 -> ImageData

不把原始字节丢给 zxing, 而是先用 webview 自带的图片解码能力转成 `ImageData`, 再交给 `readBarcodes`:

```ts
const bitmap = await createImageBitmap(blob);
const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
const ctx = canvas.getContext("2d")!;
ctx.drawImage(bitmap, 0, 0);
const imageData = ctx.getImageData(0, 0, bitmap.width, bitmap.height);
const results = await readBarcodes(imageData);
bitmap.close();
```

三点收益:

1. 格式覆盖扩到 webview 支持的全集, 包含 WebP 和 AVIF, 不受 stb_image 限制.
2. 与剪贴板链路统一. 插件的 `readImage()` 只能给 RGBA, 本来就要组装 `ImageData`; 文件链路也走 `ImageData` 后, 三个输入源汇聚成同一条解码管线, 不存在两套事实源.
3. 位图已经在手, 结果按图分组时的缩略图可以直接复用, 不用二次读盘.

代价是每张图多一次 canvas 绘制. 批量场景下逐张顺序处理, 可接受.

---

## 图片字节从哪来: Tauri 侧约束

### 约束 1: 拖拽拿到的是路径, 不是 File 对象

`tauri.conf.json` 未设置 `dragDropEnabled`, 取默认值 `true`. Tauri 会拦截 OS 级拖拽并发出 `tauri://drag-drop` 事件, webview 的 HTML5 `drop` 事件因此不会携带文件.

`src/lib/tauri.ts:257` 的 `onDragDrop` 封装的就是这个事件, `src/components/AppManager.tsx:124` 已在用它接收 APK 路径.

所以不能改用 HTML5 `File` 拖拽: 那需要全局设 `dragDropEnabled: false`, 会直接破坏 AppManager 的 APK 拖拽安装.

结论: 拖拽进来的图片只有路径, 必须再单独读字节.

### 约束 2: `fs:default` 读不了用户任意路径

`src-tauri/capabilities/default.json` 当前只有 `fs:default`. 该权限集的实际内容:

```
permissions: [
  "create-app-specific-dirs",
  "read-app-specific-dirs-recursive",
  "deny-default"
]
```

只放开 AppConfig / AppData / AppLocalData / AppCache / AppLog 这几个应用专属目录. 用户桌面, 下载目录或任意拖拽来源的图片都读不到.

要用 `@tauri-apps/plugin-fs` 的 `readFile` 读任意图片, 需要额外加 `fs:allow-home-read-recursive` 一类的宽范围权限, 等于把整个 home 目录的读权限暴露给前端.

### 可选读法对比

| 方案 | 新增依赖 | 权限面 | 与项目约定 |
|---|---|---|---|
| 新增 Rust command 读字节 | 无 | 只暴露"读一个图片文件"这一个能力 | 契合: 所有后端访问都走 `commands/` + `lib/tauri.ts` 桥接 |
| `plugin-fs` + 宽 scope | 无 (已装) | 整个 home 目录可读 | 偏离: 前端直接拿到通用文件读能力 |

`src/lib/tauri.ts` 目前没有任何 `plugin-fs` 调用, 项目里所有后端访问都是 Rust command. 新增 command 更符合既有边界.

### 剪贴板

浏览器原生 `paste` 事件在 Tauri v2 webview 中可用, `ClipboardEvent.clipboardData` 能拿到图片 blob, 不需要任何插件或权限.

`tauri-plugin-clipboard-manager` 的 `readImage()` 是另一条路, 优点是可以做成按钮触发而不依赖粘贴焦点, 代价是新增 Rust 依赖 + capability 条目.

---

## 现有可复用资产

| 位置 | 可复用内容 |
|---|---|
| `src/lib/codeGenerator.ts` | draft / batch / revision 快照模型, `ok`-tagged union 错误契约 |
| `src/store/codeGenerator.ts` | zustand store 形态, `updateDraft` 幂等比较 |
| `src/components/CodeGeneratorPage.tsx` | 左侧输入面板 + 右侧虚拟列表结果 + 放大预览 dialog 布局 |
| `src/components/GeneratedCodeCanvas.tsx` | 编解码库边界组件的封装范式 (loading / error / 库调用隔离) |
| `src/components/AppManager.tsx:124` | `onDragDrop` 拖拽接入范式 |
| `src/lib/tauri.ts` | 唯一的 Tauri 桥接层, 新 command 在这里加封装 |
| `src-tauri/src/commands/mod.rs` | command 模块注册位置 |
