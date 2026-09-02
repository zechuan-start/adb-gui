# Blueprint Quiet UI 翻新实施计划

## 执行规则

- 父任务不直接启动实现. 按顺序启动和完成子任务.
- 每个子任务实施前运行 `trellis-before-dev`, 完成后运行 `trellis-check`.
- 每个阶段先保留现有行为测试, 再改视觉和布局.

## 阶段 1: 外壳与主题

目标子任务: `09-01-blueprint-shell-theme`.

- [x] 建立 Blueprint token、离线字体和两套主题.
- [x] 提取 `AppShell`、`IndexRail`、`TopBar`、`DevicePicker` 和 `StatusBanner`.
- [x] 新增 `ui` store, 完成页面导航、主题三档和日志开关状态模型.
- [x] 让五个现有功能页进入新外壳, 不删除功能入口.
- [x] 增加 theme/ui store 定向测试.
- [x] 在 `1200x800`、`900x600` 和亮暗主题下做浏览器截图检查.

验证:

```bash
corepack pnpm test
corepack pnpm build
```

回滚点: 外壳提交. 未通过响应式和页面可达性检查时不启动日志子任务.

## 阶段 2: 持久 Logcat

目标子任务: `09-01-log-view-readability`.

- [x] 将日志流控制器从独立页签生命周期中解耦.
- [x] 接入按页面开关、未读计数、拖拽高度、铺满、隐藏和快捷键.
- [x] 重做 Logcat token、工具栏和行排版, 保留现有虚拟列表和固定 20 px 快路径.
- [x] 新增堆栈分组与逐崩溃展开状态.
- [x] 实现原生多行框选优先于单行复制的选择规则.
- [x] 增加分组、格式化、选择优先级和 UI store 测试.
- [x] 使用真实设备验证 10,000 行、Pause、detached、Soft-Wrap 和框选复制.

验证:

```bash
corepack pnpm test
corepack pnpm build
```

回滚点: Logcat 工作区提交. 发生性能或选择回归时整体回滚该子任务, 不在工具页阶段修补.

## 阶段 3: 工具工作台

目标子任务: `09-01-blueprint-tools-workbench`.

- [x] 建立共享 Blueprint 工具模块和规格条.
- [x] 依次迁移截图、录屏、APK、Deep Link、Bug Report、端口转发、快捷按键和当前应用.
- [x] 统一在线、未授权、离线和无设备的禁用与反馈.
- [x] 保留文件选择、保存、确认、toast 和错误行为.
- [x] 使用真实设备逐项冒烟工具功能.

验证:

```bash
corepack pnpm test
corepack pnpm build
```

回滚点: 工具页提交. 每个业务工具仅调整视图, 不改 Tauri command contract.

## 阶段 4: 父任务集成验收

- [x] 将应用页密排列表、详情区、空态和行内确认统一到 Blueprint 语言.
- [x] 将文件页路径、操作、表格、传输状态、预览与弹层统一到 Blueprint 语言.
- [x] 将生码页输入模块、空态、结果列表和预览统一到 Blueprint 语言.
- [x] 将解码页来源模块、空态、结果列表和操作统一到 Blueprint 语言.
- [x] 不新增假数据或第二状态源, 不改变现有 Tauri command contract.
- [x] 检查 `1200x800` 和 `900x600` 的 light、dark、system.
- [x] 检查在线、未授权、离线和无设备四种设备状态.
- [x] 检查所有页面切换、按页日志记忆、未读计数和铺满退出.
- [x] 检查菜单、toast、弹层、focus、键盘和 reduced motion.
- [x] 通过 LaunchServices 启动 Tauri app, 完成真实设备端到端冒烟.
- [x] 检查最终 diff 中的重复 token、第二状态源、隐藏 fallback 和原型占位逻辑.

集成验收于 2026-09-02 完成:

- Browser 实测 `1200x800` 和 `900x600` 的 light、dark、system, 根节点无横向溢出, 索引栏 168 px、顶栏 54 px、Logcat 工具栏 40 px 且保持单行.
- Browser 实测五页可达、日志默认开关、按页记忆、铺满退出、`Cmd/Ctrl+J`、查询聚焦、BlueprintSelect 键盘操作、预览弹层、toast、WiFi 菜单、focus-visible 和 reduced motion.
- Tauri app 实测在线设备、暂停积压、隐藏未读、展开清零和 10,000 行环形缓冲. 无设备状态由浏览器实际渲染覆盖, 未授权和离线状态由 `StatusBanner` 与设备选择/store 测试覆盖.
- WiFi 菜单、toast、更新提示和 Logcat 查询建议已移除旧圆角卡片语言, 使用不透明 Blueprint surface 与硬阴影.
- 前端 27 个测试文件共 270 项通过, Rust 57 项测试通过, TypeScript 与 Vite production build 通过, `git diff --check` 通过.
- debug `.app` 已生成并通过 LaunchServices 启动. updater 压缩包签名因本机未提供 `TAURI_SIGNING_PRIVATE_KEY` 在 bundle 生成后返回非零, 不影响本次 debug app 冒烟.

最终验证:

```bash
corepack pnpm test
corepack pnpm build
cargo test --manifest-path src-tauri/Cargo.toml
```

## 后续任务

应用页、文件页、生码页和解码页已按用户补充的完整规格纳入本轮集成并完成. 后续新增后端元数据、文件删除或设备截图解码等能力时, 再按独立任务规划, 不在本次 UI 翻新中伪造能力.
