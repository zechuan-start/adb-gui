# 工具页模块拖拽排序与顺序记忆

## 产品形态

工具页现在以固定顺序陈列九个工具模块, 顺序由 `src/App.tsx` 硬编码. 不同用户的高频工具不同: 做 UI 走查的人最常用截图和录屏, 做联调的人最常用端口转发和 Deep Link. 本任务让用户把常用模块拖到顺手的位置, 并在下次启动时保持该顺序.

这是工具页的布局偏好, 不是新工具, 也不改任何工具自身的业务行为.

## 目标

- 用户可以用鼠标拖动工具模块, 改变它在网格中的先后顺序.
- 顺序持久化到本地, 应用重启后保持.
- 纯键盘用户和读屏用户可以用同等能力完成排序.
- 顺序被改过时可以一键恢复默认.

## P0 范围

- 拖拽入口为模块 header 整条, header 左侧显示抓取手柄图标提示可拖.
- 模块 body 内的按钮、输入框和现有交互不受影响, 不被拖拽吞掉事件.
- 指针位移超过阈值才进入拖拽, 小于阈值视为普通点击.
- 拖拽过程中被拖模块跟随指针, 其余模块实时让位, 展示落点预览.
- 松开提交顺序; `Esc` 或 pointercancel 回滚到拖拽开始时的顺序.
- 拖到工具页滚动区上下边缘时自动滚动, 保证能拖到首尾.
- 手柄可聚焦, `Ctrl/Cmd + ←/→` 前移后移, 通过 aria-live 播报"标题, 第 N 项, 共 M 项".
- 顺序存入 `store/ui.ts` 的 persist 分区, 与 `logHeight` / `activePane` 同级.
- 顺序被修改过时, 工具页顶部出现"恢复默认布局"; 顺序为默认时不出现.
- 读取持久化顺序时做协调: 丢弃已不存在的模块 id, 新增模块按默认位置补回, 去重.
- 新增中英文文案, 两个 catalog 同步.

## 不做

- 不做自由坐标拖拽定位, 模块仍在现有自适应网格中按先后顺序排列.
- 不做单模块宽度调整, `wide` 仍然只属于端口转发且保持硬编码.
- 不做跨页签拖拽, 不改应用页、文件页、生码、解码和性能页布局.
- 不做多套布局预设或布局导入导出.
- 不改任何 Tauri command 的参数与返回值.
- 不改各工具组件内部的业务 state 和 handler.
- 不重新编号模块图号.

## 关键决定

- **图号 `A-01`…`A-09` 保持绑定工具本身, 不随位置重排.** 现状已经如此: `src/App.tsx` 中剪贴板 `A-09` 排在 `A-06` 与 `A-07` 之间, 说明图号是身份标识而非位置序号. 该图号同时作为持久化的稳定 id 来源.
- **顺序存 `store/ui.ts` 而非 `lib/settings.ts`.** 它是布局状态, 与 `logHeight` 同类; 走 `lib/settings.ts` 需要同时改 `SETTINGS_VERSION` 和 `settingsSections.ts` 的 `RESET_PLANS`, 收益不抵成本. 恢复默认因此放在工具页内, 不进设置面板.
- **用 pointer events 而非 HTML5 `draggable`.** 三个原因: 复用 `AppShell.tsx` 已有的 `setPointerCapture` 写法; WKWebView / WebView2 下 HTML5 拖拽的 ghost image 表现不一致; 只有 pointer 路径能把判定逻辑抽成纯状态机, 而项目没有 jsdom, 组件交互无法直接测。
- **不加 `grid-auto-flow: dense`.** dense 会让视觉顺序与存储顺序不一致, 拖拽命中判定随之失真. 宽模块换行留下的空洞由用户自己拖开.

## 验收标准

- [ ] 拖动任一模块 header 可改变顺序, 松开后立即生效.
- [ ] 重启应用后顺序保持; 清空 `adb-gui-ui` 后回到默认顺序.
- [ ] 点击 header 不触发重排; 模块内按钮、输入框和下拉仍可正常操作.
- [ ] 拖拽中按 `Esc` 回到拖拽开始时的顺序, 不留下中间态.
- [ ] 拖到滚动区上下边缘触发自动滚动, 可把模块拖到首位和末位.
- [ ] 手柄聚焦后 `Ctrl/Cmd + ←/→` 可移动模块, 焦点跟随该模块不丢失.
- [ ] 读屏可获得模块标题与当前位次, 移动后有播报.
- [ ] 顺序非默认时"恢复默认布局"可见且可用, 恢复后该入口消失.
- [ ] 持久化数据含未知 id、缺失 id 或重复 id 时, 页面仍渲染全部九个模块且不重复.
- [ ] 顺序变化不触发任何工具的业务副作用, 录屏计时和轮询不被打断.
- [ ] `1200x800` 与 `900x600` 下拖拽落点与视觉一致, 窄窗降列后仍可拖.
- [ ] 亮暗主题下手柄、拖拽中模块和落点提示均可辨.
- [ ] 中英文两个 catalog 结构一致, 组件内无中文字面量.
- [ ] `corepack pnpm test` 与 `corepack pnpm build` 通过.

## 约束

- 遵守 `.trellis/spec/frontend/state-management.md`: 用 selector 订阅具体字段, 不整体订阅 store.
- 遵守 `.trellis/spec/frontend/i18n.md`: 文案只进 catalog, 含 aria-label; `catalog.test.ts` 会卡住组件内的中文字面量.
- 遵守 `.trellis/spec/frontend/quality-guidelines.md`: 禁 `any`, 禁 `document.querySelector`, `<button>` 必须带 `type="button"`, 新增状态转换必须有回归测试.
- 项目无 jsdom 与 testing-library, 组件测试只能走 `renderToStaticMarkup`. 拖拽判定必须落在可单测的纯函数里.
- 持久化读取必须防御性校验, 参照 `store/ui.ts` 现有 `restoreLogOpenByPane` 的写法.
- 不破坏 `ToolModule.test.tsx` 现有的 class 断言.
