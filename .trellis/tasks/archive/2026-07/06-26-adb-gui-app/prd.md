# ADB GUI - Android 开发测试工具

## 目标

做一个给 Android 开发和测试日常使用的桌面工具 app, 用 GUI 承接高频 ADB 小动作, 减少来回敲命令和找文件的摩擦. 这个产品不是控制台套壳, 也不是以应用列表为中心的管理后台.

## 用户价值

- 测试提 bug 时, 可以一键截图保存到本机固定目录, 并用系统默认图片查看器打开, 方便外部标注和上传.
- 多设备连接时, 工具始终清楚显示当前目标设备, 避免命令打到错设备.
- 需要确认当前页面时, 顶部持续显示当前 Activity, 不把它做成单独页面.
- 高频 adb 能力应该变成按钮, 表单和快捷动作, 而不是要求用户记命令.
- 文本传递本轮暂缓, 先把截图, APK 安装, 快捷按键和当前应用动作做实.

## 已确认事实

- 目标平台: macOS + Windows. Linux 不进入 MVP.
- 用户: Android 开发者和测试工程师.
- 技术栈: Tauri v2 + React + TypeScript 前端, Rust 后端调用 adb.
- adb 路径: 优先系统 adb, 其次 Android SDK `platform-tools`, 最后才使用 app 内嵌 platform-tools.
- 产品形态: 桌面工具型 app, 首屏应该是可操作工作台, 不是左侧控制台导航.
- 当前截图里的侧边栏方案不符合产品定位, 需要移除或重构.
- App 列表不是核心工作流, 只是附属能力, P0 可以不做完整应用列表.
- 截图功能只负责保存和打开外部预览, 不做内置图片预览器.
- 文本传递本轮不纳入验收, 原设计仅作后续参考.
- 已检查本机 adb 36.0.0 能力: `devices`, `connect/pair`, `forward/reverse`, `push/pull`, `install/uninstall`, `logcat`, `bugreport`, `shell input`, `shell am`, `shell pm`, `shell wm`, `shell settings`, `screenrecord`, `dumpsys battery` 等都可被 GUI 化, 但必须按使用频率和风险分层.

## 需求

### P0 - 最小可用版本

- 设备上下文:
  - 顶部显示已连接设备列表, 支持刷新和切换目标设备.
  - 无设备, 多设备, unauthorized, offline 等状态必须明确展示.
  - 顶部显示当前 Activity 和 adb 来源/版本, 作为上下文信息, 不占用主工作区.
- 主工作区:
  - 默认显示“常用工具”工作台, 采用横向工具区或顶部 tab/segmented control, 禁止左侧侧边栏.
- 首屏优先呈现截图等高频动作.
  - UI 密度应像桌面工具, 不是命令行控制台, 也不是营销页.
- 截图保存:
  - 一键对选中设备截图.
  - 保存到本机固定目录, 文件名包含设备标识和时间戳.
  - 截图成功后用系统默认外部图片查看器打开.
  - 界面显示保存路径, 并提供复制路径或在 Finder/Explorer 中显示的入口.
  - 不做内置截图预览, 不做图片编辑或标注.
-- 文本快速传递:
  - 本轮不纳入实现范围, 后续若恢复需另行确认输入法/非 ASCII 传递策略.
- APK 安装:
  - 支持选择 APK 文件安装到当前设备.
  - 支持拖拽 APK 到窗口安装.
  - 显示安装结果和失败原因.
  - 不要求 P0 展示完整 app 列表.
- 当前 Activity:
  - 以顶部状态形式展示当前 Activity.
  - 支持手动刷新, 可选后台轻量轮询.
  - 用于开发定位页面, 不设计成独立大模块.
- 快捷设备控制:
  - 提供返回, 主页, 最近任务, 回车, 电源等常用按键按钮.
  - 支持一键唤醒/熄屏和返回桌面.
  - 基于 `adb shell input keyevent`, 属于低风险高频能力, 可放入 P0 工具区.
- 当前包快捷动作:
  - 从当前 Activity 推导当前包名.
  - 对当前包提供强停, 清数据/缓存, 启动, 卸载等快捷动作.
  - 清数据和卸载必须二次确认.
  - 不依赖完整 app 列表.
- 更新检测:
  - 启动后可检查新版本.
  - 有新版本时提示用户, 不阻塞主要工具使用.

### P1 - 下一版

#### P1-1: Logcat 快速查看

- 功能:
  - 独立 tab ("日志"), 实时流式展示 logcat 输出.
  - 支持按 level (V/D/I/W/E/F) 过滤, 支持关键字搜索.
  - 可选按当前选中包名过滤 (`--pid` 或 grep).
  - 支持暂停/恢复滚动, 手动清屏.
  - 使用虚拟滚动 (`@tanstack/react-virtual`) 处理大量日志行.
