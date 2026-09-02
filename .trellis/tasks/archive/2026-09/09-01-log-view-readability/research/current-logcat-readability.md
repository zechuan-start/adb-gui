# Blueprint Logcat 现状基线

## 调研范围

- Blueprint Quiet `SPEC.md`、交互原型和 ADB GUI 当前实现.
- 当前 Logcat 行, 列配置, 工具栏, 动作和虚拟列表实现.
- 归档任务 `08-29-logcat-view-presentation` 的 PRD, design 和 validation.
- 项目前端组件与质量规范.

## 代码事实

| 位置 | 事实 | 对本任务的影响 |
|---|---|---|
| `src/components/logcat/LogcatRow.tsx` | `LEVEL_COLORS` 同时应用到等级和完整 message | 普通 INFO 也成为大面积高饱和色, 缺少正文与状态的层级 |
| `src/components/logcat/LogcatRow.tsx` | 当前字段顺序为时间, 等级, Tag, PID, TID, 包名, message | 等级脱离 message, PID 与来源字段顺序不利于横向扫视 |
| `src/lib/logcatView.ts` | Standard 默认显示时间, PID, Tag, 等级; Compact 默认显示时间, 等级 | 本任务可保持默认显隐, 只改呈现顺序和样式 |
| `src/components/logcat/LogcatToolbar.tsx` | 查询, 动作, 视图和状态共处一个 flex-wrap 容器 | 缺少动作分组, 控件权重相同 |
| `src/components/logcat/LogcatToolbar.tsx` | paused 和 detached 状态用 `invisible` 保留固定宽度 | 正常状态仍空占较大横向空间 |
| `src/components/logcat/LogcatList.tsx` | detached 状态已有右下角"新增 N 行"按钮 | 工具栏的"未跟随 +N"可以移除, 不丢失反馈 |
| `src/components/logcat/LogcatList.tsx` | fixed path 使用 20 px 行高; Soft-Wrap 才动态测量 | 可读性优化必须保留双路径, 不能用动态布局换视觉效果 |
| `src/index.css` | 已有前景, 次级, success, warning, destructive 等亮暗主题 token | 将现有角色映射到 Blueprint token, Tag 使用单一 `log-tag`, 不在行组件散落硬编码颜色 |
| `src/components/logcat/LogcatRow.tsx` | message 为 `select-text`, 元数据为 `select-none` | 保留跨行原生框选, 单行选择和完整复制必须让原生选区优先 |
| `src/App.tsx` / `src/components/logcat/LogcatPanel.tsx` | Logcat 是独立页签, 首次访问后 runtime 才持续挂载 | 新外壳需要解耦持续 runtime 与可见 panel, 不能靠隐藏整页实现 |
| `src/lib/logcatCrash.ts` | crash 和 stacktrace 已分类, 没有 crash 串分组 | 可在前端派生折叠组, 不需要修改后端 payload |

## 截图对比结论

### 原有 Android Studio 参考

- 信息顺序稳定: 完整时间, PID-TID, Tag, 包名, 紧凑等级标记, message.
- 等级是紧邻 message 的独立标记, Tag 具有来源辨识度.
- 日志本体保持高密度, 没有卡片, 表头或大面积装饰.
- 查询和设备上下文常驻, 日志操作与内容区域明确分离.

### ADB GUI 当前页

- 时间, 等级, Tag, PID, message 虽然对齐, 但等级位于来源字段之前, 横向阅读关系弱.
- Tag 全部使用同一种次级灰色. Blueprint 原型继续使用单一 `log-tag`, 通过稳定列宽和字重而不是多色调色板建立来源层级.
- INFO message 使用亮蓝色, ERROR message 使用红色, 连续日志形成大面积色带.
- 工具栏内按钮均使用接近的灰色方块样式, 操作分组不明显.
- `未跟随 +N` 在顶部和右下角重复, 顶部还为不活跃状态持续保留空白宽度.

## 历史约束

归档任务 `08-29-logcat-view-presentation` 已通过以下验证, 本任务应把它们视为回归基线:

- 10,000 行持续流入和 FIFO 淘汰不空白.
- fixed 与 Soft-Wrap 动态高度双路径.
- Standard/Compact 和 7 个字段独立开关.
- 点击锚定, Pause/resume, detached/follow, Restart, 导出和切设备.
- LaunchServices 启动下的亮暗主题及 1200x800, 900x600 桌面冒烟.

历史多行选择设计还要求:

- 手动滚动、拖动滚动条或开始框选正文时立即退出自动跟随.
- 鼠标松开后不自动恢复跟随.
- 元数据不进入选区, message 可以跨多行原生选择.
- 有原生选区时复制正文, 不用全量复制按钮覆盖用户选区.

## 结论

根因不再只是行配色和工具栏分组. Blueprint 外壳将 Logcat 从独立页改为持久底部工作区, 因此任务需要结构性调整 runtime/panel 生命周期、逐页显示状态和未读语义, 同时继续保护已稳定的数据通道、查询、虚拟化、滚动锚定和多行原生框选.
