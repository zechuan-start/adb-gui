# 文件页路径收藏与颜色标注设计

## 产品形态与原则

文件页的导航辅助, 不是书签管理器. 设计原则:

- 不增加文件页高度. 收藏入口放进现有 43px 顶栏, 不加常驻收藏栏, 不加侧栏.
- 收藏一步完成, 编辑放进弹出面板. 未收藏时点星标直接收藏; 改颜色、设起始目录、取消收藏都在同一个面板里.
- 颜色是用户主动加的高亮. 默认无色, 无色收藏在文件列表里和普通目录一样.
- 起始目录回退只兜底 "自动打开", 不吞掉用户手动操作的错误.

明确不做的形态: 右键菜单、收藏侧栏、面包屑下的收藏标签行、设置面板里的收藏管理页.

## 布局

### 顶栏 (43px, 现有)

```text
现在:  [⌂][↑] [ 路径输入框 ............................ ][⧉][→]  [⟳]
之后:  [⌂][🔖▾][↑] [ 路径输入框 ...................... ][☆][⧉][→]  [⟳]
        32  44   32              flex-1                  32  32  32    32   (px)
```

- `🔖▾` 收藏列表按钮: `Bookmark` 图标 16px + `ChevronDown` 12px, 高 32px, 宽约 44px, 沿用 `iconButtonClass` 的边框与悬停. 放在 Home 右边: Home 和收藏都是 "跳到某个固定位置", 放在一起.
- `☆` 星标: 放在路径输入框和复制按钮之间, 32x32, 和浏览器地址栏收藏星标的位置习惯一致.
  - 未收藏: `Star` 描边, `text-ink2`.
  - 已收藏无色: `Star` 实心, `text-ink`.
  - 已收藏有色: `Star` 实心, 颜色为对应标注色.
  - 当前没有已加载目录 (无设备 / 首次加载中 / 加载失败且无成功路径) 时禁用.
- 900px 最小宽度下路径输入框仍有约 400px, 可接受.

### 收藏下拉列表

```text
┌ 收藏 · 6 ──────────────────────────────┐  320px 宽, 不超过视口减 32px
│ ■ DCIM                            ⋯ │  每项 44px: 名称 11.5px + 路径 10px mono
│   /sdcard/DCIM                       │
│ ■ Download                     ⌂  ⋯ │  当前目录: bg-hover; 起始目录: House 图标
│   /sdcard/Download                   │
│ □ Documents                       ⋯ │  无色: 紫色描边文件夹
│   /sdcard/Documents                  │
│ ...                                  │  超出可用高度时内部滚动
└──────────────────────────────────────┘
```

- 浮层沿用 Blueprint 浮层规范: `bg-paper`、`border-rule`、硬阴影、直角; 位置用 `dropdownPlacement` 计算上下方向和最大高度, 打开时随滚动 / 缩放重测.
- 空状态: 一行 `text-ink3` 文案 "还没有收藏. 进入目录后点路径栏的星标即可收藏.", 不显示插画.
- 每项右侧 `⋯` (`Ellipsis`) 把浮层内容切换为该项的编辑视图, 编辑视图顶部是 "← 目录名" 返回按钮. 不在浮层上再叠浮层.
- 名称取路径最后一段, 根目录显示 `/`. 名称和路径都 `truncate`, `title` 显示完整路径.

### 编辑面板 (星标弹出 / 列表编辑视图 / 详情面板共用)

```text
┌ 颜色 ─────────────────────┐  232px 宽 (星标弹出时)
│ [⊘][■][■][■][■][■]        │  无色 + 橙 青柠 青 蓝 粉, 每格 22px, 当前项 2px 墨色外框
│ [⌂ 设为起始目录]           │  已是起始目录: "已是起始目录", 禁用, 带对勾
│ [✕ 取消收藏]               │  text-err
└───────────────────────────┘
```

