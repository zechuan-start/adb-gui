# 条码二维码解析

## Goal

在现有 ADB GUI 桌面工具中增加"解码"能力: 用户提供一张或多张图片, 应用在本地识别其中的二维码和条形码, 展示识别到的文本内容和码制, 并可复制结果. 与已有的"生码"功能构成编码/解码闭环. 该功能不依赖 Android 设备, 全程本地完成, 不上传图片.

## Confirmed Facts

来自仓库勘查和依赖核对, 无需再向用户确认. 以下事实已在 2026-08-30 基于 commit `a2c0716` 重新核对:

### 现有代码结构

- 顶层导航当前有"工具""日志""应用""文件""生码"五个页签, 由 `src/App.tsx:46` 的 `TabId` 联合类型, `src/App.tsx:48-54` 的 `TABS` 数组和 `src/App.tsx:269-294` 的条件渲染控制, 无路由库.
- "工具""应用""文件""生码"用 `&&` 条件渲染, 切换即卸载; "日志"是唯一例外, 首次访问后按 `logcatMounted || logcatVisible` 常驻并靠 `hidden` 类隐藏 (`src/App.tsx:58`, `src/App.tsx:287-291`). `ApkTool` 属于"工具"页, 其全局拖拽监听在 effect 清理中解绑 (`src/components/AppManager.tsx:133-136`), 因此解码页的拖拽不会与它冲突.
- 已有生码链路可复用形态: `src/lib/codeGenerator.ts` (纯解析契约) + `src/store/codeGenerator.ts` (zustand draft/batch + revision 失效标记) + `src/components/CodeGeneratorPage.tsx` (两栏工作区 + 虚拟列表 + 放大预览) + `src/components/GeneratedCodeCanvas.tsx` (编码器边界组件).
- 现有依赖 `jsbarcode` 和 `qrcode` 只能编码, 解码必须新增依赖.
- 生码侧码制为二维码和 Code 128 (`CodeType = "qr" | "code128"`).
- 项目约定: 所有 `invoke()` / `listen()` 集中在 `src/lib/tauri.ts`, 组件不直接 import `@tauri-apps/api`; 纯逻辑放 `src/lib/`, 单测与被测文件同目录用 `*.test.ts`.
- 前端已有 `@tanstack/react-virtual`, 生码结果列表已在使用.
- 复制文本已有既成做法: `navigator.clipboard.writeText` + `showToast("success", ...)`, 见 `src/components/DeviceInfoPanel.tsx:44-45` 等 5 处 (另有 `src/components/BugReportTool.tsx:115`, `src/components/Screenshot.tsx:73`, `src/components/DeviceFileManager.tsx:416`, `src/components/ActivityMonitor.tsx:63`).

### 解码依赖与约束

- 技术选型: `zxing-wasm` 3.1.2 的 `zxing-wasm/reader` 子路径 (reader-only, ~1.04 MiB wasm), 前端 WASM 解码, 不新增 Rust 解码逻辑.
- `zxing-wasm` 默认从 jsDelivr CDN 拉 `.wasm`, 必须覆盖 `locateFile` 指向本地打包资源, 否则离线不可用.
- `readBarcodes(input, options?)` 接受 `Blob | ArrayBuffer | Uint8Array | ImageData`; wasm 内置 stb_image, 支持 png / jpeg / gif / bmp / psd / pnm / hdr 解码.
- `maxNumberOfSymbols` 默认 255, 单图多码开箱即用; `tryHarder` / `tryRotate` / `tryInvert` / `tryDownscale` 默认已开启.
- `ReadResult` 提供 `text`, `format` (canonical 名如 `"QRCode"` / `"Code128"`), `symbology`, `isValid`, `error`, `bytes`, `orientation`.
- 详见 `research/zxing-wasm-reader-api.md`.

### 平台权限现状

- `src-tauri/capabilities/default.json` 的 `fs:default` 只放开 app 专属目录 (AppConfig/AppData/AppLocalData/AppCache/AppLog) 并附带 `deny-default`, 读不了用户任意路径的图片.
- Tauri 拖拽事件 (`src/lib/tauri.ts:376`) 回传文件路径而非 `File` 对象, 因此拖拽和文件选择都只拿到路径, 需要后端读字节.
- Tauri 2.11.3 的 `InvokeResponseBody` 含 `Raw(Vec<u8>)` 变体, `tauri::ipc::Response::new(bytes)` 可直接回传二进制, 无需 base64 (省去 33% 体积膨胀).
- macOS 菜单已注册 `PredefinedMenuItem::paste` (`src-tauri/src/lib.rs:86`), Cmd+V 已绑定系统粘贴动作.
- `opener:default` 已包含 `allow-open-url`, 打开 http/https 链接无需改动 capability.
- `tauri-plugin-clipboard-manager` 2.3.2 提供 `readImage(): Promise<Image>`, `Image.rgba()` 返回 RGBA 字节, `Image.size()` 返回宽高, 可直接组装 `ImageData` 喂给 `readBarcodes`. 需新增插件依赖和 capability 权限.

## Requirements

### P0

**入口与布局**

- 在顶层导航新增独立的"解码"页签, 与"生码"并列, 无需选择或连接设备.
- 沿用生码页的两栏工作区骨架: 左侧输入与操作区, 右侧结果区.

