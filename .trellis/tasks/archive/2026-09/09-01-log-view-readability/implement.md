# Blueprint Logcat 工作区实施计划

## 1. 保留基线

- [x] 运行现有 logcat、query、store、follow 和 build 基线.
- [x] 记录 fixed path 20 px、10,000 行、Soft-Wrap 和多行框选行为.
- [x] 搜索 `anchoredSeq`、`followMode`、`visible` 和 Logcat 首次挂载所有使用点.

验证:

```bash
corepack pnpm test
corepack pnpm build
```

## 2. 解耦 runtime 与 panel

- [x] 将 `useLogcatStream` 放入持续挂载的 `LogcatRuntime`.
- [x] 让 `LogcatPanel` 只负责可见视图, 避免隐藏 DOM 继续测量.
- [x] 接入 `ui.logOpenByPane`、高度、铺满、未读和快捷键.
- [x] 保留设备切换、restart nonce 和 process map generation.

验证: 收起后日志 total/seq 继续增长, 再展开能看到累计内容且未读清零.

## 3. 面板与工具栏

- [x] 实现 pointer capture 高度拖拽和硬边界.
- [x] 重组工具栏状态槽和动作组.
- [x] 使用 `ResizeObserver` 实现单行 compact, 低频动作进入菜单.
- [x] 实现铺满、还原、隐藏和切页退出铺满.
- [x] 修复断流 sticky 实色背景.

验证: `1200x800` 和 `900x600` 工具栏固定单行, 无文字或控件重叠.

## 4. 行视觉与堆栈

- [x] 新增日志专用 token.
- [x] 调整字段顺序、列宽、等级色条和 message 层级.
- [x] 实现 `groupCrashTraces` 和测试.
- [x] 接入逐 crash 展开 map 和总折叠开关.
- [x] 保持 virtualizer stable key、20 px fixed path 和 Soft-Wrap 测量.

验证: 折叠不改变 filtered/total count, 展开行 key 稳定, 查询语义不变.

## 5. 单行与多行选择

- [x] 新增 `selectedSeq`, 不复用 `anchoredSeq`.
- [x] 保持 message `select-text` 和元数据 `select-none`.
- [x] pointer selection 开始时 detach, 非空选区时禁止单行切换.
- [x] 新增 `formatLogLine` 与 `resolveCopyAction` 纯函数及测试.
- [x] 快捷键优先原生选区, 其次完整行复制.
- [x] clipboard 使用项目现有 Tauri/WebView 能力和明确失败反馈, 不新增静默 fallback.

验证: 跨 3 条以上 message 框选复制, 单行完整复制, 框选期间日志流入不跳动.

## 6. 回归与真实设备

- [x] 查询、补全、Pause、Restart、导出、清屏、列配置、Soft-Wrap.
- [x] follow、detached、回到底部、手动滚动和框选.
- [x] online、unauthorized、offline、none 和设备切换.
- [x] 10,000 行持续流入, light/dark, `1200x800`、`900x600`.

```bash
corepack pnpm test
corepack pnpm build
```

风险文件: `App.tsx`、`LogcatPanel.tsx`、`LogcatToolbar.tsx`、`LogcatList.tsx`、`LogcatRow.tsx`、`store/logcat.ts`、`store/ui.ts`、`lib/logcatView.ts` 和新增堆栈/复制纯函数.

## 验证记录

- `corepack pnpm test`: 22 个文件, 250 项测试通过.
- `corepack pnpm build`: TypeScript 与 Vite 生产构建通过.
- `git diff --check`: 通过.
- 浏览器: `1200x800` 与 `900x600` 均无横向溢出; compact toolbar 高 40 px, `clientWidth = scrollWidth`, 子控件无重叠; light/dark token、快捷键、铺满、切页恢复和逐页开关记忆通过.
- Logcat token 对 `log-bg` 的对比度为 4.56-10.90, light/dark 均达到 AA.
- 本机 `adb devices -l` 无在线设备. 本轮未重新执行真实设备 10,000 行持续流入、跨 3 条 message 框选和 LaunchServices 桌面路径; 这些路径保留既有 ring buffer、virtualizer、follow controller 与原生 selection 实现, 并由纯函数/store 回归覆盖新增逻辑.
