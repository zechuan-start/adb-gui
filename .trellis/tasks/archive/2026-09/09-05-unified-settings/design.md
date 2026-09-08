# 统一设置技术设计

## 界面形态

沿用现有工作台和语义颜色. 只增加一个应用级 SettingsDialog, 挂在 App.tsx 根节点. 使用现有 lucide 图标, 普通分组和分隔线, 不增加顶层设置工作区.

~~~text
+ 设置 -------------------------------------------- x +
| 通用 | 日志 | 性能 | 截图与录屏                      |
|                                                     |
| 当前分组中的选项, 说明仅用于必要状态                 |
|                                                     |
| [恢复本组默认]                         [关闭]        |
+-----------------------------------------------------+
~~~

- 弹窗宽度 min(720px, 窗口宽度 - 32px), 高度上限 min(620px, 窗口高度 - 32px), 内容区内部滚动.
- 1200 x 800 和 900 x 600 均显示完整标题栏和底部操作; tabs 可换行, 禁止内容撑出窗口.
- 打开后聚焦当前 tab 或首个可用控件, Tab 焦点锁在弹窗, Escape/关闭返回原触发按钮, 外层内容不可交互.
- IndexRail 底部的主题分段控件移入通用页, 原位置提供 Settings 图标.
- LogcatViewMenu 改为打开统一日志分组的入口, 删除旧弹出层. 工具栏已有换行/折叠快捷按钮保留, 共用设置状态.
- 性能页的后台采集长按钮移入性能分组, 页面以图标跳转该分组; 暂停/继续和即时 CPU/内存排序保留在页面. 进程排序持久化不属于本版.
- SettingsDialog 的 open/section/triggerRef 是非持久化 UI 状态, 不进入设置文件.

## 偏好清单与默认值

| 分组 | 偏好 | 控件 | 首次安装默认值 | 生效点 |
| --- | --- | --- | --- | --- |
| 通用 | 主题 | 系统/亮色/暗色分段 | system | 立即 |
| 通用 | 启动页面 | 恢复上次/六个现有工作区菜单 | 恢复上次 | 下次启动 |
| 通用 | 启动时检查更新 | 开关 | true | 下次启动; 关闭也丢弃正在返回的检查结果 |
| 日志 | 列预设 | 标准/紧凑分段 | STANDARD_COLUMNS | 立即 |
| 日志 | 日期/时间/PID/TID/包名/Tag/等级 | 七个复选框 | 复用 STANDARD_COLUMNS | 立即 |
| 日志 | 自动换行 | 开关 | false | 立即 |
| 日志 | 自动折叠崩溃堆栈 | 开关 | true | 立即 |
| 日志 | 宽行距 | 开关 | false | 立即 |
| 日志 | 各工作区显示日志 | 六个复选框 | 工具/应用/文件 true, 其他 false | 立即 |
| 性能 | 切换页面时继续采集 | 开关 | false | 立即, 遵守手动暂停 |
| 截图与录屏 | 保存截图后打开图片 | 开关 | true | 下一次保存截图 |
| 截图与录屏 | 保存截图后定位目录 | 开关 | true | 下一次保存截图 |
| 截图与录屏 | 保存录屏后打开视频 | 开关 | true | 下一次停止并保存录屏 |

现有主题和日志显隐优先恢复用户值. 日志列预设仅写入列组合, 用 columnsMatch 派生选中状态; 自定义组合不额外存储一个可能失真的 format 值.

## 状态唯一归属

| 所有者 | 字段 | 处理 |
| --- | --- | --- |
| useThemeStore / theme | theme | 保留现有存储和系统主题监听, 设置直接调用它 |
| useUiStore / adb-gui-ui | activePane, logOpenByPane, logHeight | 保留, 设置中的日志显隐直接调用现有 action |
| useSettingsStore / adb-gui-settings | startupPane, checkUpdatesOnStartup, logcat.columns/softWrap/autoFold/cozyRows, performance.backgroundEnabled, screenshot.openAfterSave/revealAfterSave, recording.openAfterSave | 新的版本化 Zustand 偏好存储 |
| useLogcatStore | 日志 ring/index, 会话, seq, follow/anchor/selection, 单次堆栈展开 | 保留运行态, 移除已迁出的长期偏好字段/action |
| useDeviceMetricsStore | 会话, 数据, paused, restartNonce | 保留运行态, backgroundEnabled 的唯一来源改为设置 |

禁止给高频 Logcat/性能 store 直接套 persist, 避免每批数据触发存储写入. 禁止用双向 effect 把同一偏好在两个 store 间同步. 原视图消费者直接订阅 useSettingsStore.