- 色板是 `radiogroup`, 每格 `role="radio"` + `aria-checked` + `aria-label` (颜色名), 左右方向键切换.
- 改颜色立即生效, 面板保持打开; "取消收藏" 后面板关闭, 焦点回到触发按钮. 列表编辑视图中取消收藏后回到列表视图.
- "设为起始目录" 在设置不可用时禁用, `title` 说明原因.

### 详情面板

选中目录时, 在现有 "复制路径 / 打开目录" 旁加一个 `commandButtonClass` 按钮:

- 未收藏: `Star` 描边 + "收藏", 点击直接收藏.
- 已收藏: `Star` 实心 (带颜色) + "已收藏", 点击在按钮下方弹出编辑面板.
- 选中文件或软链接时不显示.

### 文件列表

`DeviceEntryIcon` 增加可选 `bookmarkColor`:

- 有颜色: `Folder` 实心, `fill="currentColor"`, `fillOpacity={0.85}`, 描边同色, 类名 `text-tag-<color>`.
- 无色收藏或未收藏: 保持现有紫色描边 `text-note`.
- 图标仍是 16px, 行高 38px 不变; 选中行左侧紫色条不受影响.

形状 (实心 vs 描边) 和颜色同时区分, 不只靠色相, 色弱用户也能分辨.

### 起始目录回退提示

位置与现有 `settingsError` / 列表错误条相同 (面包屑行下方, 列表上方):

```text
┌ ⚠ 起始目录 /sdcard/Work 在这台设备上打不开, 已打开下载目录.      [设置] ┐  border-warn bg-warn-band text-warn
```

- "设置" 按钮调用 `useUiStore.getState().openSettings("files")`, 与现有设置错误条一致.
- 下一次任意目录加载开始时、切换设备时消失.

## 色板

Token 加在 `src/index.css` 的 `@theme static` (亮色) 与 `.dark` (暗色), Tailwind v4 自动生成 `text-tag-*` / `bg-tag-*`:

| id | 名称 | 亮色 | 暗色 |
|---|---|---|---|
| `orange` | 橙 | `#c25e0a` | `#ff9f43` |
| `lime` | 青柠 | `#5f8a00` | `#b5e05a` |
| `cyan` | 青 | `#00798f` | `#4fd0e0` |
| `blue` | 蓝 | `#1a6fd1` | `#5fb0ff` |
| `pink` | 粉 | `#c2357f` | `#ff8cc6` |

校验结果 (列表底色 = `log-bg` 45% 叠在 `paper` 上, 悬停底色再叠 `hover`):

- WCAG 非文本对比度: 亮色最低 3.14:1 (青柠, 悬停底色), 暗色最低 5.73:1 (蓝, 悬停底色), 全部 ≥ 3:1.
- 与语义色及文件图标灰 (`ink3`) 的 CIEDE2000 色差: 最近的是 橙-warn 15.0 (暗色) 和 蓝-ink3 15.7 (暗色), 其余 ≥ 16.9.
- 标注色两两色差最低 19.0 (青-蓝, 亮色).
- 红、黄、紫、绿语义色本身不进色板.

预览: `research/palette-preview.html` 用项目真实 token 画出亮暗两套主题下的文件列表、下拉列表和编辑面板 (浏览器直接打开); `research/palette-check.py '<色板 JSON>'` 重算对比度和色差, 调整色值时先跑它.

类名映射写成静态字符串表, 保证 Tailwind 能扫描到:

```typescript
export const BOOKMARK_COLOR_TEXT: Record<BookmarkColor, string> = {
  orange: "text-tag-orange",
  lime: "text-tag-lime",
  cyan: "text-tag-cyan",
  blue: "text-tag-blue",
  pink: "text-tag-pink",
};
```

## 模块边界

