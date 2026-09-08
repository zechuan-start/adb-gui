# 工具页迁移设计

架构总纲见 [父任务 design.md](../09-08-i18n-bilingual/design.md); 键命名约定见 [子任务 2 design.md](../09-08-i18n-shell-settings/design.md).

## 迁移中最容易出错的三类

### 1. 拼接句

工作区里大量文案是模板拼接, 例如 `已选择 ${n} 项`, `下载文件大小不一致: 设备端 ${a} 字节, 本地 ${b} 字节`. 一律迁成带具名参数的函数词条, 不允许在组件里拼半句:

```ts
// 正确
selected: (p: { count: number }) => `已选择 ${p.count} 项`
// 错误: 组件里写 {t.files.selectedPrefix}{n}{t.files.selectedSuffix}
```

英文语序与中文不同, 拆成前后缀必然出错.

### 2. 单复数

英文有单复数, 中文没有. 词条函数内部自行处理:

```ts
selected: (p: { count: number }) => `${p.count} item${p.count === 1 ? "" : "s"} selected`
```

不引入 `Intl.PluralRules` —— 只支持英文一种复数规则时, 函数内三元更直白, 也不增加运行时开销. 若后续加入需要复杂复数规则的语言, 再在 `format.ts` 引入.

### 3. 设备返回值混排

日志正文, 包名, 文件名, adb 输出必须原样. 迁移时凡是模板里含设备数据的, 把设备数据作为参数传入, 不要连同数据一起写进词条:

```ts
launchFailed: (p: { pkg: string }) => `无法找到 ${p.pkg} 的启动 Activity`
```

## 本地化格式的具体处理

| 位置 | 现状 | 改法 |
| --- | --- | --- |
| `CodeGeneratorPage.tsx:200` | `values.length.toLocaleString("zh-CN")` | `numbers(locale).format(values.length)` |
| `MetricChart.tsx:176` | `toLocaleTimeString("zh-CN", { hour12: false })` | `timeOfDay(locale).format(...)`. `hour12` 处理见下 |
| `deviceFiles.ts:340` | `new Intl.DateTimeFormat("zh-CN", {...})` | 函数接收 locale 参数, 调用方从 store 取 |
| `appInfo.ts:4` | 模块级 `new Intl.Collator("zh-CN", {...})` | 改为 `appNameCollator(locale)`, 排序函数接收 collator |

`hour12` 的结论: 性能图表读数需要紧凑对齐, 12 小时制会多出 AM/PM 导致列宽跳动. 因此英文也保持 `hour12: false`, 即 `timeOfDay` 对两种语言都传 `hour12: false`, 只让 locale 决定分隔符与数字形状. 这是刻意偏离系统习惯的取舍, 写进词条注释.

`deviceFiles.ts` 与 `appInfo.ts` 是纯函数模块, 不应 import store. 改为把 `locale` 或已构造好的 `Intl` 实例作为参数传入, 由组件侧提供. 这保持了现有的可测试性.

## collator 变化的连锁

`appInfo.ts` 的 collator 目前是模块级常量, 排序在组件外完成. 改为按语言取之后:

- 排序函数签名增加参数, 所有调用方同步.
- 语言切换时列表要重新排序: 消费组件已通过 `useT()` 订阅 store, 重渲染即会重新排序, 无需额外机制.
- `appInfo.test.ts` 增加英文 collator 下的排序用例, 固定一组中英混合应用名, 记录两种语言下的期望顺序.

## 分批边界

按工作区分批, 每批一个提交. 批次之间不共享文件, 因此中途中断不会留下半迁移的文件.

`common` 命名空间由子任务 2 建立, 本子任务只消费, 若发现新的跨模块短词再往里加, 加之前先搜索是否已存在.

## 测试改造

`logcatQuery.test.ts`, `deviceFiles.test.ts`, `codeGenerator.test.ts`, `codeDecoder.test.ts`, `device.test.ts`, `deviceMetrics.test.ts`, `clipboardTransfer.test.ts`, `screenRecordSession.test.ts`, `ToolModule.test.tsx`, `deviceFilePreferences.test.ts`, `appInfo.test.ts` 等文件的中文断言改为引用 `zhCN` 词典条目; 带参词条断言调用结果.

每个工作区至少补一条英文渲染或英文词条断言.
