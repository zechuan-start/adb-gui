# 设计: ADB GUI MVP

## 产品形态

ADB GUI 是一个桌面工具型 app. 主界面应该像“Android 测试和开发小工具工作台”, 不是命令控制台, 也不是以应用列表为中心的管理后台.

核心设计原则:

- 设备上下文常驻顶部, 分两行展示避免拥挤.
- 高频操作放首屏, 按使用频率分配视觉权重.
- 截图是当前 P0 主能力, 在布局中占据最大面积.
- 常用 adb 命令必须被设计成动作按钮/表单, 不是命令行输入框.
- App list 不是主能力, 默认不展示.
- 不使用左侧侧边栏作为 P0 信息架构.
- 截图只保存并外部打开, 不做内置预览.
- 所有工具卡片都有明确的禁用态, 加载态和错误态.
- 操作反馈使用底部 toast 栏, 不侵占工具卡片内部空间.

## 架构概览

```
React 前端 (TypeScript)
  - 应用外壳: 设备上下文 + 工具工作台
  - 工具组件: 截图, APK 安装, 快捷按键, 当前应用动作
  - 共享操作状态和结果提示
        |
        | Tauri invoke / event
        v
Rust 后端 (Tauri Commands)
  - adb 路径解析
  - 设备列表和 Activity 查询
  - 截图保存 + 系统打开/显示文件
  - APK 安装命令
  - 快捷按键和当前包动作
        |
        v
adb 进程层
```

## 前端布局

### 明确拒绝的布局

不要使用:

```
顶部栏
左侧侧边栏: Apps / Logcat / Screenshot / Text
主面板按模块切换
```

这个结构会让产品看起来像控制台或后台系统, 也会错误地把 app 列表, logcat, text 等小功能提升成同级主导航.

### MVP 布局

窗口默认尺寸: 960×640, 最小宽度 720px.

#### 顶部上下文栏 (双行)

```
┌──────────────────────────────────────────────────────────┐
│ 行1: [ADB GUI logo]  设备:<选择器▾>  [刷新⟳]  adb 36.0.0 (system) │
│ 行2: Activity: com.example.app/.MainActivity        [刷新] │
└──────────────────────────────────────────────────────────┘
```

- 行1 高度 40px: 应用标识 + 设备选择器 + 刷新按钮 + adb 版本/来源 (右对齐).
- 行2 高度 28px: Activity 全路径用 monospace 显示, 超长时 truncate 并 tooltip 显示全文. 右侧有独立刷新按钮.
- 行2 在无设备时隐藏, 减少空白噪音.
- 设备选择器在无设备时显示 "未连接设备" (红色圆点); unauthorized 显示黄色圆点 + "(未授权)"; offline 显示灰色圆点 + "(离线)".

#### 主工作区

```
┌──────────────────────────────────────────────────────────┐
│ [工具]  [日志]  [应用]          ← segmented control, 靠左 │
├──────────────────────────────────────────────────────────┤
│                                                          │
│  ┌─────────────────────────┐ ┌────────────────────────┐ │
│  │ 📷 截图 (55%)           │ │ 📦 APK 安装 (45%)      │ │
│  │                         │ │                        │ │
│  │ [截图并打开] 大按钮      │ │ 拖拽 APK / 选择文件    │ │
│  │                         │ │                        │ │
│  │ 最近: ~/Pictures/...    │ │ 安装结果和拖拽反馈     │ │
│  │ [复制路径] [Finder显示]  │ │                        │ │
│  └─────────────────────────┘ └────────────────────────┘ │
│                                                          │
│  ┌─────────────────────────┐ ┌────────────────────────┐ │
│  │ ⌨️ 快捷按键 (40%)       │ │ 📱 当前应用 (60%)      │ │
│  │                         │ │                        │ │
│  │ 导航: [←] [⌂] [☐]      │ │ 包名: com.example.app  │ │
│  │ 输入: [↵] [⌫]           │ │ [强停] [启动]          │ │
│  │ 硬件: [⏻] [🔊] [🔉]    │ │ [清数据⚠] [卸载⚠]     │ │
│  └─────────────────────────┘ └────────────────────────┘ │
│                                                          │
└──────────────────────────────────────────────────────────┘
┌──────────────────────────────────────────────────────────┐
│ Toast: ✓ 截图已保存到 ~/Pictures/ADB GUI/...     [关闭×] │
└──────────────────────────────────────────────────────────┘
```

