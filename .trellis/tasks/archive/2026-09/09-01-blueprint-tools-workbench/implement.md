# Blueprint 工具工作台实施计划

## 1. 设备上下文组件

- [x] 提取共享 `StatusBanner` 和 `DeviceSpecStrip`.
- [x] 收敛 `getDeviceInfo` 加载状态, 让规格条和设备信息弹层复用.
- [x] 增加设备快速切换时忽略陈旧响应的测试.

验证: online、unauthorized、offline、none 四种状态的纯状态映射测试通过.

## 2. 共享工具模块

- [x] 新增轻量 `ToolModule`.
- [x] 建立网格、header、body、图号和宽模块规则.
- [x] 检查没有 card inside card 和业务逻辑进入视图壳.

验证: `1200x800` 三列和 `900x600` 两列截图无重叠.

## 3. 分批迁移工具

- [x] 截图和录屏.
- [x] APK 安装和 Deep Link.
- [x] 端口转发和 Bug Report.
- [x] 快捷按键和当前应用.

每批验证:

- online 时主要动作可用.
- unauthorized/offline/none 时设备动作 disabled.
- loading、success、error 和 destructive confirmation 与现状一致.

## 4. 集成验证

- [x] light/dark/system 视觉检查.
- [x] `1200x800`、`900x600` 检查.
- [ ] 真实设备完成八个工具主要路径.
- [x] 检查文件保存路径、打开/显示目录、toast 和确认弹层.

```bash
corepack pnpm test
corepack pnpm build
```

验证上限: 2026-09-01 本机 `adb devices -l` 无设备, 因此真实设备八类工具路径保持未勾选. 四类设备规格条映射、陈旧详情拒绝和无设备 disabled 状态由单测与浏览器检查覆盖.

风险文件: 八个工具组件、`DeviceInfoPanel.tsx`、device detail 状态和工具页组合布局. 不修改 `src-tauri` command contract.
