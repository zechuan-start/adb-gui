# 工具页文案迁移

父任务: [界面中英双语与语言设置](../09-08-i18n-bilingual/prd.md) · 架构: [design.md](../09-08-i18n-bilingual/design.md)

依赖: [i18n-foundation](../09-08-i18n-foundation/prd.md) 必须先完成; [i18n-shell-settings](../09-08-i18n-shell-settings/prd.md) 的 toast 改造 (批次 2) 必须先合入.

## 交付边界

把六个工作区的全部可见文案迁进词典, 并让数字, 日期, 时间, 应用名排序跟随界面语言. 这是文案量最大的一批 (约 500 行), 按工作区分批推进.

## 文件归属

本子任务独占以下文件, 不与 [i18n-shell-settings](../09-08-i18n-shell-settings/prd.md) 重叠:

| 工作区 | 文件 | 词典命名空间 |
| --- | --- | --- |
| 日志 | `components/logcat/**`, `lib/logcat*.ts`, `hooks/useLogcat*.ts`, `store/logcat.ts` | `logcat` |
| 文件 | `components/DeviceFileManager.tsx`, `lib/deviceFiles.ts` | `files` |
| 应用 | `components/AppManager.tsx`, `components/PackageManager.tsx`, `lib/appInfo.ts` | `apps` |
| 生码 | `components/CodeGeneratorPage.tsx`, `GeneratedCodeCanvas.tsx`, `lib/codeGenerator.ts`, `store/codeGenerator.ts` | `codegen` |
| 解码 | `components/CodeDecoderPage.tsx`, `lib/codeDecoder.ts`, `lib/zxingReader.ts`, `store/codeDecoder.ts` | `decoder` |
| 性能 | `components/performance/**`, `lib/deviceMetrics.ts`, `hooks/useDeviceMetricsSession.ts` | `performance` |
| 工具 | `ToolModule.tsx`, `Screenshot.tsx`, `ScreenRecordTool.tsx`, `ClipboardTool.tsx`, `DeepLinkTool.tsx`, `PortForwardTool.tsx`, `WifiConnect.tsx`, `QuickKeys.tsx`, `ActivityMonitor.tsx`, `BugReportTool.tsx`, `lib/clipboardTransfer.ts`, `lib/screenRecordSession.ts`, `lib/device.ts` | `tools` |

## 本地化格式 (本子任务落地)

替换 4 处硬编码 `"zh-CN"`, 改用 `i18n/format.ts`:

- `CodeGeneratorPage.tsx:200` 数量千分位.
- `performance/MetricChart.tsx:176` 悬停时间.
- `lib/deviceFiles.ts:340` 文件修改时间.
- `lib/appInfo.ts:4` 应用名 collator.

## 范围外

- 不翻译设备返回的内容: 包名, 应用名, 日志正文与 tag, 文件名, adb 原始输出, 端口转发原始规则. 这些原样展示.
- 不改 Rust 错误返回 (子任务 4). 本子任务只保证前端产生的提示双语.
- 不改中文措辞.

## 验收标准

- [ ] 英文界面下逐个走六个工作区 (含空状态, 加载态, 禁用态, 失败态), 无中文残留.
- [ ] 日志查询输入的补全提示, 等级菜单, 视图菜单, 导出与清空反馈全部双语.
- [ ] 文件页的上传/下载/新建目录/删除确认/预览失败提示双语; 文件修改时间在英文下为英文格式.
- [ ] 应用页排序标签双语; 应用名排序结果在两种语言下均可接受 (父 PRD 待确认项在此定夺并记录结论).
- [ ] 生码页数量文案在英文下为 `1,234 items` 一类的英文格式.
- [ ] 解码页各失败原因 (无法识别, 格式不支持, 超出大小上限) 双语.
- [ ] 性能页图表悬停时间在英文下为英文时间格式, 24 小时制的处理有明确结论.
- [ ] 工具区截图, 录屏 (含保存失败的三种恢复动作), 剪贴板, DeepLink, 端口转发, WiFi 连接, 快捷键, 当前 Activity, bug 报告的文案与确认弹窗双语.
- [ ] 设备返回值确认未被翻译 (随机抽查一个中文应用名与一条中文日志, 两种语言下都保持原样).
- [ ] 中文界面逐字对照迁移前无变化.
- [ ] `pnpm test` 通过, 相关测试断言改为引用词典.
- [ ] 英文长文案在双尺寸双主题下无溢出, 尤其是工具卡片与日志工具栏.