#### 布局规则

- 第一行工具卡: 截图 55%, APK 安装 45%.
- 第二行: 快捷按键 40%, 当前应用动作 60%. 当前应用更宽因为包含包名显示和多个操作按钮.
- 卡片间距 12px, 卡片内边距 16px.
- 每个卡片有标题行 (图标 + 标题), 不同卡片视觉风格统一.
- 整个工作区可垂直滚动, 但在默认窗口尺寸下应该不需要滚动.

#### Segmented Control

- `工具`: 默认页, 包含截图, APK 安装, 快捷按键, 当前应用动作.
- `日志`: P1, logcat 查看. 标签可带 badge 标记为 "P1".
- `应用`: P1/P2, 可选辅助列表, 永远不作为默认页.

#### 操作反馈: Toast 栏

- 固定在窗口底部, 高度 36px.
- 默认隐藏 (高度 0), 有消息时滑出.
- 成功消息: 绿色圆点 + 描述, 3 秒后自动消失.
- 错误消息: 红色圆点 + 描述, 常驻直到用户点关闭.
- 同一时刻最多显示 1 条, 新消息替换旧消息.
- Toast 不遮挡工具卡片, 而是推动卡片区域上移 (或使用固定底部预留空间).

## 组件边界

### `AppShell`

- 负责全局布局.
- 渲染顶部设备上下文.
- 默认渲染 `QuickToolsWorkspace`.
- 不渲染常驻左侧侧边栏.

### `DeviceContextBar`

双行布局:

行1 (主行):

- 左侧: 应用标识 "ADB GUI" (font-semibold, 不加 logo 图片).
- 中左: 设备选择器下拉框, 带状态指示圆点:
  - 🟢 绿色: device (在线).
  - 🟡 黄色: unauthorized.
  - ⚫ 灰色: offline.
  - 🔴 红色: 无设备.
- 中左: 刷新按钮 (圆形 icon button).
- 右侧: `adb {version} ({source})` monospace 小字.

行2 (副行):

- 左侧: "Activity:" 标签 + 当前 Activity 全路径 (monospace, 超长 truncate, hover tooltip).
- 右侧: 单独的 Activity 刷新按钮.
- 无选中设备时行2 完全隐藏 (不显示空行).
- Activity 为空时显示 "暂无前台 Activity" (muted 颜色).

整体视觉:

- 行1 背景 card 色, 行2 背景略深 (secondary) 以区分层级.
- 行1 高度 40px, 行2 高度 28px.
- 行1 和行2 之间无额外间距, 视觉连续.

### `QuickToolsWorkspace`

- 承载 P0 工具卡片, 使用 CSS Grid 布局.
- Grid 定义: `grid-template-columns: 2fr 3fr`, 三行.
  - Row 1: ScreenshotTool | ApkInstallTool.
  - Row 2: QuickKeysTool | CurrentAppActionsTool.
- Gap: 12px.
- Padding: 16px.
- 整区域 overflow-y: auto, 但默认窗口尺寸 (960×640) 下不应出现滚动条.
- 窗口宽度 < 720px 时退化为单列堆叠, 每个卡片占满全宽.
- 管理全局 Toast 状态 (通过 zustand store 或 context).
- 避免把单个小功能做成占满整页的大空状态.

### `ScreenshotTool`

卡片布局 (从上到下):

- 标题行: 📷 图标 + "截图" 标题.
- 主按钮: "截图并打开", 占据卡片主体面积, 居中大按钮 (高度 48px, 圆角 12px, primary 色).
- 最近截图行: 显示最近 1 次截图的文件名 (truncate), 右侧两个小 icon button: [复制路径] [在 Finder 中显示].
- 无截图历史时最近截图行不显示.

状态:

- 默认态: 按钮可点击.
- 加载态: 按钮显示 spinner + "截图中...", 禁用点击.
- 成功态: Toast 显示 "截图已保存到 {path}", 卡片内最近截图行更新.
- 失败态: Toast 显示红色错误, 按钮恢复可点.
- 禁用态 (无设备): 按钮灰显 + tooltip "请先连接设备".

前端职责:

- 触发截图.
- 无在线设备或截图执行中时禁用按钮.
- 显示保存路径.
- 提供复制路径和在文件管理器中显示的入口.

后端职责:

- 执行 `adb -s <serial> exec-out screencap -p`.
- 把 PNG 保存到系统图片目录下的 `ADB GUI` 文件夹.
- 文件名使用可读且稳定的格式:
  - `<safe-serial>-YYYYMMDD-HHMMSS.png`
