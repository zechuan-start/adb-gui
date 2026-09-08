# 工具页迁移实施计划

按工作区分批, 每批一个提交, 每批跑一次 `pnpm test` 并在英文下手工走查该工作区.

## 批次 1: 日志 (约 80 行)

`components/logcat/**`, `lib/logcat*.ts`, `hooks/useLogcat*.ts`, `store/logcat.ts` → `logcat` 命名空间.

验证: 英文下开日志, 走查工具栏, 等级菜单, 视图菜单, 查询输入补全, 崩溃折叠提示, 导出与清空反馈, 会话退出提示.

## 批次 2: 文件 (约 65 行)

`DeviceFileManager.tsx`, `lib/deviceFiles.ts` → `files`. 同时替换文件修改时间格式化.

验证: 英文下浏览目录, 上传, 下载, 新建目录, 预览图片, 触发一次权限失败; 确认修改时间为英文格式.

## 批次 3: 应用 (约 55 行)

`AppManager.tsx`, `PackageManager.tsx`, `lib/appInfo.ts` → `apps`. 同时改 collator.

验证: 英文下排序切换, 搜索, 卸载确认, 清数据确认; 用真实设备确认中英混合应用名的排序结果可接受, 并把结论写进 `validation.md` (对应父 PRD 待确认项).

## 批次 4: 生码与解码 (约 70 行)

`CodeGeneratorPage.tsx`, `GeneratedCodeCanvas.tsx`, `lib/codeGenerator.ts`, `store/codeGenerator.ts` → `codegen`; `CodeDecoderPage.tsx`, `lib/codeDecoder.ts`, `lib/zxingReader.ts`, `store/codeDecoder.ts` → `decoder`. 同时替换数量千分位格式化.

验证: 英文下批量生成 1234 项确认数量格式; 解码触发无法识别, 格式不支持, 超大图三种失败.

## 批次 5: 性能 (约 32 行)

`components/performance/**`, `lib/deviceMetrics.ts`, `hooks/useDeviceMetricsSession.ts` → `performance`. 同时替换悬停时间格式化, 保持 `hour12: false`.

验证: 英文下开性能页, 悬停图表看时间格式, 进程表列头与空状态.

## 批次 6: 工具区 (约 130 行)

`ToolModule.tsx` 与九个工具组件, `lib/clipboardTransfer.ts`, `lib/screenRecordSession.ts`, `lib/device.ts` → `tools`.

验证: 英文下逐个工具卡片走查, 重点是录屏保存失败的三种恢复动作与其确认弹窗.

## 批次 7: 收口

- 全局搜索确认这批文件内已无中文字面量.
- 抽查一个中文应用名与一条中文日志, 确认未被翻译.
- 双尺寸双主题走查, 修英文溢出.
- `git diff` 核对中文串逐字未变.
- 记录 `validation.md`, 含 collator 结论.

## 风险与回滚

| 风险 | 应对 |
| --- | --- |
| 拼接句被拆成前后缀, 英文语序错乱 | 硬约束: 含变量的文案一律函数词条; review 时搜索 JSX 里的相邻 `{t.` 与裸变量 |
| 设备返回值被误当作文案迁走 | 批次 7 抽查; 词条里不允许出现设备数据的具体值 |
| collator 改动影响排序稳定性 | `appInfo.test.ts` 固定中英混合样本, 两种语言各断言一次 |
| `deviceFiles.ts` / `appInfo.ts` 变成依赖 store 的不纯模块 | 硬约束: 只接收参数, 不 import store |

每批独立提交, 可单独回滚; 批次之间无共享文件.