- 技术:
  - 后端: `adb -s <serial> logcat -v brief` 通过 Tauri event (`logcat-line`) 流式推送.
  - 前端: 环形缓冲区保留最近 N 条 (建议 5000), 超出丢弃最早的.
  - 已有 `commands/logcat.rs` 骨架和 `LogcatLine` 类型定义.
- UI:
  - Tab 内全屏面板, 顶部工具栏: level 选择器 + 搜索框 + 暂停按钮 + 清屏按钮.
  - 日志行按 level 着色 (E=red, W=amber, I=blue, D=gray, V=slate).
  - 不把 logcat 做成首页默认 tab.
- 验收:
  - [ ] 切换到日志 tab 后自动开始接收 logcat.
  - [ ] 可按 level 过滤, 可按关键字搜索.
  - [ ] 5000+ 行不卡顿 (虚拟滚动).
  - [ ] 切换设备或离开 tab 时正确停止 logcat 进程.
  - [ ] 暂停时不丢数据, 恢复后滚动到最新.

#### P1-2: 录屏

- 功能:
  - 一键开始录屏, 再次点击停止.
  - 保存到本机 `~/Pictures/ADB GUI/` (同截图目录), 文件名含设备标识和时间戳.
  - 录屏完成后用系统默认播放器打开.
  - 支持 `--bugreport` 参数 (在视频上叠加时间戳).
  - 最大时长限制: 默认 180 秒, 到时自动停止.
- 技术:
  - `adb shell screenrecord /sdcard/xxx.mp4` 开始, `kill` PID 或 Ctrl+C 停止.
  - 停止后 `adb pull` 到本机, 删除设备上临时文件.
- UI:
  - 在工具 tab 截图卡片下方或旁边, 紧凑卡片.
  - 录屏中显示经过时间, 按钮变为红色 "停止录屏".
- 验收:
  - [ ] 点击开始录屏, 设备开始录制, UI 显示计时.
  - [ ] 点击停止或超时后, 文件 pull 到本机并打开.
  - [ ] 录屏过程中切换设备应警告并停止当前录屏.

#### P1-3: Bug 资料收集

- 功能:
  - 一键收集: 截图 + 当前 Activity + 设备基本信息 + 最近 50 行 logcat.
  - 打包为一个目录或 zip, 保存到本机.
  - 可选: 导出完整 bugreport (`adb bugreport`).
- 技术:
  - 组合已有 API: `take_screenshot` + `get_current_activity` + device props + logcat buffer.
  - bugreport 生成慢 (30s+), 需要进度提示.
- UI:
  - 工具 tab 新增 "Bug 报告" 卡片, 两个按钮: "快速收集" / "完整 Bugreport".
- 验收:
  - [ ] 快速收集生成目录, 包含截图 + info.txt + logcat.txt.
  - [ ] 完整 bugreport 显示进度, 完成后 reveal 文件.
  - [ ] 无设备时按钮禁用.

#### P1-4: WiFi 调试连接

- 功能:
  - Pair: 输入设备 IP:port + pairing code, 执行 `adb pair`.
  - Connect: 输入设备 IP:port, 执行 `adb connect`.
  - Disconnect: 对已连接的 WiFi 设备执行 `adb disconnect`.
  - 已连接的 WiFi 设备在设备列表中正常显示.
- 技术:
  - `adb pair <addr> <code>` (Android 11+).
  - `adb connect <addr>`.
  - `adb disconnect <addr>`.
- UI:
  - 工具 tab 或顶栏设备选择旁边的 "WiFi 连接" 按钮, 弹出 modal/popover.
  - 表单: IP 地址 + 端口 + 配对码 (可选).
  - 显示当前 WiFi 已连接设备列表和断开按钮.
- 验收:
  - [ ] 可通过 pair + connect 连接 WiFi 设备.
  - [ ] 连接后设备出现在设备列表中.
  - [ ] 可断开指定 WiFi 设备.
  - [ ] 连接失败显示 adb 错误信息.

#### P1-5: Deep Link / Intent 启动

