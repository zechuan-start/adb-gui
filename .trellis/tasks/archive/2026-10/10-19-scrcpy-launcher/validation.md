# scrcpy 投屏入口验收

> 最新 Windows release 覆盖见文末 2026-10-26 小节；早前“多设备/选项未覆盖”的说明保留为历史状态。

## 2026-10-21 本地验收基线

- 源码: `main`, `dd4bee4`, 测试前工作区干净.
- 主机: macOS 27.0.1 (26A434), arm64.
- 真机: Redmi K70 / Xiaomi 23113RKC6C, Android 16 / API 36, USB, serial `275179f2`.
- scrcpy: Homebrew 5.0.1, `/opt/homebrew/bin/scrcpy`.
- 应用: 0.1.11 release 测试包, `pnpm tauri build --bundles app -c '{"bundle":{"createUpdaterArtifacts":false}}'`, 构建缓存置于 `/Users/qi/.cache/adb-gui-acceptance-target`.
- 安装到 `/Applications/ADB GUI.app`, 本地 ad-hoc 签名后 `codesign --verify --deep --strict` 通过, 通过 LaunchServices `open` 启动.
- 应用可执行文件 SHA-256: `80da99a59a62f78cf9832ab690800c09074b823d79fa65b3ae668742e100c03f`.
- 原应用和 WebKit 设置已备份, 完成验收后恢复原偏好.

## 已验证结果

- 原生启动成功, 设备在线, A-10 开始投屏按钮可用.
- 前端回归: `pnpm test` 61 文件, 637 测试通过; TypeScript / Vite production build 通过.
- macOS release 编译通过, 补上此前云端缺少 Apple SDK 的原生编译证据.
- macOS release 测试 runner: 182 项通过, 0.87 秒, 执行设 60 秒硬超时; `cargo fmt --check` 通过. cargo 二次编译曾触及 60 秒上限, 详情见剪贴板任务验收中的检查命令说明.

| 场景 | 结果与证据 |
| --- | --- |
| 非 shell PATH | 通过 `open --env PATH=/usr/bin:/bin:/usr/sbin:/sbin` 启动; 核对应用进程 PATH, 设置显示 `/opt/homebrew/bin/scrcpy`, 5.0.1, 来源常见位置. |
| 画面和控制 | 用户提供 `ADB GUI acceptance` 窗口截图, 并明确确认有画面且可正常操作. |
| 参数持久化 | 重启后省流, 窗口置顶, 关闭音频和带引号窗口标题均保持. |
| 省流 | 实际 argv 为 `--max-size=1024 --video-bit-rate=4M --max-fps=30`, 并带置顶, 无音频和自定义标题. |
| 标准 | 实际录得 H.264, 1440x3200, 28 帧, 4.035 秒; `--time-limit=4` 正常结束后原生模块显示已关闭, 可重新开始. |
| 高清和仅查看 | 实际 argv 含 `--video-bit-rate=16M --no-control`, 不含息屏/唤醒/触摸三项参数; 三项 UI 禁用但存储勾选保留. 产物 H.264, 1440x3200, 50 帧, 13.476 秒. |
| 息屏/唤醒/触摸 | 关闭仅查看后原勾选恢复可用; 实际 argv 含三项开关. `show_touches=1`, `mStayOn=true`; SurfaceFlinger 的物理 Internal 显示 `powerMode=Off`, scrcpy Virtual Display 为 On. 录得 121 帧, 29.095 秒. |
| 停止及状态恢复 | 模块停止后对应 scrcpy PID 消失, 另一个设备会话继续存活; 息屏结束物理显示恢复 On, `show_touches=0`. |
| adb 与连续采集 | 实际 scrcpy 的 `ADB` 为应用同一路径. 投屏前后的 adb server PID 85268, 原 Logcat PID 178 和 metrics PID 179 均未变; 性能持续更新, 原生 Logcat 查询收到投屏期间的 `mirror-logcat-continuity-20261021` 标记. |
| 双设备 | 真机与模拟器实际同时有两个 scrcpy 子进程 (446 / 998), serial 分别正确; 选择设备后模块显示各自会话. |
| 错误参数 | `--bogus` 真实退出码 1, 模块显示 unrecognized option; `-s abc` 行内报错且模块启动再次拒绝; 未闭合引号行内报错. |
| 旧版本 | 受控 `--version` 探针返回 1.21, 原生设置和模块显示需要 2.0+, 开始按钮禁用. 探针不用于证明真实投屏. |
| 自定义路径错误 | 将受控探针移走后重新检测, 显示文件不存在或不可执行, 不回退到已安装的 Homebrew scrcpy; 恢复自动后正常可用. |
| 直接关闭窗口 | 用户按提示点击 `ADB GUI close test` 红色关闭按钮; 模块显示已关闭, 恢复开始按钮, 核对对应真机 scrcpy 子进程已回收. |
| 传输中断 | 在模拟器会话运行时执行 `adb -s emulator-5554 reconnect device`; 原 scrcpy PID 998 消失, 重新选中该设备后模块显示设备已断开. 录屏产物 H.264, 456x1024, 528 帧, 468.768 秒. |
| 应用退出 | 两个活动 scrcpy 会话和采集进程同时存在时正常 Cmd+Q; 退出后原应用 PID 99714, 两个 scrcpy PID 2156 / 2210, adb 子进程 2191 / 2192 均消失. 逐 PID 检查无残留. |
| 真机物理拔插 | 用户拔掉 USB 并保持断开后, adb 列表为空, scrcpy PID 2659 已回收, 模块禁用开始; 插回后显示上次设备已断开, 可重新开始. |
| 关闭音频 | 所有验收录屏 (标准/高清/息屏/模拟器) 用 ffprobe 核对均只有 video stream, 没有 audio stream. |

