# 子任务 B: AS 式交互外壳 — 执行计划

> 前置: 子任务 A 已归档. 若 A 未完成, 停止并先做 A.
> 按用户可见工作流组织: 先立外壳 (结构与挂载), 再接单个交互能力. 这个顺序来自 `product-planning-style-guide.md` 的"UI 形态错误时先改外壳和布局, 再接单个功能".

---

## 阶段 0: 准备

- [ ] 确认 `task.py current` 指向 `08-29-logcat-shell-interaction`.
- [ ] 确认子任务 A 的产出已在: `lib/logcat.ts`, `store/logcat.ts`, `hooks/useLogcatStream.ts`, 后端批量协议.
- [ ] 基线记录: 真机上确认 A 结束后的日志页行为正常 (有数据, 四套过滤可用), 避免把 A 的遗留问题误算进 B.

**验证**: `corepack pnpm test && corepack pnpm build` 通过.

---

## 阶段 1: 纯改名 (最小独立改动)

先做这一步是因为它完全独立, 且能立刻消除一个长期误导.

- [ ] `git mv src/components/LogcatViewer.tsx src/components/QuickKeys.tsx` (用 git mv 保留历史).
- [ ] 更新 `App.tsx` 的 import: `import { QuickKeysTool } from "@/components/QuickKeys"`.
- [ ] 全仓搜索 `LogcatViewer` 确认无残留引用.

**验证**: `corepack pnpm build`; 打开"工具"页确认快捷按键位置与功能不变.
**回滚点**: 单独 commit.

---

## 阶段 2: 组件拆分 (行为不变)

这一阶段**只搬代码, 不改行为**. 结束时日志页的行为应与阶段 1 完全一致, 包括仍然纠缠的暂停/跟随语义.

- [ ] 新建 `src/components/logcat/` 目录.
- [ ] `LogcatRow.tsx`: 从 `Logcat.tsx` 的虚拟行渲染逻辑抽出, memo 化, props 为 `{ entry, onTagClick }`, 加 `data-seq` 属性.
- [ ] `LogcatList.tsx`: 虚拟滚动容器 + 两种空状态. 暂不加浮标与点击停止跟随.
- [ ] `LogcatToolbar.tsx`: 四套过滤控件 + 现有动作按钮 + 统计区. 暂不加新控件.
- [ ] `LogcatPanel.tsx`: 容器, 空状态, 挂 `useLogcatStream`, 组装三段.
- [ ] 删除 `src/components/Logcat.tsx`, 更新 `App.tsx` import.
- [ ] 确认每个新文件不超过约 200 行.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
真机: 逐项确认四套过滤, 暂停, 导出, 清屏, 空状态行为与阶段 1 一致.

**风险行为**: 抽 `LogcatRow` 时若把 store 订阅带进行组件, memo 会失效. 行组件必须只吃 props.
**回滚点**: 单独 commit. 这是本任务最大的一次结构改动, 务必单独提交.

---

## 阶段 3: 挂载方式改造 (切 tab 不丢现场)

- [ ] `App.tsx`: 加 `logcatMounted` 懒挂载标记, 日志页改为 `hidden` 而非条件渲染, 给 `LogcatPanel` 传 `visible` prop.
- [ ] `LogcatPanel`: 接 `visible`, 在"从隐藏变可见"的转换后于 rAF 中调用重测量, 并按 `followMode` 决定恢复 scrollTop 还是吸底.

**验证** (真机, 必须手工):
- [ ] 设置过滤 + 滚到中间 -> 切"应用"页 -> 切回: 内容/过滤/滚动位置全部保持.
- [ ] 切走期间新日志继续进缓冲 (切回后总行数增加).
- [ ] 切回后无空白帧, 无滚动漂移, 控制台无重复 key 警告.
- [ ] 冷启动后不进日志页, `ps aux | rg logcat` 确认无子进程.

**风险行为**: 这是本任务技术风险最高的一步 (`display:none` 与虚拟滚动测量). 若切回后出现无法收敛的漂移, 考虑 design 4.2 提到的备选方案 (卸载 + store 恢复 + 手动存取 scrollTop), 但需先记录问题现象再决定.
**回滚点**: 单独 commit.

---

## 阶段 4: 状态正交化与三个控件

这是本任务的核心, 对应用户提出的"滚动时暂停不是好方案".