```text
lib/fileBookmarks.ts                 纯函数: 类型、色板 id 与类名表、协调、增删改、名称、按路径索引
store/fileBookmarks.ts               Zustand + persist, key `adb-gui-file-bookmarks`
lib/deviceFiles.ts                   起始目录回退: 错误判定、reducer 的提示状态
hooks/useDismissableLayer.ts         浮层外部点击 / Esc 关闭 / 焦点归还
hooks/useDropdownPlacement.ts        浮层上下翻转与最大高度 (测量裁剪祖先, 与 BlueprintSelect 同法)
components/files/buttonClasses.ts    文件页按钮与浮层外观类名, 从 DeviceFileManager 移出供共用
components/files/BookmarkFolderIcon.tsx  有色收藏实心文件夹 / 无色描边文件夹
components/files/BookmarkEditor.tsx  色板 + 设为起始目录 + 取消收藏
components/files/BookmarkStar.tsx    星标按钮 + 弹出编辑面板 (路径栏 / 详情面板两种外观)
components/files/BookmarkMenu.tsx    收藏列表按钮 + 浮层 (列表视图 / 编辑视图)
components/DeviceFileManager.tsx     接入上述组件, 图标上色, 回退提示条
```

现有 `LogcatLevelMenu`、`WifiConnect` 内联了外部点击 / Esc 处理, `BlueprintSelect` 内联了裁剪祖先测量. 本任务新增两个浮层, 把这两段逻辑各抽成一个 hook 供它们共用, 不回头改那三个现有组件, 避免扩大改动面.

测试环境没有 jsdom, 组件测试只能 `renderToStaticMarkup`. 所以收藏的增删改、协调、回退判定、reducer 状态都放在纯函数里测; 组件只验证静态结构 (按钮存在、`aria-*`、颜色类名).

## 数据模型与持久化

```typescript
export const BOOKMARK_COLORS = ["orange", "lime", "cyan", "blue", "pink"] as const;
export type BookmarkColor = (typeof BOOKMARK_COLORS)[number];

export interface FileBookmark {
  path: string;                 // 规范化后的绝对设备路径
  color: BookmarkColor | null;  // null = 无色
}

// 纯函数
reconcileFileBookmarks(persisted: unknown): FileBookmark[]
addFileBookmark(list, path): FileBookmark[]          // 已存在则原样返回; 新项追加到末尾, color null
removeFileBookmark(list, path): FileBookmark[]
setFileBookmarkColor(list, path, color): FileBookmark[]
fileBookmarkName(path): string                       // 最后一段, 根目录为 "/"
normalizeBookmarkPath(path): string | null           // 与 Rust normalize_device_path 同规则, 非法返回 null
```

- 新增和修改都返回新数组; 内容没变时返回原数组引用, 避免无谓重渲染和写 `localStorage` (同 `sameToolOrder` 的做法).
- `reconcileFileBookmarks`: 非数组 → `[]`; 元素不是对象、`path` 不是字符串、规范化失败 (相对路径、含 NUL、越过根) → 丢弃; `color` 不在色板内 → `null`; 重复路径保留第一个. 永远不抛异常.
- 收藏写入的路径来自后端返回的 `listing.path` 或 `entry.path`, 已经规范化; 前端的规范化只用于防御存储里的脏数据.

```typescript
interface FileBookmarkState {
  bookmarks: FileBookmark[];
  addBookmark(path: string): void;
  removeBookmark(path: string): void;
  setBookmarkColor(path: string, color: BookmarkColor | null): void;
}
```

- `persist` 的 `name: "adb-gui-file-bookmarks"`, `version: 1`, `partialize` 只存 `bookmarks`, `merge` 走 `reconcileFileBookmarks`.
- 不放进 `lib/settings.ts`: 那里的分区会被 "恢复默认" 重置, 并受 `SETTINGS_VERSION` 迁移约束; 收藏是用户数据, 不是偏好. 也不放进 `store/ui.ts`: 那里只放布局状态.
- 组件里按路径查收藏用 `useMemo(() => new Map(bookmarks.map((b) => [b.path, b])), [bookmarks])`, 文件列表每行 O(1) 查找.

## 设为起始目录

