# 条码二维码解析 — 实施计划

prd.md 定义验收范围, design.md 定义契约与取舍. 本文只回答: 按什么顺序做, 每步怎么验证, 出错怎么退.

总原则: 自底向上, 每步落定一层并独立验证, UI 最后接线. 全程不动生码链路与既有五个页签.

## 验证命令

| 命令 | 用途 | 适用步骤 |
|---|---|---|
| `pnpm test` (vitest run, 定向跑加文件参数) | 单测 | S2, S6, S9 |
| `pnpm build` (tsc + vite build) | 类型 + 产物检查 | S5, S7, S9 |
| `cargo check` (在 src-tauri/) | Rust 编译检查, 不引入新警告 | S1, S3, S9 |
| `pnpm tauri dev` | 界面冒烟 | S7, S8 |

单测执行统一 60 秒硬超时.

## 步骤清单

### S1 依赖与权限配置

- [x] `pnpm add zxing-wasm@^3.1.2 @tauri-apps/plugin-clipboard-manager@^2.3.2`
- [x] `src-tauri/Cargo.toml` 加 `tauri-plugin-clipboard-manager = "2"`; `lib.rs` 注册 plugin
- [x] `capabilities/default.json` 只加 `"clipboard-manager:allow-read-image"` 一条 (design §7, 不加含写权限的 default 集)
- 已核实无需新增: `plugin-dialog` / `plugin-opener` 依赖与 `dialog:default` / `opener:default` capability 均已就位 (opener:default 含 allow-open-url).
- 验证: `pnpm install` 干净完成; `cargo check` 通过.
- 回滚点 R1: 撤销上述三处配置即回到基线.

### S2 纯逻辑层 `src/lib/codeDecoder.ts` + `codeDecoder.test.ts`

- [x] 类型契约: `DecodedCode` / `DecodedImage` (含 thumbnail) / `DecodedBatch` / `DecodeSource` (惰性 loadInput), 与 design §2 / §3.1 逐字段一致.
- [x] 纯函数 (全部有单测):
  - `isSupportedImagePath(path)`: 扩展名白名单 png / jpg / jpeg / gif / bmp / webp, 大小写不敏感.
  - `partitionImagePaths(paths)`: 返回 `{accepted, rejectedCount, truncatedCount}`; 先滤非图, 再截 50 上限, 数量供提示文案使用, 不静默丢弃.
  - `normalizeReadResults(results)`: `ReadResult[]` -> `DecodedCode[]`; 过滤 `isValid === false`, format 规范名原样透传.
  - `isHttpUrl(text)`: trim 后按 `/^https?:\/\//i` 判定.
  - `buildCopyAllText(batch)`: 每码一行, 按图序与码序拼接.
  - `summarizeBatch(batch)`: `{imageCount, decodedImageCount, codeCount}`.
- 验证: `pnpm test src/lib/codeDecoder.test.ts`.

### S3 Rust command `read_image_file`

- [x] `src-tauri/src/commands/image_file.rs`: `read_image_file(path: String) -> Result<tauri::ipc::Response, String>`.
- [x] 命令内顺序 (design §3.2): 规范化路径 -> 扩展名白名单 -> 体积上限 -> 读字节 -> `ipc::Response::new(bytes)`. 这是信任边界校验, 与前端 partition 不构成重复逻辑.
- [x] `commands/mod.rs` 声明模块, `lib.rs` `invoke_handler` 注册.
- 给定值: 体积上限 64 MiB, 超限返回可读错误.
- 验证: `cargo check` 通过且无新警告.
- 回滚点 R2: S2-S6 全部是新增文件, 删除文件 + 撤销注册行即可整体回退.

### S4 桥接层 `src/lib/tauri.ts` 新增四个封装

- [x] `readImageFile(path): Promise<Uint8Array>` — invoke 拿 ArrayBuffer, 包一层 Uint8Array.
- [x] `pickImageFiles(): Promise<string[]>` — 复用已 import 的 plugin-dialog `open`, `multiple: true` + 图片扩展名 filter, 用户取消返回 [].
- [x] `readClipboardImage(): Promise<ImageData | null>` — plugin-clipboard-manager `readImage()`; "剪贴板无图" 归一为 null (正常态, 该判定只存在于此一处), 其余错误原样抛出; 组装 ImageData 前校验 `rgba.length === width * height * 4`, 不符按错误处理.
- [x] `openUrlExternal(url): Promise<void>` — plugin-opener 的 `openUrl` (现有 import 只有 openPath / revealItemInDir, 需补).
- 验证: 类型检查随 S5 / S7 的 `pnpm build`.

### S5 WASM 边界 `src/lib/zxingReader.ts` — 评审门 G1

- [x] `prepareZXingModule` + `locateFile` 覆盖, wasm 走 `?url` 本地资源 (design §4, 默认不 fireImmediately).
- [x] `blobToImageData(blob)`: createImageBitmap + OffscreenCanvas, finally 中 `bitmap.close()`.
- [x] `decodeImageData(input)`: `readBarcodes(input, { formats: [], tryHarder: true, maxNumberOfSymbols: 0 })`.
- [x] `imageDataToThumbnail(imageData)`: 最长边 96px 的 dataURL, 失败返回 "".
- **G1 验证 (design 标记的最高风险, 必须过 build 产物, 不能只看 dev)**:
  - `pnpm build` 成功, `dist/assets/` 出现 zxing reader 的 wasm 产物;
  - `rg -l "jsdelivr" dist/` 无命中;
  - 失败则切 design §4 回退方案 (wasm 拷入 `public/` + locateFile 指根路径), 重过本条两项.
  - wasm 实例化的运行时验证并入 S7 首次界面解码 (首次 readBarcodes 触发实例化), 离线行为在 S8 专项验证.