## 模拟器环境问题

- 用户的模拟器投屏截图出现 System UI 无响应. `am_anr` 事件确认发生在 10:17:30 冷启动阶段, 原因为 `com.android.systemui` 未及时完成启动; 模拟器投屏于 10:31 才启动. 时间证据排除本次投屏启动触发这次 ANR.
- 模拟器以 `-no-window -no-audio -no-snapshot -read-only` 启动, 不保存本次状态. 返回主页后继续测试; 不把该 ANR 记为本应用故障或跳过不说明.

## 结项范围

- macOS 打包应用 + Redmi K70 USB 真机的必需验收完成, 双设备并发使用 Android 17 只读模拟器补验.
- Windows/Linux 原生运行, 无线投屏和第二台物理手机未覆盖. 未安装分支由既有单测/浏览器冒烟覆盖; 1.21 版本分支使用受控探针, 未安装真实旧版 scrcpy.
- 本轮没有修改产品代码, 不需要新增或改写已有实现契约. 既有跨平台风险和 2026-10-19 的历史验证记录保留.

## 恢复与清理

- 正常退出和异常授权受阻实例的进程均按记录 PID 核对回收. 最终没有本轮 ADB GUI, scrcpy, 模拟器, crashpad/netsimd 或测试采集子进程.
- 原 WebKit 全部 localStorage 与备份逐字节相同; 电脑完整剪贴板和手机原空剪贴板已恢复. 手机三项临时设置恢复为原值.
- 本轮构建缓存, 验收录屏, 探针, 备份和文稿已清理; 两个设备端测试 DEX 已删除. 测试前存在的系统 adb server 保留.
- `/Applications/ADB GUI.app` 保留验收过的 0.1.11 测试版, 签名校验通过, 应用已退出.

## 2026-10-25 Windows + Android 17 模拟器补验

