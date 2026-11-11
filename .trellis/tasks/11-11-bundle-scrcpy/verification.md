# Verification

日期: 2026-11-11. 主机: macOS arm64. 设备: Xiaomi Redmi 2312DRAABC (Android 15), USB, 序列号 `z5rc4hobfelv9tvc`.

## 已验证

### 获取脚本 (`scripts/fetch-scrcpy.mjs`)

- 本机无参数运行: 推断 `aarch64-apple-darwin`, 退出码 0. `src-tauri/resources/scrcpy/` 只有 `.gitkeep` 和白名单 5 个文件, `scrcpy` 保留 0755. 5 个文件的 SHA-256 与官方 `scrcpy-macos-aarch64-v5.0.1.tar.gz` 解压结果一致.
- 四个官方包按 `SHA256SUMS.txt` 校验通过. Windows zip 的文件清单与 Windows 白名单一致.
- 失败路径 (在 scratchpad 的脚本副本中测试, 目标目录预置 `.gitkeep` 和一个哨兵文件):
  - 改错 arm64 的 SHA-256: 退出码 1, 报 checksum mismatch, 目录内容不变.
  - 白名单增加不存在的文件: 退出码 1, 报 release is missing, 目录内容不变.
  - `--target riscv64-unknown-linux-gnu`: 退出码 1, 报 unsupported target.
- 切换目标: 先 `--target x86_64-pc-windows-msvc` (macOS 的 bsdtar 解 zip) 得到 11 个 Windows 文件, 再 `--target x86_64-apple-darwin` 后只剩 macOS x64 的 5 个文件, 无残留. `scrcpy` 为 `Mach-O 64-bit executable x86_64`.
- git: 目录下只有 `.gitkeep` 未被忽略, 其余文件为 ignored.
- 目录只有 `.gitkeep` 时 `cargo check` 通过.

### 自动化检查

- `cargo test --manifest-path src-tauri/Cargo.toml`: 189 passed. 新增查找测试 7 个 (自定义路径优先, 自定义路径无效不回退, 相对路径, 资源目录不可用时自定义路径仍可用, 使用内置版, 内置版缺失, 资源目录失败保留 detail) 和 `ScrcpyInfo` 序列化测试 1 个.
- `cargo fmt --check`, `cargo clippy --all-targets -- -D warnings`: 通过.
- `pnpm test`: 61 个文件, 638 个测试通过. `pnpm build`: 通过.
- `pnpm test:browser`: 通过. 投屏用例覆盖内置缺失, 过旧, 路径无效三种状态在两种语言, 两种主题, 900x600 和 1200x800 下无溢出且无 brew / winget 提示; 设置页显示内置路径和 `版本 5.0.1 · 内置` / `Version 5.0.1 · Bundled`.

### 本机 release 包

构建命令: `CARGO_TARGET_DIR=<scratchpad> CI=true pnpm tauri build --target aarch64-apple-darwin --bundles app,dmg --config '{"bundle":{"createUpdaterArtifacts":false}}'`. 项目树内未产生 `src-tauri/target`.

- `.app` 和 DMG 中 `Contents/Resources/scrcpy/` 都是 `LICENSE`, `disconnected.png`, `scrcpy`, `scrcpy-server`, `scrcpy.png` 加一个 0 字节 `.gitkeep`. 5 个文件 SHA-256 与官方包一致. `scrcpy` 为 arm64 ad-hoc 签名, 权限 0755.
- 包内唯一的 adb 是 `Contents/Resources/macos/adb` (仓库里的 platform-tools 37.0.0), 与官方包 adb 的哈希不同. 包内没有 Windows 或其他架构的文件.

### 内置二进制在包内运行

不经过界面, 直接运行 `ADB GUI.app/Contents/Resources/scrcpy/scrcpy -s z5rc4hobfelv9tvc --no-window --no-audio --no-control --record=<scratchpad>/rec.mp4 --time-limit=4`, `ADB` 指向当前 adb server 所属的 SDK adb, 避免重启用户的 server:

- 推送的是包内的 `Contents/Resources/scrcpy/scrcpy-server`, 证明官方 portable 构建按可执行文件所在目录查找 server, 不需要 `SCRCPY_SERVER_PATH`.
- 录制完成, 退出码 0, 之后 `pgrep scrcpy` 为空, adb server PID 不变.

### 打包应用界面真机验证

第一次申请计算机控制权限被拒绝, 用户要求后重新申请并获批. 应用通过 Finder 的 "文件 > 打开" 启动 (进程父 PID 为 1, 即 LaunchServices). 系统文件选择框无法在后台操作, 选择自定义路径这一步临时使用了全屏控制, 用完即释放.