- 保存成功后用系统默认图片查看器打开.
- 返回保存路径和打开/显示文件结果.

不引入内部图片预览器.

### `ApkInstallTool`

卡片布局:

- 标题行: 📦 图标 + "APK 安装" 标题 + 右侧显示目标设备名 (如 "→ Pixel 7").
- 拖拽热区: 占据卡片剩余空间, 虚线边框 (border-dashed), 居中显示:
  - 默认态: "拖拽 APK 文件到此处" + 下方 [选择文件] 按钮.
  - 拖入悬浮态: 边框变实线 + primary 色高亮, 背景轻微变色, 文字变为 "释放以安装".
  - 安装中: 显示文件名 + spinner + "安装中...".
  - 安装成功: 显示 ✓ + "安装成功" (绿色), 2 秒后恢复默认态.
  - 安装失败: 显示 ✗ + 错误信息 (红色), 点击任意位置恢复默认态.
- 卡片高度: 固定 80px (不含标题行), 不需要太高, 但要保证拖拽区域足够明显.

交互:

- 拖拽支持: 整个卡片区域 (不只是虚线内) 都接受 drop.
- 文件过滤: 只接受 .apk 后缀, 其他文件 drop 时 toast 提示 "仅支持 APK 文件".
- 选择文件按钮: 打开系统文件选择器, 过滤 .apk.
- 安装前显示文件名和目标设备, 不做额外确认 (APK 安装是低风险操作).

前端职责:

- 选择 APK.
- 支持拖拽 APK 到工具区域或窗口.
- 显示目标设备和安装进度/结果.

后端职责:

- 执行 `adb -s <serial> install -r <apk_path>`.
- 返回 stdout/stderr.
- 清楚展示安装失败原因.

### `QuickKeysTool`

卡片布局:

- 标题行: ⌨️ 图标 + "快捷按键" 标题.
- 按钮区: 按功能分组, 每组有小标签:
  - **导航** (灰色分组标签): [← 返回] [⌂ 主页] [☐ 最近任务] — 横排, 等宽方形按钮 36×36px.
  - **输入** (灰色分组标签): [↵ 回车] [⌫ 删除] — 横排.
  - **硬件** (灰色分组标签): [⏻ 电源] [🔊 音量+] [🔉 音量-] — 横排.
- 分组之间间距 8px, 组内按钮间距 6px.
- 按钮样式: secondary 背景, hover 变亮, active 按下 scale(0.95) 动画, 带 tooltip 显示完整名称.

状态:

- 默认态: 所有按钮可点击, 点击后无需等待反馈 (fire-and-forget, 错误时 toast).
- 禁用态 (无设备): 所有按钮灰显, tooltip 显示 "请先连接设备".
- 按钮点击反馈: 短暂的 pressed 动画 (100ms scale), 不显示 loading.

前端职责:

- 展示紧凑图标按钮:
  - 返回.
  - 主页.
  - 最近任务.
  - 回车.
  - 删除 (退格).
  - 电源.
  - 音量加/减.
- 无在线设备时禁用按钮.
- 在 tooltip 或面板状态里显示目标设备.

后端职责:

- 执行 `adb -s <serial> shell input keyevent <KEYCODE>`.
- 使用允许列表维护可发送按键.
- 不接受前端传入任意 keyevent 字符串.

### `CurrentAppActionsTool`

卡片布局:

- 标题行: 📱 图标 + "当前应用" 标题.
- 包名行: 显示从当前 Activity 推导的包名, monospace 字体, 带复制按钮. 如: `com.example.app` [📋].
- 动作按钮行: 水平排列, 按风险等级分色:
  - [强停] secondary 按钮 (低风险).
  - [启动] secondary 按钮 (低风险).
  - [清数据] destructive outline 按钮 (高风险, 带 ⚠️ 图标).
  - [卸载] destructive outline 按钮 (高风险, 带 ⚠️ 图标).
- 按钮排列: 前两个左对齐紧挨, 后两个右对齐紧挨, 中间留间距形成视觉分隔.

边界情况:

- Activity 为空 / 无法解析包名时: 显示 "暂无前台应用" + 手动输入包名的 inline input (placeholder: "输入包名..."), 输入后动作按钮可用.
- 手动输入包名时, 按钮标签变为 "对 {pkg} 执行" 以明确目标.

确认机制:

