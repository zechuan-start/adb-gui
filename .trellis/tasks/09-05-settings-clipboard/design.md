# 总体设计

## 产品形态

保留现有 1200 x 800 默认窗口和 900 x 600 最小窗口. 设置使用单个弹窗, 剪贴板作为工具工作台中的紧凑工具模块. 不新增顶层工作区, 不显示开发协议或裸命令输入框.

## 分工与边界

| 模块 | 责任 | 主要产物 |
| --- | --- | --- |
| 统一设置 | 设置交互, 偏好唯一归属, 持久化, 启动策略, 截图/录屏行为 | ../09-05-unified-settings/ |
| 手动剪贴板 | 同一 DEX 中的新入口, 安全部署与调用, 文本协议, 当前设备操作 | ../09-05-dex-clipboard/ |
| 总任务 | 范围冻结, 串行集成, 跨任务验收 | 本目录 |

设置先实施. 剪贴板子任务在设置通过后集成, 只在 App.tsx 中增加工具模块, 不改设置存储. 两项技术上可独立验证, 当前分支串行开发.

## 第一版入口

- IndexRail 底部显示设置图标, 打开通用分组.
- Logcat 的视图入口打开同一个弹窗的日志分组.
- 性能页以设置图标打开性能分组, 暂停/继续仍留在工具栏.
- 工具页在快捷按键附近增加剪贴板模块, 显示当前目标设备和两个方向明确的操作.
- 第一版手动剪贴板无持续运行偏好, 不为它创建无效总开关或占位的自动同步设置.

## 数据原则

- 同一项偏好只有一个状态所有者, 设置界面和页面快捷控件读写同一来源.
- 保留现有 theme 和 adb-gui-ui 存储. 新设置存储只容纳此前没有持久化的长期偏好.
- 日志数据, 设备会话, 当前筛选, 暂停状态, 剪贴板正文均不是设置.
- 截图/录屏行为由调用时的设置快照传入 Rust, 后端不再维护独立偏好副本.
- DEX 的定位, 哈希命名和部署共用一个实现. 应用查询与剪贴板分别拥有业务协议和重试规则.

## 兼容与风险

- 保留现有主题, 日志显隐和日志高度, 初次升级不改变默认的自动打开行为.
- 设置重构不得清空日志窗口, 重置 seq 或重启性能会话, 除非用户改变后台采集开关使其应当停止/开始.
- 同一 DEX 保留原 Main 入口和应用信息协议, 新增独立剪贴板入口.
- 新 DEX 必须从仓库 Java 源码重建并随包分发; 不能只改 Java 源码而遗漏二进制.
- shell 包的权限已经探测, Context 调用与厂商兼容仍需真机验证, 不把权限授予等同于读写验证完成.
- 所有正式冒烟使用 Tauri 实际运行时. 浏览器验证布局和交互, 不代替原生剪贴板及 ADB 验收.

## 参考证据

- src/store/theme.ts, src/store/ui.ts: 已有偏好持久化.
- src/components/logcat/LogcatViewMenu.tsx, src/store/logcat.ts: 视图配置与高频运行状态混合.
- src/components/performance/PerformancePanel.tsx, src/hooks/useDeviceMetricsSession.ts: 后台采集控制.
- src-tauri/src/commands/screenshot.rs, screen_record.rs: 当前自动打开行为.
- scripts/build-app-info-dex/build.sh, scripts/build-app-info-dex/src/com/adbgui/appinfo/Main.java: 单 DEX 构建与 app_process.
- src-tauri/src/commands/app_info.rs: 全局助手锁, 部署, 只读重试和应用 JSON 协议.
- 2026-09-05 本轮只读探测: Android 16, cmd clipboard 无 shell 实现, com.android.shell 的 READ_CLIPBOARD_IN_BACKGROUND 为 granted=true.
- [Android 16 ClipboardService](https://github.com/aosp-mirror/platform_frameworks_base/blob/android16-release/services/core/java/com/android/server/clipboard/ClipboardService.java): 包名/UID 校验, 后台读取权限和锁屏限制.
- [scrcpy FakeContext](https://github.com/Genymobile/scrcpy/blob/master/server/src/main/java/com/genymobile/scrcpy/FakeContext.java): shell Context 的实现参考, 不作为运行依赖.
