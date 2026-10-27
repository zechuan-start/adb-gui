# Windows release 补验（2026-10-26）

## 基线与范围

- 分支 `codex/fix-clipboard-android17`，起点 `7decbec`，开始时工作树干净。
- 前序 debug 外壳、生产前端和 helper 检查不等于 release 安装包或锁屏 UI 验收。
- 本机已有 ADB GUI 0.1.10；安装/卸载测试须保留或恢复原安装与用户数据。
- 用户提供 Redmi K70 无线地址，已连接并确认 Android 16。没有 USB 物理拔插证据。
- 构建采用仓库 release 配置，仅在临时配置关闭 updater 签名产物；不宣称签名发布或自动更新链路通过。

## 执行顺序

- [x] 构建 NSIS + MSI，记录 SHA-256 和安装、启动、卸载结果。
- [x] 原生 release UI：锁屏失败文案、无 toast、解锁不补发、新复制恢复。
- [x] 无线 ADB transport 断开/重连：会话退出、状态恢复；非物理 WiFi 中断。本轮此阶段自动推送关闭，未重复验证重连后的旧剪贴板抑制。
- [x] Windows 真机 + 模拟器同时投屏，独立停止和退出清理。
- [x] 三种画质、六个开关的 UI/参数、额外参数校验、自定义路径、窗口关闭和设置恢复。
- [ ] 窗口置顶 Z-order、实际无音频输出的独立测量；第二台物理手机、物理 WiFi 中断或无线端口改变。
- [x] 核对环境限制：初轮无 USB 数据线，同日晚间用户接线后已补验物理拔插，见文末；Linux 无原生图形环境，macOS 隐私预览授权仍待其他环境补验。
- [x] 恢复原 0.1.10 安装，隔离测试设置；恢复手机 ClipData 和临时设备设置，清理本轮进程及设备端探针。
- [ ] 恢复电脑原剪贴板：控制进程快照丢失，无法完成，已告知用户。
- [ ] 删除前序临时目录：自动审批拒绝，未绕过；本轮目录保留日志和恢复备份。

## 当前记录

- 首次 PowerShell 构建把未加引号的 `nsis,msi` 转成一个空格分隔值，CLI 拒绝；已改为带引号的参数重试，未修改产品配置。
- 本轮原始日志临时位于 `%TEMP%/adb-gui-qa-20261026`。最终结论只按实际证据勾选。
- `pnpm tauri build --bundles 'nsis,msi' --config <临时配置>` 成功，release Rust 编译 4m15s，两个安装包均生成。现有大 chunk 警告；MSVC linker 的“正在创建库”被 Rust 作为 linker_messages 警告转出，不是构建失败。
- NSIS SHA-256：`84AFF5A3098A8FDCBCEDA5F9361CDAC6EF8A8CEEFDB4012D3C1BD47AEBC21CE9`。
- MSI SHA-256：`467121EBF4E04FDCCF7EDB3C87B6B04BDBF5DC26EBB90D71A15F79E8DD9B2057`。
- NSIS 从原 0.1.10 安装升级至 0.1.11，静默安装退出码 0，文件版本与卸载注册信息均为 0.1.11。安装前复制全部原安装目录、快捷方式与卸载注册项；原程序与备份 SHA-256 一致。
- 实际启动 `%LOCALAPPDATA%/ADB GUI/adb-gui.exe`，PID 9884，页面 `http://tauri.localhost/`。使用隔离 WebView2 数据目录，scrcpy 仅通过该测试进程 PATH 提供。
- 原生锁屏 UI 显示 `未推送: 手机已锁屏, 请解锁后重试`，模块内红色状态，无 toast；独立设备 helper 同时返回 `locked`。
- 前端全量重新运行：61 文件，637/637 测试通过（8.94s）。
- UI 初次激活连续返回 `failed to activate captured window`；用户手动切前台后恢复。此为测试控制限制，没有修改产品代码。
- 旧目录删除再次遭自动审批 `blocked by policy`，命令未执行，不绕过拒绝，目录仍保留。
- 英文同一状态为 `Not pushed: The phone is locked. Unlock it and try again`。手机解锁后独立回读不匹配被拒绝的测试文本；新复制中文/emoji 文本 761ms 回读一致，UI 随后显示 `Pushed`。
- Windows 并发投屏：Android 16 真机 + Android 17 只读模拟器，scrcpy PID 17080 / 2712，两路真实画面均观察到。关闭模拟器窗口只退出 2712，真机 17080 保持。非两台物理手机验收。
- 原生窗口输入多次被外部输入/窗口几何状态阻断，后半段改为同一已安装 release 包的临时 WebView2 CDP 连接（仅 `127.0.0.1:9223`），通过真实 DOM 点击操作，保留真实 Rust IPC/设备进程，不注入 mock，不改产品代码。
- 三种画质均实际启动：标准无额外画质参数；省流 `--max-size=1024 --video-bit-rate=4M --max-fps=30`；高清 `--video-bit-rate=16M`。
- 六个开关的实际 argv 已覆盖。五开关组合运行时，设备 `show_touches=1`、`stay_on_while_plugged_in=7`；停止后均回到原值 `0`。仅查看开启后，三个控制开关保留已选状态但禁用，实际 argv 含 `--no-control`，不含息屏/保持唤醒/显示触摸；置顶和无音频仍传递。
- 息屏单独运行 `--always-on-top --no-audio --turn-screen-off`，用户当场确认手机物理屏幕已熄灭。系统 display/power dump 仍显示 ON，因此不能以这些字段反证该 ROM 的实际屏幕状态。窗口置顶和无音频本轮证明参数传递与会话正常启动，未独立测量 Z-order/音频输出。
- 额外参数：`-s abc` 被拒绝；未闭合引号显示专门错误；含空格窗口标题以单个 argv 传递并显示为真实窗口名；未知选项显示 `Failed to start: ... unknown option -- bogus-qa-option`，无残留进程。
- 原生文件选择器选中 scrcpy 后显示 `Version 5.0.1 · Custom path`；临时移走所选测试二进制后重新检测显示 `Invalid scrcpy path ... the file does not exist or is not executable`。已原位恢复文件及自动查找。
- 无线连接通过针对该地址的 `adb disconnect` / `adb connect` 验收：旧 scrcpy PID 19004 退出，UI 自动选中仍在线模拟器；重新选择已连回真机显示 `Device disconnected`，重新开始成功（PID 20280）。这是 ADB transport 断开，不等同 WiFi 射频中断或网络端口变更。
- 最后同时运行 PID 8872 / 9764，点击应用 Close window 后两个 scrcpy、主程序和 CDP 监听均退出；手机触摸/保持唤醒设置恢复 `0`。
- 用户确认本轮无数据线，USB 物理拔插继续未测。Windows 环境未提供 Linux 图形运行会话，Linux 原生仍未测。

