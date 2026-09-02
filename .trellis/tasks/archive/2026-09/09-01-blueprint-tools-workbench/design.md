# Blueprint 工具工作台设计

## 页面结构

```text
StatusBanner                     仅异常设备状态显示
DeviceSpecStrip                  在线或可读取详情时显示
┌ A-01 截图 ┐ ┌ A-02 录屏 ┐ ┌ A-03 安装 APK ┐
┌ A-04 Deep Link ┐ ┌ A-05 端口转发, 可跨两列 ┐
┌ A-06 快捷按键 ┐ ┌ A-07 当前应用 ┐ ┌ A-08 Bug Report ┐
```

- 页面内边距 16 px 18 px 24 px.
- 网格 gap 14 px, `repeat(auto-fill, minmax(240px, 1fr))`.
- 宽模块最多跨两列, 主区不足 1012 px 时回到单列跨度.
- 模块 header 使用 7 px 12 px, body 使用 12 px.
- header 图号靠右, 使用弱等宽文字.

## 共享视图壳

新增 `ToolModule` 或等价轻量组件, 只负责:

- `icon`、`title`、`reference`.
- header/body 描边与间距.
- 可选 `wide` 布局标记.

它不读取 device store, 不处理 loading, 不封装业务按钮, 避免形成过度抽象.

## 设备规格条

显示型号、序列号、Android/SDK、ABI、分辨率/密度和电量. 数据来自现有 `getDeviceInfo`.

- 设备切换后立即清除旧详情并加载新 serial.
- loading 使用固定高度 skeleton 或短状态, 不导致页面跳动.
- unauthorized/offline 无法读取详情时只展示列表已有的 model/serial 和状态条, 不伪造其余字段.
- 无设备不渲染规格条.
- 设备信息弹层复用同一 detail state 和刷新动作.

## 工具迁移原则

- 工具组件保留自己的业务 state 和 async handler.
- 只替换最外层 card、header、间距、输入框和按钮 class.
- 原型没有覆盖的 Bug Report 和当前应用仍按同一模块语言迁移, 不删除.
- 图号与模块顺序集中定义在工具页, 不让业务组件各自硬编码导航信息.

## 状态层级

- 页面级设备异常由 `StatusBanner` 说明状态和下一步.
- 模块内 disabled 只表达控件不可操作, 不重复整段异常说明.
- 模块自己的 loading、success、error 保持在当前反馈位置.
- destructive 操作继续使用错误色和确认流程, 不与普通 primary 混淆.

## 响应式

- `1200x800` 主区 1032 px 时目标为三列紧凑布局.
- `900x600` 主区 732 px 时目标为两列, 长表格模块可单列占满.
- 模块标题和按钮文字不得溢出, 技术值允许等宽截断并提供 title.

## 数据边界

- 设备列表状态继续归 `device` store.
- 设备详情增加 serial 绑定的 `detail/loading/error`, 由单一 hook 或 store action 管理.
- 不把规格条显示值复制到 `ui` store.