- [ ] store 扩展: `followMode`, `detachedNewCount`, `anchoredSeq`, `restartNonce` 及对应 actions; 调整 `appendBatch` 在 `live + detached` 时累加 `detachedNewCount`.
- [ ] 新建 `hooks/useFollowScroll.ts`: 程序化滚动标记, 底部判定, rAF 吸底, 锚定行位置补偿; 不触碰 `streamMode`.
- [ ] `LogcatToolbar`: 拆出三个独立控件. `Pause` 图标只依赖 `streamMode`; 新增 `Scroll to the End` (在 `follow` 时禁用) 与 `Restart`.
- [ ] `LogcatList`: 加回到底部浮标 (两种文案), 加容器 `onClick` 通过 `data-seq` 判定行锚定.
- [ ] `useLogcatStream`: 观察 `restartNonce` 变化, 执行停旧会话 + 起新会话.
- [ ] 删除原 `handlePauseToggle` 的三分支逻辑.
- [ ] store 单测补充: 四种 `streamMode` x `followMode` 组合的行为; `detachedNewCount` 累加与清零; 锚定行被淘汰后清除; `restart` 保留 filter 但清数据.

**验证**:
```bash
corepack pnpm test
corepack pnpm build
```
真机, 逐一验证四种组合:
- [ ] `live + follow`: 吸底, 绿点, 暂停图标.
- [ ] `live + detached`: 上滚后总行数继续增长, 浮标显示新增计数, **暂停图标不变**.
- [ ] `paused + follow`: 列表静止, 积压计数, 播放图标.
- [ ] `paused + detached`: 列表静止, 浮标显示"回到底部".
- [ ] `Scroll to the End` 在 `paused + detached` 下只恢复视口, 数据仍暂停.
- [ ] 点空白处停止跟随; 点某行后该行保持可见; 点 tag 同时过滤且停止跟随.
- [ ] `Restart` 清空重连, 过滤条件保留, session 是新的.

**回滚点**: 单独 commit.

---

## 阶段 5: 断开提示与清屏分离

- [ ] `LogcatPanel`: `streamState === "disconnected"` 时插入断开提示条, 显示 detail 摘要 (空时兜底文案, 过长截断 + title), 重连按钮复用 `Restart`.
- [ ] `LogcatToolbar`: 统计区流状态改为完整四态; "清屏"图标改 `Eraser` 且只调 `store.clearScreen()`, 移除 `clearLogcat` 调用.
- [ ] `LogcatToolbar`: 新增"更多 ▾"菜单, 内含 `清空设备日志缓冲区`, 用 `text-destructive`, 复用 `confirmAction` 内联二次确认模式, 确认后调 `clearLogcat(serial)`.

**验证** (真机):
- [ ] 拔设备后 2 秒内出现提示条并显示原因; 已有日志可滚动可过滤; 重连可恢复.
- [ ] 四态指示器逐一确认, 断开时不显示绿点.
- [ ] 清屏后前端清空, 但设备端 `adb logcat -d | head` 仍有历史 (证明未执行 `-c`).
- [ ] 清设备缓冲: 首次点击进确认态并显示不可恢复提示, 再次点击执行; 关闭菜单后确认态复位且无 adb 调用.

**回滚点**: 单独 commit.

---

## 阶段 6: 质量门与 spec 同步

- [ ] 派发 `trellis-check`.
- [ ] 全量验证:
```bash
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
corepack pnpm test
corepack pnpm build
```
- [ ] 布局与主题冒烟: 1200x800 与 900x600 两种宽度下工具栏不重叠; 亮色与暗色均可读.
- [ ] React DevTools Profiler 抽查: 高频日志下未变化的 `LogcatRow` 不重渲染.
- [ ] 更新 `.trellis/spec/frontend/directory-structure.md` (目录树 + feature 目录约定改写).
- [ ] 更新 `.trellis/spec/frontend/hook-guidelines.md` (删除"无自定义 hooks", 补目录与两条模式).
- [ ] 提交.

---

## 收口声明

**本任务显式不做**:

- 查询语言及其一切语法 (否定 / 正则 / 精确 / OR / 括号 / `is:`) —— 子任务 C. 工具栏在本任务结束时仍是四套控件.
- Soft-wrap, 动态行高, 视图格式配置, 包名列, 崩溃高亮 —— 子任务 D. 行高在本任务内必须保持固定 20px.
- 后端任何改动 —— A 已完成, 本任务只消费.
- 设备上线自动重连, PID 轮询改造 —— 父任务"不做范围".

**特别提醒**: 阶段 4 会让人很想顺手把搜索框改成查询框 (因为正在动工具栏). 不要做. 查询语言需要 tokenizer/parser/AST 与独立单测矩阵, 混进本任务会让两个任务都无法独立验证与回滚.

---

## 继续实现前需要确认

- `Restart` 是否应同时清空设备端缓冲区. 当前设计为只清前端 + 重连, 不动设备缓冲.
- 阶段 3 若 `display:none` 方案出现无法收敛的滚动漂移, 是否切换到 design 4.2 的备选方案 (卸载 + store 恢复). 切换时在此记录现象与决定.
- 锚定行的位置补偿在固定行高下由索引直接算出. 子任务 D 引入动态行高后需要改为基于 virtualizer 测量, 该改动归 D, 但本任务实现时应把计算入口收敛到一处便于 D 替换.