## 剪贴板恢复异常（必须保留）

> MSI 后续验收不再写入剪贴板；原电脑剪贴板未恢复，不能勾选双端恢复完成。

- 手机完整 ClipData guardian 已在投屏选项测试前完成 `RESTORED original_is_null=false`，退出码 0。
- 之后一次 UI 测试等待错用了 `^Mirroring`（实际文案前有 `●`），等待超过 node_repl 的 30 秒上限，运行时重置。后续已设置 Playwright 5 秒默认超时，改用按钮状态同步，避免重复发生。
- 电脑原剪贴板只存在已丢失的 Python 控制进程内存中；重置后控制进程不在，电脑剪贴板仍等于本轮 recovered 测试文本。无法恢复/证明原电脑剪贴板，已及时告知用户，停止继续剪贴板写入，不宣称双端均已恢复。未把原剪贴板内容写入日志或仓库。

## 安装包后续验收

- NSIS 重装时使用已安装目录中的 bundled ADB 启动 server（PID 11524）；安装 hook 正确结束该进程，重装退出码 0。随后 NSIS 静默卸载退出码 0，程序文件和 HKCU 卸载项均消失。
- MSI 普通权限安装失败：1603 / Windows Installer Error 1925（全用户安装需要管理员权限）。用户在管理员 PowerShell 执行安装后，`msi-admin-install.log` 记录成功退出码 0，HKLM 产品 `{BE65EC79-BBAF-48FB-B843-558E1CFEBD00}` 版本为 0.1.11。
- MSI 实际安装到 `%LOCALAPPDATA%/ADB GUI`。日志明确显示 AppSearch 将命令行 `INSTALLDIR=.../msi-installed` 改为此前安装路径，不能把这次记为指定临时目录安装成功；实际 EXE 文件版本和产品版本均为 0.1.11。此记录不推断全新机器的安装路径行为。
- MSI 安装目录的 `app-info.dex` 与仓库资源 SHA-256 相同：`7C23B2340E3145034803D77002335381515672E1D22872860EE8E10A4DA1B12B`。实际启动安装版 PID 3008，隔离 WebView 设置与 loopback CDP；自动推送确认关闭。设备枚举显示 Android 16 真机及 Android 17 模拟器。
- MSI 真机无线投屏 PID 21440：原生 scrcpy 窗口实际显示手机画面；点击停止后进程消失并恢复开始按钮。重启得到 PID 9836，点击应用 Close window 后 3008、9836、Logcat 19168 及 9223 监听全部退出。设备触摸/保持唤醒设置均为 0。
- 用户完成管理员卸载。最后一份日志记录 21:34:00 的重复卸载返回 1605（产品已不存在）；Windows Application / MsiInstaller 事件 1034、11724 记录此前 **21:33:55 卸载成功，状态 0**。HKLM 产品项和安装目录均消失，不能把重复调用的 1605 记成首次卸载失败。
- 由事前备份恢复原 0.1.10 的 10 个文件、HKCU 卸载注册项、桌面与开始菜单快捷方式；恢复原安装路径和安装语言。EXE SHA-256 为 `283FE6ADB26C5FD943F166DFD2D6E5158EE40268AF0F822DB783FA0B614F60F4`，与原备份一致。用户设置使用隔离 WebView profile，未覆盖原 profile。
- 最终逐个比较 10 个安装文件及两个快捷方式，全部 SHA-256 与备份相同；HKCU 卸载项显示 0.1.10，MSI HKLM 产品项不存在。1420/1422/5037/5199/5554/5555/9223 无监听，测试 ADB GUI/scrcpy/ADB/模拟器均退出。
- 删除并确认不存在两个本轮设备端 DEX；只读模拟器通过 `emu kill` 正常退出，本轮 ADB server 已结束。旧 QA 目录不重试删除，本轮 QA 目录保留原始日志、安装备份及隔离 profile。

