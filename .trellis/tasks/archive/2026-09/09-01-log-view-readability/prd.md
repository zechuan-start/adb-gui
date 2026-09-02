# Blueprint Logcat 工作区翻新

## 产品形态

这是 Blueprint Quiet 外壳中的持久 Logcat 工作区. 日志不再是独立页面, 而是与工具、应用、文件、生码和解码页面共享上下文的底部面板.

它服务于持续观察高频日志、停在异常附近阅读、跨行框选正文和快速复制单条完整记录. 它不是原型的全量 DOM 演示, 也不是只替换颜色的终端皮肤.

## 目标

- 采用原型的日志收放、工具栏、字段层级、堆栈折叠和设备断流交互.
- 保留现有 10,000 行环形缓冲、虚拟列表、查询语言、Pause、detached、Soft-Wrap 和滚动锚定.
- 保留现有多行原生文本框选, 并让它与原型的单行选择及完整行复制无冲突共存.
- 收起日志时继续后台累计, 通过索引栏显示未读数, 展开后清零.

## 已确认事实

- 当前 Logcat 已使用 `LogcatRingBuffer` 和 `@tanstack/react-virtual`, fixed path 行高为 20 px.
- 当前 message 使用 `select-text`, 其余元数据列使用 `select-none`.
- 历史设计要求开始框选或手动滚动时立即退出跟随, 且鼠标松开后不自动恢复.
- 当前查询、Pause、Restart、导出、清屏、列配置、Soft-Wrap、detached 和 10,000 行真实设备路径已验证.
- 当前 crash 和 stacktrace 已有分类, 但没有把相邻崩溃串分组折叠.
- 原型在 `900x600` 下工具栏仍换成两行, sticky 断流提示会透出日志文字, 实现必须修正.

## P0: 工作区交互

- 日志流 runtime 在应用外壳内持续挂载, 面板是否可见不决定流是否运行.
- `logOpenByPane` 默认 `tools/apps/files = true`, `codegen/decoder = false`.
- 左侧索引栏和工具栏都可收放日志, `Cmd/Ctrl+J` 同效.
- 收起期间继续累计日志. 未读数从最后已读 seq 与当前最新 seq 派生, 最大显示 `999+`.
- 展开即标记当前日志为已读. 切页自动退出铺满, 但保留各页开关偏好.
- 面板默认高 320 px, pointer capture 拖拽, 硬限制 120 px 到 `viewport height - 220 px`.
- 铺满只隐藏页面区, 不销毁页面 state. 隐藏日志瞬时恢复页面区.

## P0: 工具栏

- 保留现有查询语言和补全, 不降级为原型的简单 substring 过滤.
- 提供等级、暂停/继续、堆栈折叠、换行、宽行距、精简列、跟随、清空、铺满/还原、隐藏、Restart、导出和列配置.
- detached 只由列表右下角 `新增 N 行` 或 `回到底部` 表达, 工具栏不重复显示.
- 状态槽按 disconnected、starting、paused、live 优先级只显示一个状态.
- 工具栏自身小于 1040 px 时进入 compact. 在 732 px 主区仍保持单行, 低频操作可以进入已有菜单.

## P0: 日志行

- 默认视觉顺序为 `时间 -> PID/TID -> Tag -> 包名 -> 等级 -> message`. 日期、TID 和包名继续受现有列配置控制.
- 时间宽 92 px, PID/TID 组合宽 92 px, Tag 152 px, 包名 168 px, 等级 14 px, message 使用剩余空间.
- 元数据使用 `log-dim`, Tag 使用单一 `log-tag`, message 使用 `ink`.
- W/E/F 使用 3 px 左侧状态条, 对应 message 使用 warn/err. 不使用整行警告底色.
- 不画逐行分隔线. hover、单行选中、crash 和 stacktrace 仍可辨.
- 保持 `font-variant-numeric: tabular-nums` 和固定 20 px fast path.

## P0: 堆栈折叠

- 将 crash 首行与后续相邻 stacktrace 行分为一组.
- 默认折叠后续行, 首行显示 `+N 行堆栈`.
- 展开状态按 crash 首行 seq 记录, 不是全局单一开关.
- 工具栏总开关控制是否启用自动折叠.
- stacktrace 行使用缩进、`log-dim2` 和左侧错误色细连线.
- 查询仍基于原始完整缓冲. 折叠只影响渲染列表, 不影响 `is:crash` 和 `is:stacktrace`.

## P0: 多行框选与单行选择

- message 保持浏览器原生多行框选, 所有元数据保持 `select-none`.
- pointerdown 开始框选即进入 detached, 保护选区和视口.
- 非空原生选区存在时, pointerup 不切换单行选择.
- `Cmd/Ctrl+C` 有非空原生选区时不拦截; 无原生选区且存在单行选择时复制完整字段.
- 完整行复制使用制表分隔: `时间, PID/TID, Tag, 包名, 等级, message`, 并包含当前可获得的日期.
- 单击行可选中或取消, 但不得主动清除现有非空文本选区.

## 不做

- 不修改后端 Logcat command、事件 payload 和查询语法.
- 不引入第二个日志缓冲或第二套 follow 状态.
- 不复制原型的 1,500 行 DOM 裁剪和每次 crash 全量 innerHTML 重绘.
- 不使用多色 Tag 调色板. 采用原型单一 `log-tag` 层级.
- 不为新日志添加入场动画.

## 验收标准

- [ ] 日志在工具、应用和文件默认展开, 生码和解码默认收起, 用户修改后逐页记忆.
- [ ] 收起后日志继续累计并显示未读数, 展开清零, 页面切换退出铺满.
- [ ] 拖拽高度、铺满、隐藏、`Cmd/Ctrl+J` 和工具栏入口行为一致.
- [ ] `900x600` 下工具栏保持单行且无重叠, 查询框仍可输入.
- [ ] light/dark 下日志专用色值通过 AA, 网格不透入日志正文区域.
- [ ] 10,000 行下 fixed path 保持 20 px 且无逐行测量, Soft-Wrap 使用既有动态测量路径.
- [ ] crash 串可以独立展开和收起, 折叠不改变查询结果计数和原始缓冲.
- [ ] 跨多条 message 框选复制只包含正文, 不包含元数据, 且框选后不会被新日志拉回底部.
- [ ] 有文本选区时 `Cmd/Ctrl+C` 复制选区; 没有文本选区时可复制选中的完整日志行.
- [ ] disconnected sticky 提示不透出下方日志文字.
- [ ] 查询、Pause、Restart、导出、清屏、列配置、Soft-Wrap、detached 和设备切换全部回归通过.
- [ ] `corepack pnpm test` 和 `corepack pnpm build` 通过.

## 约束

- `LogcatRow` 保持 memo 化且不订阅 stream 级 store.
- 折叠与格式化使用纯函数并测试.
- UI 选择 state 不写回日志 entry.
- 日志面板的显示状态只来自 `ui` store, 日志数据只来自 `logcat` store.