复用 localStorage, 不增加插件或 Rust 设置文件. 将默认值和新存储的 schema 校验集中在 src/lib/settings.ts, 新存储在 src/store/settings.ts. 配置不存在时使用上述默认值; 新版本缺失字段使用定义好的字段默认值. 损坏/不支持版本或写入失败必须显示保存错误, 保留原数据, 不能静默覆盖; 新设置未成功加载时禁用相关动作并提供显式恢复本组/全部新设置的入口. 旧 theme/ui 的存储行为单独保留, 本次不重写无关兼容路径.

## 启动与生效

- 同步读取有效偏好后再初始化依赖启动策略的组件.
- startupPane=last 时沿用 useUiStore 恢复的 activePane. 指定页面时仅在应用冷启动应用一次, 不在设置修改时跳页, 不在 React StrictMode 二次执行时覆盖用户导航.
- 更新检查每次启动最多一次. 关闭时不调用 check; 初始设置读取失败时也不发起检查, 显示配置错误.
- 运行中开启检查开关从下次启动生效, 不意外触发下载. 关闭后使在途检查结果失效, 不中断用户已经主动开始的安装.
- 恢复日志偏好仅改变呈现, 不清空 ring/index, 不变更 nextSeq 和运行状态.
- backgroundEnabled 由 useDeviceMetricsSession 读取, 保留 enabled = online && !paused && (active || backgroundEnabled). 不复制第二套启停逻辑.

## 截图与录屏跨层合约

保留原生保存与打开能力在 Rust, 前端在调用时传入必填行为参数:

~~~ts
takeScreenshot(serial, { openAfterSave, revealAfterSave })
stopScreenRecord({ openAfterSave })
~~~

- lib/tauri.ts 负责字段封装, Rust 使用对应 serde 类型或必填参数. 缺失字段应为合约错误, 不添加后端默认值掩盖漏传.
- 截图点击时捕获参数快照. 返回结果中的 opened/revealed 保留实际执行结果.
- 录屏在停止/自然结束后的统一保存入口捕获当前 openAfterSave, 修改采集中的设置可影响随后的保存. 所有保存调用点使用同一包装函数.
- 保留现有 opened/revealed 返回字段, 前端用请求快照与实际结果区分主动关闭和打开失败. 请求开启但结果为 false 时提示文件已保存但打开失败, 保留文件; 不把主动关闭报为失败.
- 截图主按钮统一使用保存截图, 与自动打开开关一致. 截图并复制保留原行为, 不创建文件, 不调用 opener, 不受两个保存开关影响.
- 不调整录屏时长, 分辨率, 远端清理和保存目录; 不在 UI 新增这些选项.

## UI 状态和反馈

| 场景 | 行为 |
| --- | --- |
| 未连接设备 | 所有设置仍可编辑 |
| 加载有效偏好 | 正常显示, 不闪回默认主题/启动页面 |
| 保存成功 | 控件立即更新, 无逐次 toast 干扰 |
| 存储失败/损坏 | 弹窗顶部或全局错误入口明确显示, 保留原数据, 可重试/显式恢复, 不显示已保存 |
| 恢复本组默认 | 只影响当前组偏好, 不删除日志/图片/应用缓存; 不提供清空全部浏览器存储 |
| 设置改动影响采集 | 当前性能状态随现有控制器更新, 手动暂停仍有效 |
| 关闭弹窗 | 不撤销已成功保存的选择, 焦点归还原入口 |

## 影响文件

新增 src/lib/settings.ts, src/store/settings.ts 和 src/components/settings/ 下的弹窗与分组组件.
调整 App.tsx, IndexRail.tsx, LogcatViewMenu.tsx, LogcatToolbar.tsx, LogcatList.tsx, store/logcat.ts, store/deviceMetrics.ts, useDeviceMetricsSession.ts, PerformancePanel.tsx, UpdateChecker.tsx, Screenshot.tsx, ScreenRecordTool.tsx, lib/tauri.ts, commands/screenshot.rs, commands/screen_record.rs.
theme.ts 和 ui.ts 仅为必要入口复用或启动初始化做最小调整. 现有日志/性能测试随字段归属调整, 保留运行态测试意图.

## spec 同步

更新 frontend/state-management.md 的偏好所有权, frontend/quality-guidelines.md 的设置/启动验收, backend/quality-guidelines.md 的截图与录屏新参数及条件打开行为. 功能行为变更由本次用户需求授权, 不照搬旧 spec 的固定自动打开规则.
