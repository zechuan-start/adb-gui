# Blueprint 应用外壳与主题设计

## 组件结构

```text
App
└── AppShell
    ├── IndexRail
    │   ├── PaneNavigation
    │   ├── LogcatToggleSlot
    │   └── ThemeSegment
    └── MainWorkspace
        ├── TopBar
        │   └── DevicePicker
        └── WorkspaceSlots
            ├── PageContent
            └── LogcatSlot
```

- `IndexRail` 和 `TopBar` 不读取具体页面业务 store.
- `AppShell` 从 `ui` store 读取页面和日志布局状态, 并接收页面内容和 Logcat slot.
- `DevicePicker` 复用 `device` store 和 `lib/device.ts` 的状态判断.

## CSS 与字体

- `src/index.css` 定义 light 默认 token, `.dark` 覆盖暗色 token.
- 现有 Tailwind 角色 token 保留命名, 其值映射到 Blueprint 色值, 降低业务组件一次性迁移成本.
- 新增 `font-ui` 和 `font-data` 角色, 由本地 IBM Plex Sans/Mono 资源提供.
- 根工作区背景绘制 22 px 网格. 弹层、工具模块和后续日志面板使用各自 surface, 避免文字直接压在网格上.

## 主题生命周期

1. 安全读取持久化 theme, 非法值回到 `system`.
2. 安全创建 `matchMedia`, 缺失时使用 `{matches: false}` 语义.
3. 将解析后的暗色状态写到 `document.documentElement.dark`.
4. 只在 system 模式响应 media change.
5. store 销毁或热更新时正确移除 listener.

主题 UI 使用三个等宽图标段, 分别为 Monitor、Sun 和 Moon, 通过 tooltip 和 `aria-label` 表达含义.

## 页面与日志布局状态

`src/store/ui.ts` 保存:

- `activePane`.
- `logOpenByPane`.
- `logHeight`.
- `logMaximized`.
- `logReadThroughSeq`.

只持久化用户偏好. 临时 pointer drag 状态留在组件本地. `setActivePane` 内部必须同步退出 `logMaximized`, 避免调用者遗漏规则.

## 设备状态

- `DevicePicker` 展示 model、serial 和文字状态.
- 在线使用实心 ok 方块, 未授权使用 warn 方块, 离线和无设备使用空心方块.
- 选择器允许 USB unauthorized/offline 项进入当前上下文, 以便页面展示修复指引.
- 页面工具是否可用继续由 `isOnlineDevice` 决定, 不能用 `selectedDevice !== null` 代替.

## 响应式

- P0 最小窗口为 `900x600`.
- 168 px 索引栏保持固定, 主区使用 `min-width: 0`.
- 顶栏设备名称和 Activity 可截断, 刷新和无线图标按钮保持 34 px 固定尺寸.
- 不通过缩放字体适配窄窗.

## 风险

- `App.tsx` 当前同时管理导航和日志首次挂载. 拆分时必须保留 Activity polling、process map 和设备事件 effect 的生命周期.
- 全局 token 改色会影响所有尚未翻新的页面. 每个页面至少做可读性和对比度冒烟, 但不在本任务重排其内部布局.