### S6 状态层 `src/store/codeDecoder.ts` + test

- [x] state: `batch: DecodedBatch | null`, `progress: {done, total} | null`; `runToken` 为内部竞态票据.
- [x] actions: `decodeSources(sources: DecodeSource[])`, `clear()`. 三种来源组装成 DecodeSource 由页面侧完成: 文件 / 拖拽路径 -> loadInput 内部 `readImageFile` + `blobToImageData`; 剪贴板 -> 已有 ImageData 直接闭包返回.
- [x] 循环语义 (design §5): 顺序逐张; loadInput 惰性单张物化; 单张 try/catch 失败写该图 error 不中断整批; 每张完成即写回 (增量出结果); 缩略图生成后不再持有 ImageData.
- [x] `runToken`: decode / clear 各自递增, 异步回写前比对, 不匹配即丢弃.
- [x] `progress` 非空时拒绝新批次提交, 落实 "禁止重复提交同一批".
- 单测: `vi.mock` 掉 `lib/tauri` 与 `lib/zxingReader`, 覆盖: 进度推进与增量写回, 单张失败隔离, 清空后旧 await 被丢弃, 解码中重复提交被拒, 零结果 vs 失败两态分离, 50 上限截断.
- 验证: `pnpm test src/store/codeDecoder.test.ts`.

### S7 UI `src/components/CodeDecoderPage.tsx` + 页签注册

- [x] 两栏骨架与断点复制生码页 (`grid-cols-[320px_minmax(0,1fr)]`, 900px 断点).
- [x] 拖拽: 复刻 `AppManager.tsx:111-137` 的 effect 范式 (disposed 标志 + unlisten 兜底); 路径过滤走 `partitionImagePaths`, 拒收 / 截断用既有 toast 提示.
- [x] 粘贴: 按钮与 `Ctrl/Cmd+V` 走同一条 `readClipboardImage` 管线; 快捷键仅解码页在显时监听, 焦点在可编辑控件时不拦截; 剪贴板无图给明确提示.
  - macOS 验证点: 菜单 `PredefinedMenuItem::paste` 已绑 Cmd+V, 若 keydown 不可达则改监听 DOM `paste` 事件, 仍只调 `readClipboardImage`, 不引入第二条取图路径.
- [x] 结果区: 虚拟滚动以 "图" 为单位 (`@tanstack/react-virtual`, 参照 CodeGeneratorPage); 每卡 = 图名 + 缩略图 + 码列表 (format 徽章 + 文本 + 复制 + URL 时 "浏览器打开"); 头部汇总 + 复制全部; "未识别到码" 与失败原因两种文案分开渲染.
- [x] 复制: `navigator.clipboard.writeText` + `showToast("success", ...)` 既有做法.
- [x] `App.tsx`: `TabId` 加 `"decoder"`, `TABS` 加 "解码", `&&` 条件渲染 (卸载不丢结果, 结果在 store).
- 验证: `pnpm build`; `pnpm tauri dev` 三来源各解一次 (兼做 wasm 实例化冒烟).
- 回滚点 R3: 摘除 App.tsx 页签注册即可单点下线 (design §9).

### S8 集成冒烟 — 评审门 G2

按 prd.md 验收清单逐条人工核验, 重点项:

- [x] 三来源 x 多图; 非图混投有提示且不影响同批; 超 50 截断提示.
- [x] 单图多码全部列出; WebP 可解 (ImageData 统一管线的核心验证).
- [x] 断网下全新启动, 首次解码可用, 期间无任何 CDN 请求.
- [x] 生码页产 QR + Code128 图片, 解码往返逐字一致.
- [x] URL 行为: http / https 显示打开操作且能拉起默认浏览器; 非 URL 不显示.
- [x] 进度显示; 解码中无法重复提交; 清空复位.
- [x] 切页签结果保留; 应用重启不恢复.
- [x] 亮 / 暗主题与 900x600 最小窗口无遮挡.
- [x] 回归: "工具" 页 APK 拖拽安装不受影响.
- 结果记录到本任务 `validation.md`; 未过项回到对应步骤修复后重跑该项.

### S9 收口

- [x] 全量 `pnpm build` + `pnpm test`; `cargo check` 无新警告.
- [x] diff 复查: 无生码链路改动, 无 fs capability 放宽, 无吞错 / 静默 fallback / 第二事实源.
- [x] 进入 Phase 3: 按需更新 spec (若沉淀了新范式), 提交.

## 风险与应对

| 风险 | 暴露信号 | 应对 |
|---|---|---|
| `?url` 导入 wasm 在构建产物中解析失败 | G1 的 build / rg 检查不过 | design §4 回退: public/ 拷贝 + locateFile 指根路径 |
| Cmd+V 被 macOS 菜单 accelerator 消费, keydown 不触发 | S7 手测 | 改监听 DOM paste 事件, 仍走 readClipboardImage 单管线 |
| `readImage()` 空剪贴板行为跨平台不一致 (抛错 vs 空值) | S4 / S8 手测 | 桥接层把 "无图" 归一为 null, 判定只存在于一处 |
| 大图批量内存峰值 | S8 用大尺寸截图批量验证 | 惰性 loadInput + 顺序解码 + 缩略图后释放, 已在契约层锁定 |
| 剪贴板 rgba 长度与 size 不匹配 (平台差异) | 组装 ImageData 抛异常 | 桥接层前置长度校验, 报可读错误 |

## 给定值 (评审时可调, 不阻塞开工)

- 单文件体积上限 64 MiB; 缩略图最长边 96px.
- `normalizeReadResults` 过滤 `isValid === false` 的结果, `returnErrors` 保持 false; 如需展示残缺结果再评估.