- 清数据: 点击后按钮变为 "[确认清除 {pkg} 数据?]" 红色, 3 秒未点击自动恢复. 不用模态弹窗.
- 卸载: 同上, "[确认卸载 {pkg}?]" 红色倒计时.
- 这种 inline confirm 比 modal dialog 更轻量, 适合工具型产品.

状态:

- 有前台应用: 包名可见, 所有按钮可用.
- 无前台应用: 显示手动输入入口, 按钮禁用直到有输入.
- 操作成功: Toast 显示 "{动作} 成功".
- 操作失败: Toast 显示错误原因.
- 禁用态 (无设备): 整个卡片显示 "请先连接设备", 所有按钮灰显.

前端职责:

- 展示从当前 Activity 推导出来的当前包名.
- 提供动作:
  - 强停.
  - 清数据/缓存.
  - 启动.
  - 卸载.
- 清数据和卸载必须二次确认 (inline confirm, 非模态).
- 不依赖完整 app 列表.
- 支持手动输入包名作为 fallback.

后端职责:

- 强停: `adb shell am force-stop <package>`.
- 清数据: `adb shell pm clear <package>`.
- 启动: 解析 launcher activity, 或使用 monkey/am start 策略.
- 卸载: `adb uninstall <package>`.
- 返回明确 stdout/stderr 和退出状态.

### 可选 `AppHelper`

- 不属于默认 MVP 工作台.
- 如保留, 放到 P1/P2 的非默认 tab.
- 可支持按包名启动, 强停, 卸载, 但完整包列表不是 P0 验收要求.

## ADB 命令能力地图

| 分组 | 可用命令 | 产品位置 |
|---|---|---|
| 设备上下文 | `devices -l`, `get-state`, `get-serialno`, `reconnect offline` | P0 顶部栏 / 连接状态 |
| 截图录屏 | `exec-out screencap -p`, `screenrecord` | 截图 P0, 录屏 P1 |
| 输入控制 | `shell input keyevent`, `tap`, `swipe` | 快捷按键 P0; tap/swipe 后续 |
| 安装卸载 | `install`, `install-multiple`, `uninstall` | APK 安装 P0; split APK P1 |
| 当前应用 | `dumpsys activity`, `am force-stop`, `pm clear`, `monkey/am start` | 当前应用动作 P0 |
| 日志报告 | `logcat`, `bugreport` | P1 调试/报告 |
| 网络调试 | `pair`, `connect`, `disconnect`, `forward`, `reverse`, `mdns services` | P1 连接/调试工具 |
| 设备信息 | `getprop`, `wm size`, `wm density`, `dumpsys battery` | P1 只读信息面板 |
| 文件传输 | `push`, `pull` | P2 文件工具 |
| 高级调试 | `jdwp`, `instrument`, `dumpheap`, `profile` | P2 专家工具 |
| 危险维护 | `root`, `remount`, `reboot`, `disable-verity`, `settings put`, `wm size/density override` | 仅危险区 |

## 数据流

### 截图

```
用户点击截图
→ 前端校验选中设备在线
→ invoke take_screenshot(serial)
→ 后端执行 adb screencap
→ 后端写入本地 PNG
→ 后端用系统默认图片查看器打开 PNG
→ 前端展示保存路径和结果
```

### APK 安装

```
用户选择或拖拽 APK
→ 前端校验 .apk 路径和选中设备在线
→ invoke install_apk(serial, path)
→ 后端执行 adb install -r
→ 前端展示结果
```

### 快捷按键

```
用户点击按键按钮
→ 前端校验选中设备在线
→ invoke send_key_event(serial, key)
→ 后端从允许列表映射到 KEYCODE
→ 后端执行 adb shell input keyevent
→ 前端展示结果
```

### 当前应用动作

```
当前 Activity 更新
→ 前端/后端解析当前包名
→ 用户点击当前包动作
→ 清数据/卸载先二次确认
→ invoke current_app_action(serial, package, action)
→ 后端执行对应 adb 命令
→ 前端展示 stdout/stderr 和退出状态
```

## 跨平台注意事项

| 问题 | macOS | Windows |
|---|---|---|
| adb 查找 | `which`, SDK 路径, resource fallback | `where`, SDK 路径, resource fallback |
| 截图目录 | `~/Pictures/ADB GUI/` | `%USERPROFILE%\\Pictures\\ADB GUI\\` |
| 打开截图 | 系统默认打开方式 | 系统默认打开方式 |
| 显示文件 | Finder reveal | Explorer select |
| 路径转义 | 避免拼接 shell 字符串 | 避免拼接 shell 字符串 |

