# 继续执行前核对

## 当前结论

- 2026-09-05 用户要求查看当前任务并开始执行, 允许直接使用 Android Studio 模拟器.
- 当前指针为 capture-directory-settings, 状态 planning. 父任务 implement.md 明确创建顺序导致指针落在第二子任务, 正确执行入口为 browsing-codegen-settings.
- 前置任务仍为 planning, 无独立验收结果. 当前 src/lib/settings.ts 只有第一批偏好, 尚无 files/apps/codegen 或 capture.directory 字段.
- 本轮阶段指令要求保持 planning 并在 task.py start 前审阅方案. 本轮完成可用环境检查和方案更新, 未启动任务、修改业务代码或执行功能验收.
- main 分支已有 55 项未提交改动. 保留已有修改, 仅追加当前任务的规划记录, 用户要求后再提交.

## 已确认代码问题

- src-tauri/src/commands/screenshot.rs 与 screen_record.rs 各自解析 Pictures/ADB GUI, 均含 /tmp 回落.
- screen_record.rs:98 在停止和保存之前 lock.take() 移除会话, 后续失败无法继续恢复.
- screen_record.rs:105 发起 pull, :110 随即删除设备源文件, :120 才检查 pull 是否失败, :122 才检查本机大小. 必须重排为本机校验与发布成功后清理源, 并保留失败会话.
- ScreenRecordTool.tsx 通过 pending_pull effect 自动结束, 新 save_failed 状态必须避免再次触发自动保存. 控制器和 Rust 会话 ID 共同约束迟到操作.

## 模拟器环境实测

| 项目 | 2026-09-05 实际结果 |
| --- | --- |
| 已有 AVD | Pixel_10, 检查时未启动, 已启动并保留运行 |
| 启动方式 | 现有 SDK emulator -avd Pixel_10 -no-snapshot-save, 未擦除数据或修改 AVD 配置 |
| ADB | /Users/qi/Library/Android/sdk/platform-tools/adb |
| 设备 | emulator-5554, device, sdk_gphone16k_arm64 |
| 系统 | Android 17, SDK 37, sys.boot_completed=1 |
| 截图 | exec-out screencap -p 成功, 1080 x 2424 PNG, 已目视检查桌面图像非空 |
| 录屏 | screenrecord --bugreport --time-limit 3 成功退出 |
| 拉取 | 设备和本机大小均为 164732 字节 |
| 媒体检查 | ffprobe: H.264, 1080 x 2424, 媒体时长 0.598 秒; 不将 3 秒命令上限记为成片时长 |
| 解码 | ffmpeg -v error -i emulator-baseline.mp4 -f null - 成功, 无解码错误 |
| 清理 | 验证后仅删除本轮创建的 /sdcard/adb_gui_plan_MFXjN9.mp4, 不处理其他设备文件 |

本机基线产物: /tmp/adb-gui-capture-plan.MFXjN9/emulator-baseline.png 与 emulator-baseline.mp4. 临时产物可能随系统清理消失, 以上记录保留实际结果.

## 后续执行顺序与检查上限

1. 完成文件/应用/生码偏好子任务及独立验收, 再启动本子任务.
2. 先实现共享目录解析和录屏失败保留状态, 再接设置 UI 与截图/录屏消费者.
3. 用同一原生 Tauri 包在模拟器演练目录失效、源文件保留、手动重试/另存为、取消/放弃、成功后源清理.
4. 按 implement.md 完成前端、Rust、构建与界面检查, 独立记录实际覆盖范围.

本轮 ADB 基线只证明模拟器可用于后续检查. 新目录选择、设置重启保留、失败恢复、Tauri UI、原生对话框和浏览器验证均未执行, 不报告为通过. 真实手机 ROM、第二台设备以及 Windows/Linux 未覆盖.