- `main@9465993`, 0.1.11 debug 原生应用 + 本机 Vite 前端, IPC 连接实际 Rust 后端. 使用现有 `ADB_GUI_API_37` 的只读实例, Android 17 / API 37 / Google APIs x86_64 r08, serial `emulator-5554`; Emulator 37.2.12 / build 16428233.
- scrcpy 5.0.1 官方 Windows portable 包, 下载时由 WinGet 验证安装程序哈希. 只解压至本轮临时目录, 通过测试应用的进程 PATH 查找, 未执行系统安装或改用户 PATH.
- 从 A-10 点击开始投屏后, 实际创建 `scrcpy.exe -s emulator-5554` (首轮 PID 20484), 模块显示 `投屏中 · sdk_gphone64_x86_64 - emulator-5554`, 独立 SDL 窗口显示模拟器桌面.
- 通过 scrcpy 窗口执行向上滑动, Android 桌面进入应用抽屉, 核对后续画面确实变化, 验证实际视频和触控链路.
- 在 A-10 点击停止后, PID 20484 消失, 按钮恢复为开始投屏. 投屏期间原生 Logcat 持续更新. 本轮未覆盖多设备、无线、全部画质/选项、应用退出时多会话回收.
- 同一模拟器的剪贴板助手初始化失败另记于剪贴板自动推送任务, 不将投屏可控制误记为该助手兼容性通过.
- 停止后再次启动投屏成功 (PID 21876). 本轮 Windows 基本投屏验收通过, 原任务保持 `completed`; Linux、无线、多设备及全部选项没有新增通过证据.
- 收尾补验: ADB GUI 正常退出后测试投屏进程消失; 模拟器、Vite、本轮 ADB server 及相关采集/辅助进程已回收, 最终无相关进程或测试端口监听. 本轮曾遗漏收尾, 经用户指出后完成进程清理.
- 临时目录删除被自动审批拒绝 (`blocked by policy`), 文件仍保留. 回归数量、已知未修复问题和本机环境保留项详见 [本次 Windows 回归汇总与收尾](../../../10-08-clipboard-auto-push/validation.md#本次-windows-回归汇总与待处理问题). 本轮只补充记录, 未修改产品代码或 DEX.

## 2026-10-25 Windows + Android 16 无线真机补验

- Redmi K70 / 23113RKC6C, Android 16 / API 36, 无线 `192.168.8.10:40213`; scrcpy 5.0.1 portable, 仅修改测试进程 PATH. Rust debug 外壳加载生产前端, 使用隔离 WebView 数据目录.
- A-10 点击开始投屏后创建 scrcpy PID 17048, 实际 argv `-s 192.168.8.10:40213`; 模块显示正确设备的投屏中状态, 独立窗口连续显示手机画面.
- 经 scrcpy `Alt+n` 展开通知栏, 确认实际画面; `Alt+Shift+n` 收起并确认回到原应用. 验证视频和键盘控制, 未更改手机设置或操作通知内容.
- Logcat 进程 7804 在投屏期间持续采集, 界面保留 10000 行并更新. 生产前端约 12 分钟无崩溃; Vite 开发前端另有未修复内存问题, 详见剪贴板任务记录, 不归因为 scrcpy.
- 本轮停止按钮操作因 UI 自动化持续报告外部用户输入而未完成, 没有记为通过; 先前 Windows 模拟器停止/重启证据仍保留. 最后正常退出 ADB GUI PID 9372, scrcpy 17048、Logcat 7804 和全部测试 WebView 子进程均消失, 验证活动无线会话的应用退出回收.
- 当前补验范围为 Windows 无线单机开始/画面/键盘控制/应用退出回收; Linux、无线断开重连、Windows 无线停止重启、多设备及全部选项仍未新增通过证据. 本轮没有修改投屏实现, 原任务保持 `completed`.
- 两端剪贴板已恢复并验证, 三个设备端探针已删, 模拟器/Vite/静态服务/本轮 ADB server 均已停止, 测试端口无监听. 临时目录受前序自动审批删除拒绝影响仍保留, 原 AVD 和补齐 SDK 保留.

## 同日开发环境补齐停止与重启

- 修复 Logcat 开发性能记录内存问题后, 使用 Vite + StrictMode + 原生 Rust + 同一无线真机继续测试. 应用 PID 18588 连续运行约 20 分钟, 未再次 OOM.
- 从模块开始得到 scrcpy PID 13376; 点击停止后该 PID 消失且按钮恢复开始. 再次点击开始得到 PID 21644, 模块显示正确无线设备投屏中, Logcat 持续更新. 前节未完成的 Windows 无线停止/重启现已补齐通过证据.
- 最后正常退出应用, 活动投屏 PID 21644、Logcat、renderer 19232 及相关子进程全部退出. 测试 Vite、诊断接收端和本轮 ADB server 也已停止, 相关端口无监听. 本轮未修改投屏实现.

## 2026-10-26 Windows release 安装包补验

- 使用 `codex/fix-clipboard-android17@7decbec` 的 optimized Rust + production frontend，实际安装 NSIS/MSI 0.1.11；scrcpy 5.0.1 portable 仅加入测试进程 PATH。完整证据见 [Windows release QA](../../../10-08-clipboard-auto-push/research/windows-release-qa-20261026.md)。无投屏代码改动。
- 原生窗口自动化部分受激活/外部输入/几何错误阻断，后半段通过安装版临时 loopback CDP 点击真实 DOM，实际 Rust IPC 与 scrcpy，不使用 mock。

| 场景 | 结果与证据边界 |
| --- | --- |
| 双设备 | Redmi K70 Android 16 无线真机 + Android 17 只读模拟器同时有实际画面；关模拟器投屏仅回收该会话，真机继续。非两台物理手机。 |
| 三画质 | 标准无额外画质 flag；省流 `--max-size=1024 --video-bit-rate=4M --max-fps=30`；高清 `--video-bit-rate=16M`，均实际启动。 |
| 五开关组合 | 置顶、无音频、息屏、保持唤醒、显示触摸均进入实际 argv。`show_touches` 0→1→0，`stay_on_while_plugged_in` 0→7→0。 |
| 仅查看 | 三个控制选项已选状态保留但 UI 禁用；argv 含 `--no-control`，排除息屏/唤醒/触摸，保留置顶/无音频，成功启动。 |
| 物理息屏 | 独立开启息屏，用户确认手机屏幕已熄灭。该 ROM 的 power/display dump 仍显示 ON，不能用该字段单独判定物理屏幕。 |
| 置顶、无音频 | 参数转发和成功启动已验证，Z-order 与实际音频输出没有独立测量。 |
| 参数错误与引号 | `-s abc` 和未闭合引号行内拒绝；含空格标题保持单一 argv 并成为原生窗口标题；未知选项显示真实启动失败详情，无残留。 |
| 自定义路径 | 原生选择器选文件后显示 5.0.1 / Custom path；临时移走测试文件后重新检测报无效路径；已恢复文件和自动查找。 |
| 无线 transport | `adb disconnect 192.168.8.10:40969` 后旧会话退出，UI 自动选在线模拟器；重新连接并选择真机显示断连状态，重新开始成功。非物理 WiFi 中断/新端口。 |
| 退出回收 | NSIS 两活动会话时关闭应用，主程序、两 scrcpy、采集/WebView/CDP 均退出。MSI 单真机会话停止/重启成功，带活动投屏退出同样全部回收。 |
| MSI 安装与卸载 | 管理员安装、启动、枚举、画面、停止/重启及卸载通过；AppSearch 使用原目录。重复卸载日志 1605，系统事件证明此前成功卸载状态 0。 |

初轮因无数据线未测 Windows USB 物理拔插，同日晚间接线后已补验，见下节。第二台物理手机、实际 WiFi 中断/换端口、Linux 原生仍未测；未宣称所有开关实际效果均独立测量。原任务保持 completed，不抹除这些平台覆盖限制。

本轮原 0.1.10 安装已恢复，手机设置和 ClipData 已恢复，测试进程及设备端探针已清理。**电脑原剪贴板因测试控制运行时超时重置丢失内存备份而未恢复**，已告知用户并关闭自动推送。旧临时目录删除仍被自动审批拒绝；本轮日志和原安装备份保留。

### 同日晚间 Windows USB 物理拔插

- 同一 NSIS 0.1.11 安装包，新的隔离 WebView profile，Redmi K70 USB `275179f2`；无无线连接。自动推送关闭，scrcpy 显式禁用 clipboard autosync，本阶段没有剪贴板读写。
- 启动前曾出现 offline，一次针对 serial 的软件 reconnect 后恢复，单独记录不作为拔插证据。首次 USB scrcpy PID 2844，原生真实视频和正确目标状态通过。
- 用户实际拔线并保持断开：设备列表空，2844 / 设备流 19532 / Logcat 21116 全部退出；开始按钮禁用，模块显示未连接设备，应用保持正常。
- 用户实际插回并授权：同 serial 自动在线，transport_id 4→5；模块保留上次断连状态而允许重新开始。新 scrcpy 8216 / 设备流 404 显示真实视频；Logcat 点击重连后 2380 恢复采集，UI 为实时。
- 活动 USB 投屏和采集时关闭应用，主程序/两个子会话/CDP 全退出。NSIS 卸载码 0，原 0.1.10 全部 10 文件、两快捷方式及两份注册快照恢复哈希一致；本轮 ADB server 清理，5037/9223 无监听。
- Windows USB 的物理断开和恢复现已通过。未扩展到长期线材稳定性、所有 USB 驱动/Android 版本或剪贴板重连行为；不改变前轮剪贴板恢复异常记录。无产品代码改动。