- 启动环境: Finder 启动的应用 PATH 为 `/usr/bin:/bin:/usr/sbin:/sbin`, 使用包内 adb 37.0.0. 本机 adb server 是 SDK 36.0.0 的 PID 90796, 整个验证过程中 PID 不变.
- 来源: 设置页 scrcpy 行显示包内路径 `.../ADB GUI.app/Contents/Resources/scrcpy/scrcpy` 和 `版本 5.0.1 · 内置`, 说明文字为 "未选择文件时使用内置 scrcpy". 已保存的自定义路径为空. 本机装有 Homebrew 的 `/opt/homebrew/bin/scrcpy`, 应用没有使用它.
- 投屏: 点击开始投屏后, 模块显示 `投屏中 · 2312DRAABC - z5rc4hobfelv9tvc`. scrcpy 进程的命令为包内 `Contents/Resources/scrcpy/scrcpy -s z5rc4hobfelv9tvc --no-audio` (`--no-audio` 来自用户已有的投屏偏好), 父进程是应用. 环境变量 `ADB` 指向包内 `Contents/Resources/macos/adb`, scrcpy 拉起的 adb 也是这个文件.
- Logcat 连续性: 投屏前 Logcat 的最新时间为 15:49:56. 15:50:0x 开始投屏后, 15:50:23 和 15:50:43 都有新行, 其中包括 scrcpy server (设备 PID 12101) 的编码日志. 状态保持实时, 没有断开提示. Logcat 子进程 PID 33524 全程不变, adb server PID 不变.
- 停止: 点停止投屏后 3 秒内 `pgrep scrcpy` 为空. 状态行无报错, 按钮恢复为开始投屏. Logcat 子进程不受影响.
- 无效自定义路径: 选择 scratchpad 中权限为 0644 的假 `scrcpy` 文件. 设置页显示 `scrcpy 路径无效 (<路径>), 文件不存在或不可执行` 并标记已修改. 投屏模块显示同样的错误, 开始按钮不可用, 只提供 "去设置". 包内 scrcpy 当时完好, 应用没有回退到它.
- 恢复默认: 从模块的 "去设置" 进入设置, 点 "恢复使用内置 scrcpy" 后回到包内路径和 `版本 5.0.1 · 内置`, 已修改标记消失. 用户原来的空路径设置已还原.
- 内置文件缺失: 把 `.app` 里的 `scrcpy` 临时移走后点重新检测. 设置页显示 `内置 scrcpy 缺失或不可执行, 请重新安装应用`. 投屏模块显示 `内置 scrcpy 缺失, 请重新安装应用` 和重新检测, 开始按钮不可用. 两处都没有 brew, winget 或安装指引. 文件放回 (SHA-256 复核一致) 后, 用模块的重新检测恢复就绪.
- 关窗: 重新从 Finder 启动应用并开始投屏, 用户手动关闭 scrcpy 窗口. 模块显示灰色的 `已关闭` (不是错误), 开始按钮可用. `pgrep scrcpy` 为空, 设备端没有 scrcpy server, Logcat 子进程仍在运行.
- 拔线: 投屏运行时 (scrcpy PID 34669) 用户拔掉 USB 线. 15:57:01 检查: `pgrep scrcpy` 为空, `adb devices` 为空, 应用的 adb 子进程都已退出, 应用仍在运行. 设备选择器显示没有检测到设备, 投屏模块显示 `未连接设备`, 开始按钮不可用. Logcat 显示 `日志流已断开: 设备已断开` 并保留断开前的日志.
- 插回: 设备重新在线后, 投屏模块显示黄色的 `设备已断开` (拔线时 scrcpy 的退出被记为 disconnected), 开始按钮可用, 没有残留 scrcpy. Logcat 点重连后启动新的子进程, 恢复实时输出.
- 投屏中退出: 投屏运行时 (scrcpy PID 34205) 通过菜单 Quit ADB GUI 退出. 6 秒后 `pgrep scrcpy` 为空, 应用和它的 adb 子进程 (Logcat, 性能流, scrcpy 拉起的 adb) 都已退出, 设备端也没有 scrcpy server 的 `app_process`. SDK 的 adb server 不属于应用, 保持运行, 符合规格.
- 最后退出: 测试结束时 (未投屏) 再次退出应用. `pgrep scrcpy` 和 `pgrep adb-gui` 都为空, 没有包内 adb 进程, 设备仍在线. 被临时移走的包内 `scrcpy` 已放回原位.

## 未验证
- CI 四目标构建, 产物核对, Windows 和 Linux 实机: 按约定等用户同意后在第 7 步进行.

## 备注

- Tauri 按目录映射资源时不过滤隐藏文件, 所以 `.gitkeep` 会作为空文件进入每个安装包. 不影响运行.
- 发布说明需要提醒: 用 Homebrew 等方式安装了 scrcpy 且未设置自定义路径的用户, 升级后改用内置版.