- 功能:
  - 输入 URL (scheme://...) 或 component (pkg/activity), 一键 `am start`.
  - 常用 Deep Link 可保存为模板, 快速重发.
  - 支持附加 extras (key=value 简单形式).
- 技术:
  - URL: `adb shell am start -a android.intent.action.VIEW -d "<url>"`.
  - Component: `adb shell am start -n "<pkg>/<activity>"`.
  - Extras: `-e key value` / `--ei key int` 等.
- UI:
  - 工具 tab "Deep Link" 卡片: 输入框 + 发送按钮.
  - 下拉切换模式: URL / Component / 自定义 Intent.
  - 保存的模板列表 (localStorage 持久化).
- 验收:
  - [ ] 输入 URL 并发送, 设备打开对应页面.
  - [ ] 输入 component 并发送, 设备启动对应 Activity.
  - [ ] 可保存/删除常用 deep link 模板.

#### P1-6: 端口转发

- 功能:
  - 新增 forward 规则: `adb forward tcp:<local> tcp:<remote>`.
  - 新增 reverse 规则: `adb reverse tcp:<remote> tcp:<local>`.
  - 查看当前所有 forward/reverse 规则.
  - 删除指定规则.
- 技术:
  - `adb forward --list`, `adb reverse --list`.
  - `adb forward tcp:X tcp:Y`, `adb forward --remove tcp:X`.
- UI:
  - 工具 tab "端口转发" 卡片.
  - 当前规则列表 (表格: 方向, 本机端口, 设备端口, 删除按钮).
  - 新增表单: 方向选择 (forward/reverse) + 两个端口输入 + 添加按钮.
- 验收:
  - [ ] 可新增 forward 和 reverse 规则.
  - [ ] 列表正确展示当前设备的所有规则.
  - [ ] 可删除单条规则.
  - [ ] 切换设备时刷新规则列表.

#### P1-7: 设备信息面板

- 功能:
  - 只读展示: 型号, Android 版本, SDK level, ABI, 分辨率, 密度, 电量, 总存储/可用存储.
  - 点击可复制单项信息.
- 技术:
  - `adb shell getprop ro.product.model` 等.
  - `adb shell wm size`, `adb shell wm density`.
  - `adb shell dumpsys battery`.
  - `adb shell df /data`.
- UI:
  - 设备选择下拉旁的 "设备信息" 按钮, 点击弹出 popover 或 drawer.
  - 紧凑 key-value 列表, 每行末尾有复制图标.
- 验收:
  - [ ] 选中在线设备时可查看设备信息.
  - [ ] 信息包含至少: 型号, Android 版本, 分辨率, 电量.
  - [ ] 可复制单项值.

#### P1-8: 应用辅助管理

- 功能:
  - "应用" tab 提供包名输入框, 对指定包名执行: 安装, 启动, 强停, 清数据, 卸载.
  - 可选: 列出已安装包名 (懒加载, 支持搜索过滤).
- 技术:
  - `adb shell pm list packages` (首次加载可能较慢).
  - 操作复用已有 `commands/app.rs`.
- UI:
  - "应用" tab 主体: 包名输入/搜索 + 操作按钮组.
  - 可选应用列表使用虚拟滚动.
  - 清数据/卸载需二次确认 (同 P0 当前包动作).
- 验收:
  - [ ] 输入包名可执行各项操作.
  - [ ] 可选列表: 加载不卡顿, 支持过滤搜索.
  - [ ] 清数据/卸载有确认弹窗.

#### P1-9: 截图历史

- 功能:
  - 工具 tab 截图卡片下方展示最近 N 张截图路径列表.
  - 点击: 用系统默认查看器打开.
  - 仍然不做内置预览.
- 技术:
  - 读取截图目录 (`~/Pictures/ADB GUI/`) 文件列表, 按修改时间排序.
  - 或: 前端维护 session 内截图路径数组.
- UI:
  - 截图卡片底部折叠面板, 默认展开最近 5 条.
- 验收:
  - [ ] 截图后列表自动更新.
  - [ ] 点击路径可打开文件.
  - [ ] 列表不超过 20 条 (超出隐藏).

#### P1-10: 文本模板

- 功能:
  - 保存常用文本片段 (如测试账号, 地址, URL).
  - 点击模板将文本通过 `adb shell input text` 发送到设备.
  - 支持新增, 编辑, 删除模板.
- 技术:
  - 文本传递: `adb shell input text "<encoded>"` (需 URL encode 空格和特殊字符).
  - 非 ASCII (中文等): 需要 ADBKeyboard 或 `am broadcast` 方案, 标注为已知限制.
  - 模板持久化: localStorage 或 Tauri app config file.
- UI:
  - 工具 tab "文本模板" 卡片.
  - 模板列表 + 新增按钮 + 发送按钮.
  - 提示: 非 ASCII 字符可能需要安装 ADBKeyboard.
- 验收:
  - [ ] 可新增/编辑/删除文本模板.
  - [ ] 点击发送, ASCII 文本正确输入到设备当前焦点.
  - [ ] 非 ASCII 输入提供降级提示.

---

#### P1 优先级排序 (建议实现顺序)

1. **P1-1 Logcat** — 骨架已有, 用户价值最高.
2. **P1-7 设备信息** — 实现简单, 只读查询.
3. **P1-8 应用管理** — 复用已有 commands.
4. **P1-5 Deep Link** — 开发者高频需求.
5. **P1-6 端口转发** — 开发调试刚需.
6. **P1-4 WiFi 连接** — 无线调试越来越普及.
7. **P1-2 录屏** — 中等复杂度.
8. **P1-9 截图历史** — 简单增强.
9. **P1-10 文本模板** — 有已知限制, 可延后.
10. **P1-3 Bug 收集** — 组合功能, 依赖其他 P1 能力.

### P2 - 后续按需

- 文件 push/pull.
- 交互式 adb shell.
- 完整应用列表, 包名搜索和批量操作.
- 运行 instrumentation test.
- JDWP 进程查看.
- heap dump / profiler.
- 修改分辨率, 密度, 动画速度, 系统设置.
- root/remount/reboot/verity 等危险设备维护命令.

## ADB 功能筛选原则

- 直接进 P0:
  - 高频, 低风险, 点击即完成, 不需要用户理解 adb 参数.
  - 例: 截图, APK 安装, 当前 Activity, 返回/主页/最近任务, 当前包强停.
- 进 P1:
  - 高频但需要配置, 状态管理或长任务.
  - 例: Logcat, 录屏, bugreport, WiFi pair/connect, 端口转发, Deep Link, 设备信息.
- 进 P2:
  - 专业调试, 低频, 容易让界面变重.
  - 例: 文件管理, 完整 app 列表, shell, instrumentation, heap/profile.
- 进入危险区:
  - 会改变设备系统状态, 清数据, 重启, root/remount 或影响全局设置.
  - 必须二次确认, 说明 adb 命令和影响范围, 默认不放首屏.

## 体验要求

- 禁止把 P0 做成左侧导航 + 模块切换的控制台布局.
- 推荐结构:
  - 顶部: 设备选择, 刷新, 当前 Activity, adb 状态.
  - 主区: 常用工具工作台.
  - 工具区: 截图, APK 安装, 快捷按键, 当前应用动作, 以紧凑卡片或 tab 呈现.
  - 次级区: 最近操作结果和错误提示.
- App list 默认不展示; 如保留, 必须放到 P1/P2 的辅助区域, 不能抢占首屏.
- 文本传递本轮不做, 不进入首屏或辅助入口.
- 所有操作必须清楚反馈目标设备, 成功结果和失败原因.
- 命令能力应包装成人能理解的动作名, 例如“返回”, “截图并打开”, “清当前应用数据”, 而不是裸露 `adb shell ...`.

## P0 验收标准

- [ ] macOS 和 Windows 均可构建并运行.
- [ ] 启动后能检测 adb 来源和版本, 并在顶部展示.
- [ ] 能列出并切换 USB/WiFi 连接设备, unauthorized/offline 状态明确可见.
- [ ] 首页不是左侧侧边栏导航, 默认是工具型工作台.
- [ ] 当前 Activity 在顶部或状态区可见, 不作为独立页面.
- [ ] 点击截图后保存 PNG 到本机固定目录, 并用系统默认图片查看器打开.
- [ ] 截图结果展示保存路径, 可复制路径或在文件管理器中显示.
- [ ] 可选择或拖拽 APK 安装到当前设备, 并展示 adb 返回结果.
- [ ] 可点击返回/主页/最近任务/回车等常用设备按键.
- [ ] 可对当前包执行强停; 清数据/卸载有二次确认.
- [ ] P0 不要求完整 app 列表; 如果实现 app list, 只能作为非默认辅助入口.
- [ ] 检测到新版本时提示, 不影响用户继续使用主要功能.

## P0 不做范围

- 内置截图预览, 图片标注, 图片编辑.
- 完整 app 列表作为首屏或核心模块.
- Logcat 作为默认首页.
- 交互式 shell 控制台.
- 文件管理器式 push/pull.
- 文本传递和文本模板, 本轮暂缓.
- Linux 支持.
- 自动化测试脚本录制/回放.
- root/remount/reboot/verity 等设备维护命令作为普通按钮暴露.

## 待确认问题

- P0 是否保留 Logcat 快速查看入口? 推荐: 暂时移到 P1, 先把截图, APK 安装和设备上下文做好.
- P0 是否加入快捷按键和当前应用动作? 推荐: 加入, 因为它们把 `input keyevent` 和当前包 `am force-stop/pm clear` 变成高频便捷按钮, 不需要完整 app 列表.