**图片输入 (三种来源)**

- 支持通过文件选择对话框选取图片, 可多选.
- 支持将图片文件拖拽到解码页进行解码, 支持一次拖入多个文件.
- 支持从剪贴板读取图片进行解码, 通过界面按钮和 `Ctrl/Cmd+V` 快捷键两种方式触发.
- 只接受受支持的图片格式 (png / jpeg / gif / bmp / webp 之外的格式按不支持处理); 拖入或选中非图片文件时给出明确提示且不影响同批其他图片.
- 单次批量投入的图片数量上限为 50 张, 超出时提示并只处理前 50 张, 不静默丢弃.

**解码行为**

- 解码在本地完成, 不发起任何网络请求, 不上传图片内容.
- `.wasm` 资源随应用打包在本地, 离线环境下功能完整可用.
- 默认识别全部支持的码制 (二维码和一维条码), 不要求用户预先选择码制.
- 单张图片包含多个码时全部识别并返回, 不只取第一个.
- 多图批量时逐张解码并逐步产出结果, 已完成的图片先展示, 不等整批结束.
- 单张图片解码失败或未识别到码时, 在该图片对应位置显示状态, 不中断同批其他图片.

**结果展示**

- 结果按图片分组: 每组显示图片名称 (剪贴板来源显示为"剪贴板图片")、该图识别到的码数量, 以及该组下每条码的明细.
- 每条码明细显示识别出的文本内容和码制名称.
- 未识别到码的图片显示"未识别到码"状态; 解码出错的图片显示错误原因.
- 结果区显示整批汇总: 图片总数、成功识别的图片数、识别到的码总数.
- 结果数量较多时使用虚拟滚动, 保证滚动流畅和输入区可操作.
- 解码进行中显示进度状态 (已完成 / 总数), 并禁止重复提交同一批.

**结果操作**

- 每条码可单独复制文本内容, 复制后给出 toast 反馈.
- 支持一次复制全部识别结果的文本.
- 识别内容为 http / https URL 时, 提供在系统默认浏览器打开的操作.
- 提供清空按钮重置输入和结果.

**状态与主题**

- 切换到其他顶层页签再返回时保留最近一次解码结果; 关闭应用后清空, 不写入磁盘持久化.
- 页面在项目支持的亮色、暗色主题和最小窗口尺寸 (900x600) 下无内容遮挡或不可达操作.

### Out of Scope

- 不使用摄像头实时扫码.
- 不引入在线解码服务, 不上传图片.
- 不在首版支持从设备截图直接解码 (后续可扩展).
- 不支持 PDF 或多页文档解码.
- 不提供解码结果导出为文件的能力.
- 不提供解码结果反向跳转到"生码"页重新生成.
- 不在首版暴露 zxing 高级参数 (binarizer、码制白名单、textMode 等) 给用户调节.
- 不跨应用重启保存输入或解码结果.

## Acceptance Criteria

- [x] 用户可从顶层"解码"页签进入功能, 且无需选择或连接设备.
- [x] 通过文件选择对话框可一次选中多张图片并全部解码.
- [x] 将多个图片文件拖拽到解码页可全部解码; 在"工具"页拖拽 APK 的既有行为不受影响.
- [x] 点击粘贴按钮或按下 `Ctrl/Cmd+V` 可解码剪贴板中的图片; 剪贴板无图片时给出明确提示.
- [x] 拖入或选中非图片文件时显示明确提示, 同批中的合法图片仍然完成解码.
- [x] 一次投入超过 50 张图片时提示上限并处理前 50 张, 不静默丢弃.
- [x] 断网环境下解码功能完整可用, 不产生对 CDN 的网络请求.
- [x] 含二维码的图片和含 Code 128 条形码的图片都能正确识别出文本内容和码制名称.
- [x] 由本项目"生码"页生成的二维码和 Code 128 图片, 解码后文本与原始输入逐字一致.
- [x] 单张图片含多个码时全部列出, 不只显示第一个.
- [x] 批量解码时已完成的图片先出现在结果区, 不必等整批结束.
- [x] 未识别到码的图片显示"未识别到码", 解码出错的图片显示错误原因, 同批其他图片不受影响.
- [x] 结果按图片分组展示, 每组显示图片名称和该图码数量, 剪贴板来源显示为"剪贴板图片".
- [x] 结果区汇总显示图片总数、成功识别图片数和识别到的码总数, 数值与实际结果一致.
- [x] 点击单条结果的复制按钮后剪贴板内容与该条文本一致, 并出现成功 toast.
- [x] 复制全部后剪贴板包含本批所有识别文本.
- [x] 识别内容为 http / https URL 时出现打开浏览器的操作, 点击后在系统默认浏览器打开; 非 URL 内容不显示该操作.
- [x] 解码进行中显示进度, 且无法重复提交同一批.
- [x] 点击清空后输入和结果都被重置.
- [x] 切换顶层页签后返回, 解码结果保持不变; 应用重启后不恢复.
- [x] 页面在亮色、暗色主题和 900x600 最小窗口下无内容遮挡或不可达操作.
- [x] `pnpm build` 通过 (tsc + vite build), `pnpm test` 通过.