## 前端 UI 依赖

已有基础: TailwindCSS 4, lucide-react, zustand, cva + clsx + tailwind-merge.

按需引入:

| 库 | 用途 | 说明 |
|---|---|---|
| `sonner` | Toast 通知 | 轻量, 零配置, 暗色主题, 支持 success/error/promise |
| `@radix-ui/react-tooltip` | Tooltip | 无样式原语, 自配 Tailwind, 无障碍完备 |
| `@radix-ui/react-tabs` | Segmented control / Tab 切换 | 无样式, 键盘导航, 自配外观 |
| shadcn/ui (copy-paste) | Button, Card, Input 组件模板 | 不是 npm 包, 用 CLI 复制源码到项目, 基于 Radix + cva, 可改 |

不引入:

- 重型 UI 框架 (Ant Design, Mantine, MUI) — 体积大, 样式侵入, 不适合 Tauri 桌面 app.
- 拖拽库 (react-dnd, dnd-kit) — APK 拖拽使用 Tauri v2 原生 drag-drop 事件 (`@tauri-apps/plugin-drag-drop` 或窗口级 file drop listener), 不需要前端拖拽库.
- 动画库 (framer-motion) — 设计中动画仅涉及 CSS transition, 不需要 JS 动画引擎.

shadcn/ui 使用方式:

```bash
npx shadcn@latest init
npx shadcn@latest add button card input tabs tooltip
```

只复制需要的组件, 代码在 `src/components/ui/` 下, 完全可控.

## 实现约束

- 优先用进程参数数组调用 adb, 不拼接 shell 命令字符串.
- 不引入静默成功兜底.
- 不在前端重复实现 adb 路径选择逻辑.
- 操作结果 payload 必须类型明确.
- 破坏性或设备变更操作前, UI 必须明确展示目标设备.
- 命令包装从允许列表动作注册表生成, 不允许执行任意用户输入的 adb 片段.
- 破坏性动作必须在前端和后端命令定义中带确认元数据.

## 视觉风格规范

### 配色

- 暗色主题为默认且唯一主题 (工具型产品, 开发者偏好暗色).
- 背景层级: background (最深) → card (中) → secondary (按钮/输入框).
- 强调色: primary (白/浅灰) 用于主按钮和重要文字.
- 危险色: destructive (红) 用于清数据, 卸载等破坏性操作.
- 成功色: 绿色 (仅用于 toast 和结果指示, 不用于按钮).

### 卡片通用规范

每个工具卡片遵循统一结构:

```
┌────────────────────────────────────────┐
│ [icon] 标题                      [辅助] │ ← 标题行, 高度 32px
├────────────────────────────────────────┤
│                                        │
│           卡片主体内容                  │ ← 弹性高度
│                                        │
└────────────────────────────────────────┘
```

- 圆角: 8px (radius-md).
- 边框: 1px solid border 色.
- 背景: card 色.
- 内边距: 12px 16px.
- 标题行: 图标 (16px) + 标题文字 (14px, font-medium) + 可选右侧辅助信息.
- 标题行与主体之间: 8px 间距.
- 卡片之间不允许嵌套.

### 字体

- 界面文字: system font stack (-apple-system, BlinkMacSystemFont, ...).
- 代码/路径/包名: monospace (SF Mono, JetBrains Mono, Menlo).
- 基础字号: 13px (桌面工具偏紧凑).
- 按钮文字: 13px, font-medium.
- 标签/提示: 11px, muted-foreground.

### 间距系统

- 基础单位: 4px.
- 组件间距: 12px (3 单位).
- 内边距: 16px (4 单位).
- 紧凑内边距: 8px (2 单位).
- 按钮内边距: 8px 12px.

### 动画

- 过渡: 150ms ease-out (hover, active 状态).
- Toast 进出: 200ms slide-up/slide-down.
- 按钮 active: 100ms scale(0.95).
- 禁止装饰性动画, 所有动画必须服务于状态反馈.

## 回滚和兼容

- 现有 `AppManager`, `LogcatViewer`, `Screenshot` 组件可以重构, 不要求立即删除.
- 移除侧边导航是预期行为变化.
- 如果 Logcat/App list 已有实现, 放到非默认 tab 或暂缓; 不能让它们定义 P0 体验.
