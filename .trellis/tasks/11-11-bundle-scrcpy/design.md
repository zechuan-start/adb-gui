# Design: 内置 scrcpy

## 不变量

一次投屏使用的 scrcpy 只有两个来源: 用户在设置里明确选择的文件, 或随应用发布的内置文件. 两者之间不存在回退.

## 打包

### 文件来源

二进制不进 git. 原因:

- macOS arm64 和 x64 是不同的二进制. Tauri 的资源配置只按操作系统区分, 不按架构区分, 提交到仓库就要两份都打包.
- 四个目标未压缩共约 75 MB, 每次升级都会永久增加仓库体积.
- 打包发布都在 CI 完成, 构建时获取不增加发布流程的人工步骤.

新增 `scripts/fetch-scrcpy.mjs`:

- 输入 `--target <rust-triple>`, 省略时按本机平台和架构推断. 未支持的目标直接失败.
- 脚本顶部固定版本和四个资源文件的 SHA-256 (来自官方 `SHA256SUMS.txt`).
- 下载到系统临时目录, 校验 SHA-256, 解压.
- 清空 `src-tauri/resources/scrcpy/` 中除 `.gitkeep` 以外的内容, 再按目标的白名单复制文件. 清空是为了切换架构时不残留旧文件. 白名单文件缺失时失败.
- 任何失败都非零退出.
- 用 Node 编写, 三个平台的 runner 共用一套逻辑. Windows 上用 `%SystemRoot%\System32\tar.exe` 解 zip, 因为 PATH 里的 Git tar 不支持 zip.

| 目标 | 白名单 |
| --- | --- |
| macOS, Linux | `scrcpy`, `scrcpy-server`, `scrcpy.png`, `disconnected.png`, `LICENSE` |
| Windows | `scrcpy.exe`, `scrcpy-server`, `scrcpy.png`, `disconnected.png`, `LICENSE.txt`, `SDL3.dll`, `avcodec-63.dll`, `avformat-63.dll`, `avutil-61.dll`, `swresample-7.dll`, `libusb-1.0.dll` |

### Tauri 配置

- `src-tauri/resources/scrcpy/` 用 `.gitkeep` 占位, 目录内其他内容被 `.gitignore` 忽略. Tauri 构建时资源路径不存在会报错, 占位保证未运行脚本时 `cargo` 和 `tauri dev` 仍能构建.
- `tauri.conf.json` 增加 `"resources/scrcpy/": "scrcpy/"`. 四个目标的映射相同, 只写在基础配置里, 文件差异由脚本的白名单决定.

### CI

`release.yml` 的矩阵增加 `target` 字段, 在安装依赖后, `tauri-action` 之前运行 `node scripts/fetch-scrcpy.mjs --target ${{ matrix.target }}`. 脚本失败则该目标失败, `publish-release` 依赖全部 build 成功, 不会发布不完整的版本.

## 运行时

### 查找

`src-tauri/src/commands/mirror.rs`:

- `ScrcpySource` 变为 `Custom | Bundled`.
- 新签名 `locate_scrcpy(custom_path, bundled_path, is_executable)`, 继续注入判断函数以便测试.
- 自定义路径规则不变. 否则检查 `resource_dir()/scrcpy/<scrcpy|scrcpy.exe>` 是否可执行, 是则返回 `Bundled`, 否则返回 `mirror.notFound`.
- `detect_scrcpy` 增加 `AppHandle` 参数. 取资源目录失败时返回 `mirror.notFound` 并带上 detail.
- 删除 PATH 搜索和三个平台的 `known_scrcpy_locations`.
- `mirror.notFound` 错误码保留, 含义变为内置文件缺失.

版本检查保留, 自定义路径仍可能指向过旧版本.

### 官方包的相对路径

官方包是 portable 构建, 二进制中只有裸文件名 `scrcpy-server`, `scrcpy.png`, `disconnected.png`, 运行时从可执行文件所在目录查找. 所以不设置 `SCRCPY_SERVER_PATH` 和图标环境变量, 由实机验证覆盖.

`ADB` 和 `LD_LIBRARY_PATH` 的设置逻辑不变.

## 前端

- `ScrcpySource` 变为 `"custom" | "bundled"`, i18n 的 `sources` 同步.
- 删除 `ScrcpyInstallHints`, `SCRCPY_INSTALL_URL`, `SCRCPY_INSTALL_COMMANDS` 和相关文案.
- `notFound` 状态: 显示内置文件缺失, 提示重新安装, 保留重新检测.
- `tooOld` 现在只会来自自定义路径: 原来显示安装提示的位置改为打开设置和重新检测, 与 `pathInvalid` 一致.
- 设置项说明改为: 未选择文件时使用内置 scrcpy.

## 兼容性

- 已保存的 `mirror.scrcpyPath` 语义不变, 不需要迁移.
- 已用 Homebrew 等方式安装 scrcpy 且未设置自定义路径的用户, 升级后自动切到内置版. 需要写进发布说明.

## 风险

| 风险 | 处理 |
| --- | --- |
| AppImage 设置的 `LD_LIBRARY_PATH` 影响 scrcpy 或 SDL 动态加载的显示库 | Linux 实机验证 AppImage |
| Windows 更新时 `scrcpy.exe` 仍在运行导致文件被占用 | 退出时已有 `shutdown_mirror_sessions`, Windows 实机验证升级路径 |
| 低于 GLIBC 2.35 的 Linux 发行版无法运行内置版 | 与应用自身的最低要求一致. 启动失败时显示版本读取错误, 用户可设置自定义路径 |
| macOS 未公证 | 与现有 `macos/adb` 相同, 官方二进制已 ad-hoc 签名, 实机验证 Finder 启动 |
| FFmpeg, libusb 等组件是 LGPL | 随包分发 scrcpy 的 `LICENSE`. 发布前由项目维护者确认是否需要补充第三方声明 |

## 回滚

回退提交即可, 没有数据迁移. 已保存的自定义路径在旧版本中语义相同.