- 写入方式与 `StartDirectoryPreference` 完全相同: `store.update("files", { ...store.preferences.files, startDirectory: path })`. 不新增设置字段, 不改 `SETTINGS_VERSION`.
- "是否已是起始目录" 只比较 `preferences.files.startDirectory === path`. `null` (默认下载目录) 不与任何收藏匹配, 避免前端复制 Rust 的默认路径常量.
- 设置面板会把收藏路径显示为对应预设 (`/sdcard`、`/sdcard/DCIM/Camera`) 或 "自定义".
- 删除收藏不影响已设的起始目录.

## 起始目录回退

### 判定

```typescript
// lib/deviceFiles.ts
export function isUnavailableStartDirectoryError(error: AppErrorPayload): boolean
// code 为 files.notDirectory 或 files.directoryPermission 时为 true
```

### 数据流

```text
loadStartDirectory(serial)
  startDirectory = requireSettings().files.startDirectory
  └─ loadDirectory(serial, startDirectory, { fallbackToDefault: startDirectory !== null })
       listDeviceDirectory(serial, startDirectory)
       ├─ 成功 → list-success (与现在相同)
       └─ 失败
           ├─ 请求已过期 → 丢弃 (与现在相同)
           ├─ fallbackToDefault && isUnavailableStartDirectoryError(error)
           │    → dispatch start-fallback { serial, requestId, path: startDirectory, error }
           │    → loadDirectory(serial, null, { keepStartFallback: true })
           │        成功 → 列表显示下载目录, 提示条保留
           │        失败 → 显示该错误 (不再二次回退), 提示条保留
           └─ 其他 → list-error (与现在相同)
```

### reducer 变化

- `DeviceFileManagerState` 增加 `startFallback: { path: string; error: AppErrorPayload } | null`.
- 新 action `start-fallback`: 只在 serial 和 requestId 匹配时写入.
- `list-start` 增加可选 `keepStartFallback`; 不带时清空 `startFallback`. 这样回退那次加载保留提示, 之后的任何导航都会清掉.
- `reset` (切换设备) 清空.
- `start-fallback` 不设置 `listError`, 列表不会闪出错误条.

### 不回退的情况

- `startDirectory` 为 `null`: 已经是默认目录, 打不开就显示原错误.
- 手动输入路径、面包屑、收藏跳转、列表错误条上的重试: 都直接调 `loadDirectory`, 不带 `fallbackToDefault`.
- 设置读取失败: `requireSettings()` 抛错, 走现有错误路径.
- 设备断开、adb 失败、列表解析失败等其他错误码.

## 文案

新增 key 放在 `tools-zh-CN.ts` / `tools-en.ts` 的 `files.bookmarks` 下 (与 `files.deviceFileManager` 同级), 回退提示放 `files.deviceFileManager.startDirectoryFallback({ path })`. 颜色名 `files.bookmarks.colors.<id>` 用于 `aria-label` 和 `title`. 全部是 `(t) => string` 的渲染期文本, 不在 store 里保存翻译后的字符串.

## 规范更新 (随实现一起提交)

- `.trellis/spec/frontend/settings-clipboard.md`: "Unavailable start path → ... no automatic fallback" 改为: 自动打开起始目录时, `files.notDirectory` / `files.directoryPermission` 回退到默认目录并显示提示, 不改设置; 手动导航和其他错误不回退.
- `.trellis/spec/frontend/state-management.md`: Stores 表加 `useFileBookmarkStore`, 说明为什么不放 settings / ui store, 以及 `reconcileFileBookmarks` 是唯一的持久化入口.
- `.trellis/spec/frontend/component-guidelines.md`: 记录 `tag-*` 色板 token 的用途限制 (只用于用户标注, 不当语义色用) 和亮暗校验要求.

## 兼容与回滚

- 新增独立的 `localStorage` key, 不碰 `adb-gui-settings` 和 `adb-gui-ui`, 不需要迁移.
- 回滚代码后旧 key 留在 `localStorage` 里无人读取, 无副作用.
- 起始目录回退是行为变化: 以前打不开时显示错误 + "打开下载目录" 按钮, 以后自动打开下载目录并显示提示. 回滚即恢复原行为.
- 后端无改动.
