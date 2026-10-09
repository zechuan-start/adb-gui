# 文件页路径收藏与颜色标注实施计划

分六步, 按用户可见工作流推进. 第 1-2 步是纯逻辑, 先测透; 第 3-5 步接 UI; 第 6 步收尾. 每步结束都应能通过类型检查和已有测试.

通用验证命令:

```bash
corepack pnpm exec tsc --noEmit -p .
corepack pnpm test
```

## 1. 收藏数据与持久化

- [ ] 新建 `src/lib/fileBookmarks.ts`: `BOOKMARK_COLORS`、`BookmarkColor`、`FileBookmark`、`BOOKMARK_COLOR_TEXT`、`normalizeBookmarkPath`、`reconcileFileBookmarks`、`addFileBookmark`、`removeFileBookmark`、`setFileBookmarkColor`、`fileBookmarkName`.
- [ ] 新建 `src/lib/fileBookmarks.test.ts`.
- [ ] 新建 `src/store/fileBookmarks.ts`: `useFileBookmarkStore`, persist key `adb-gui-file-bookmarks`, `version: 1`, `partialize` + `merge`.
- [ ] 新建 `src/store/fileBookmarks.test.ts` (参照 `src/store/ui.test.ts` 的 localStorage 写法).

测试必须覆盖:

- `normalizeBookmarkPath`: 重复斜杠、`.`、`..`、结尾斜杠、根目录; 相对路径、空串、含 NUL、越过根返回 `null`. 与 Rust `normalize_device_path` 的测试用例对齐.
- `reconcileFileBookmarks`: 非数组、元素非对象、缺 `path`、`path` 非字符串、相对路径、未知颜色变 `null`、重复路径保留第一个、合法数据原样返回. 任何输入都不抛异常.
- `addFileBookmark`: 追加到末尾且 `color` 为 `null`; 已存在时返回原引用.
- `removeFileBookmark` / `setFileBookmarkColor`: 不存在的路径返回原引用; 颜色相同返回原引用.
- `fileBookmarkName`: 普通路径、根目录 `/`.
- store: 初始为空; 增删改后从 localStorage 读回一致; 存储里有脏数据时得到协调后的列表; 不读写 `adb-gui-settings` 和 `adb-gui-ui`.

验证: `corepack pnpm test src/lib/fileBookmarks.test.ts src/store/fileBookmarks.test.ts`.

## 2. 起始目录回退逻辑

- [ ] `src/lib/deviceFiles.ts`: 加 `isUnavailableStartDirectoryError`; `DeviceFileManagerState` 加 `startFallback`; 新 action `start-fallback`; `list-start` 加可选 `keepStartFallback`; `reset` 清空.
- [ ] 扩充 `src/lib/deviceFiles.test.ts`.

测试必须覆盖:

- `isUnavailableStartDirectoryError`: `files.notDirectory`、`files.directoryPermission` 为 true; `files.listFailed`、设备类错误码为 false.
- `start-fallback` 在 serial 或 requestId 不匹配时不写入; 写入时不设置 `listError`.
- `list-start` 带 `keepStartFallback` 时保留提示, 不带时清空; `reset` 清空.

验证: `corepack pnpm test src/lib/deviceFiles.test.ts`.

## 3. 色板与文件列表上色

- [ ] `src/index.css`: `@theme static` 与 `.dark` 各加 5 个 `--color-tag-*`.
- [ ] `DeviceFileManager.tsx`: 订阅收藏 store, 建 `Map<path, FileBookmark>`; `DeviceEntryIcon` 加 `bookmarkColor`, 有颜色时实心 + `text-tag-*`.
- [ ] 不改行高 (`estimateSize` 仍为 38), 不改选中行样式.

验证:

- 手动在 localStorage 写入 `adb-gui-file-bookmarks`, 刷新后对应目录图标变为实心彩色; 无色收藏仍是紫色描边.
- 亮暗主题各截一张文件列表, 与 scratchpad 预览图对照.

## 4. 星标、编辑面板、详情面板按钮