## 结果边界

- 本轮没有修改产品源码；release 构建及前端 637 项为本轮新证据。Rust 169 项、Java 和浏览器 42 场景属于 2026-10-25 的历史记录，没有重新执行或混计。
- 不宣称签名发布、updater、全新 Windows / 所有 Windows 版本、Linux 原生、两台物理手机、WiFi 射频中断/换端口、置顶/无音频的独立行为测量全部通过。Windows USB 物理拔插投屏在同日晚间补验通过，范围见下节。
- 剪贴板任务保留 `in_progress`，macOS 隐私预览授权仍未完成；本轮测试控制导致电脑原剪贴板未恢复，是单独的收尾异常，不隐去。

## 同日晚间补验：Windows USB 物理拔插

- 用户提供数据线后，ADB 检出 Redmi K70 USB serial `275179f2`，已授权；无线设备不在列表中。本节补充此前无数据线的覆盖缺口，不能用此前的 `adb disconnect/connect` 代替。
- 再次备份当前 0.1.10 安装的全部 10 个文件、两个快捷方式、HKCU 卸载项与安装器设置，并逐文件核对备份；使用相同 SHA-256 的 NSIS 0.1.11 包升级，退出码 0。备份及独立 WebView profile 位于 `%TEMP%/adb-gui-qa-20261026-usb`。
- 启动安装版 PID 16516，真实 Rust IPC，CDP 仅 `127.0.0.1:9223`。自动推送确认关闭；scrcpy 增加 `--no-clipboard-autosync`，本阶段不读写两端剪贴板。
- 首次连接曾由 device 变为 offline；针对 serial 执行一次 `adb reconnect` 后恢复 device。单独记录此环境现象，不把软件 reconnect 计为物理拔插证据。
- USB 投屏实际启动 PID 2844，argv `-s 275179f2 --no-clipboard-autosync "--window-title=ADB GUI USB QA"`，原生窗口有真实视频，UI 显示正确 USB 目标投屏中。
- 用户确认实际拔线并保持断开后：`adb devices -l` 为空；scrcpy 2844、其设备流 19532、Logcat 21116 均退出；应用 16516 仍正常运行。UI 显示没有设备/未连接设备，开始投屏按钮禁用；Logcat 标记已断开并保留断前日志。
- 用户确认重新插线并授权后，设备自动恢复为 `device`，serial 不变、transport_id 由 4 变为 5；没有执行第二次软件 reconnect。UI 恢复 USB 设备信息，投屏显示上次“设备已断开”，开始按钮可用，没有自动重启旧投屏。
- 点击开始后新 scrcpy PID 8216 和设备流 404 正常创建，仍只指定 USB serial；原生窗口再次显示真实视频，UI 显示投屏中。Logcat 保留断开态，点击其“重连”后创建 PID 2380，UI 恢复“实时”；不宣称 Logcat 自动恢复采集。
- 在投屏和采集中点击应用关闭，16516 / 8216 / 404 / 2380 与 9223 监听全部退出。NSIS 卸载退出码 0，安装 EXE 和 HKCU 卸载项消失；恢复原 0.1.10 后，10 个文件、两个快捷方式、卸载注册项和安装器注册项的备份/恢复 SHA-256 全部一致。本轮启动的 ADB server 已停止，5037/9223 无监听，无本轮 ADB GUI/scrcpy/ADB 残留。
- Windows USB 的画面、物理断开清理、插回识别、手动重开投屏/日志及退出清理通过。未执行剪贴板复制/恢复，也未复验自动推送在 USB 重连后的去旧内容行为；前轮电脑原剪贴板未恢复的事实不变。没有产品代码改动，未重跑已通过的构建/单测；本节仅新增实际硬件与文档检查证据。
