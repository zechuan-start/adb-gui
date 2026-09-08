# 双语文档与截图设计

## 截图脚本如何指定语言

`capture.mjs` 用 Playwright 打开 `http://localhost:5199/` 并注入 `mock-tauri.js`. 语言注入有两种可行做法, 推荐第一种:

1. **注入 localStorage** (推荐): 在 `addInitScript` 里写 `localStorage.setItem("locale", "en")`, 让应用走与真实用户完全相同的路径. 不需要脚本了解 i18n 内部结构, 也顺带验证了存储读取路径.
2. 设置浏览器 `locale` 上下文选项 (`browser.newContext({ locale: "en-US" })`), 依赖"跟随系统"解析. 更真实, 但把出图正确性绑在系统语言解析上, 调试时不易区分是解析错还是渲染错.

采用方案 1, 并额外用方案 2 做一次人工抽查, 确认两条路径结果一致.

## 输出路径 (已确认双目录)

脚本接受语言参数, 输出到 `docs/images/<locale>/`, 即 `docs/images/en/` 与 `docs/images/zh-CN/` 各七张. 顶层的旧 `docs/images/*.png` 在两套图生成后随同一提交删除, 避免仓库里留下一份没人引用的中文图:

```
pnpm screenshots            # 两套都出
pnpm screenshots --locale en
```

`OUTPUT_DIR` 从常量改为按语言拼接. 循环两次语言, 复用同一个浏览器实例与 dev server, 避免重复启动.

## 模拟数据的语言边界

`mock-tauri.js` 里的 26 行中文分两类, 处理方式不同:

- **设备数据** (应用名, 日志正文, 文件名): 保持中文不变. 真实产品里这些就是设备返回值, 不翻译. 两套截图里它们应当一致 —— 这恰好也是双语正确性的直观证据.
- **脚本自身的注释与说明**: 与产品无关, 保持不变.

实现中同时修正模拟 IPC 的录屏空闲状态与电池稳定码, 固定遥测快照, 补齐必要命令. 未识别的模拟命令明确拒绝, 避免伪成功.

## README 改动

- `README.md` 的七处图片路径改为 `docs/images/en/...`; `README.zh-CN.md` 改为 `docs/images/zh-CN/...`.
- 两份 README 第 178 行附近的截图脚本说明更新为新命令.
- 各自新增一段语言设置说明: 位置 (设置 → 通用 → 语言), 三个档位, 默认按系统语言且非中文用英文, 显式选择后不再跟随系统.
- 英文 README 里语言档位写 `System / 简体中文 / English`, 与界面一致.

## `index.html`

静态 `lang="en"` 保留 (首屏渲染前无法得知结果), 由 `applyLocale` 在运行时覆盖为实际语言. 在 README 的开发说明里注明这一行为, 避免后续有人"修正"这个静态值.