- [ ] 新建 `src/hooks/useDismissableLayer.ts`: 外部 `pointerdown` 关闭、Esc 关闭并把焦点还给触发按钮; 写法参照 `WifiConnect.tsx:40-55`.
- [ ] 新建 `src/components/files/BookmarkEditor.tsx`: 色板 `radiogroup`、设为起始目录、取消收藏.
- [ ] 新建 `src/components/files/BookmarkStar.tsx`: `variant: "toolbar" | "details"`; 未收藏点击直接收藏, 已收藏点击弹出 `BookmarkEditor`.
- [ ] `DeviceFileManager.tsx`: 路径栏在复制按钮前插入星标; 详情面板选中目录时插入详情外观的星标按钮.
- [ ] 文案: `tools-zh-CN.ts` / `tools-en.ts` 加 `files.bookmarks.*`.
- [ ] 组件测试 (`renderToStaticMarkup`): 未收藏 / 已收藏无色 / 已收藏有色三种星标的 `aria-pressed`、`aria-label` 和颜色类名; 选中文件时详情面板没有收藏按钮.

验证:

- 进入目录 → 点星标 → 星标实心; 再点 → 面板弹出; 改颜色后列表图标同步; 取消收藏后面板关闭、焦点回到星标.
- Esc、点外部都能关闭面板.
- 设置不可用时 "设为起始目录" 禁用.

## 5. 收藏下拉列表与起始目录回退接入

- [ ] 新建 `src/components/files/BookmarkMenu.tsx`: 触发按钮放在 Home 右边; 浮层用 `dropdownPlacement`; 列表视图 / 编辑视图切换; 空状态; 键盘 方向键 / Home / End / Enter / Esc.
- [ ] 跳转调用 `loadDirectory(onlineSerial, bookmark.path)`, 不带回退; 无在线设备或忙碌时跳转项禁用, 编辑仍可用.
- [ ] `DeviceFileManager.tsx`: `loadDirectory` 增加选项参数; `loadStartDirectory` 传 `fallbackToDefault: startDirectory !== null`; 渲染回退提示条 (带 "设置" 按钮).
- [ ] 文案: `files.deviceFileManager.startDirectoryFallback({ path })`.

验证:

- 收藏 6 条以上, 下拉列表顺序与添加顺序一致; 当前目录高亮; 起始目录项有 Home 图标.
- 把一个收藏设为起始目录, 点 Home 跳到该目录; 设置面板显示该路径.
- 把起始目录设为一个不存在的路径 → 切到文件页: 自动打开下载目录 + 提示条; 设置里的值未变; 点任意目录后提示条消失.
- 手动输入不存在的路径、点不存在的收藏: 显示原错误 + 重试, 不回退.
- 900px 窗口宽度下顶栏不换行, 下拉列表不超出窗口.

## 6. 规范、浏览器冒烟与真机

- [ ] 按 design.md "规范更新" 一节修改三份规范.
- [ ] 运行 `corepack pnpm run test:browser`, 确认现有冒烟不回归; 截图检查亮暗主题、900x600 与 1200x800 下的顶栏、下拉列表、编辑面板、回退提示条.
- [ ] 真机冒烟 (至少一台):
  - USB 连接: 收藏 3 个目录并分别上色 → 重启应用 → 收藏和颜色仍在.
  - 切到无线连接的同一设备 / 另一台设备: 收藏列表相同; 点另一台设备上不存在的收藏 → 错误 + 重试.
  - 设一个只在设备 A 上存在的收藏为起始目录 → 切到设备 B → 自动打开下载目录并提示; 切回 A → 打开该收藏目录.
  - 设置里 "恢复默认" → 收藏仍在, 起始目录回到下载目录.

## 风险与回滚点

- `DeviceFileManager.tsx` (1200+ 行) 是主要风险文件. 新 UI 都放进 `components/files/`, 这里只做接线, 便于审阅和回滚.
- `loadDirectory` / `loadStartDirectory` 的请求过期判断不能被回退逻辑绕过: 回退前必须确认 requestId 仍是最新, 否则快速切换设备时会把旧设备的回退结果写到新设备上.
- 起始目录回退改变了现有规范里的行为, 规范必须和代码同一提交更新.
- 每一步单独提交; 第 5 步的回退接入可以单独回滚而不影响收藏功能.

## 继续实现前需要确认

- 起始目录回退 "只影响这一次打开, 不改设置" 的理解是否正确 (见 prd.md 决定 9).
