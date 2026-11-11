# 内置 scrcpy 投屏依赖到各平台安装包

## Goal

用户安装 ADB GUI 后不需要再单独安装 scrcpy, 打开投屏工具即可使用. 每个安装包只带本平台, 本架构需要的 scrcpy 文件, 延续 adb 按平台打包的做法.

## Confirmed Facts

- 投屏第一阶段只查找用户自己安装的 scrcpy. `.trellis/spec/backend/mirror.md` 中 "不内置" 只是第一阶段范围, 本任务要更新它.
- 打包和发布都在 GitHub CI (`.github/workflows/release.yml`) 完成, 矩阵为 macOS arm64, macOS x64, Windows x64, Linux x64, 每个目标单独构建.
- 官方 v5.0.1 发布包提供以上全部四个目标, 已校验 SHA-256.
- 官方包自带 adb. 应用通过 `ADB` 环境变量让 scrcpy 使用应用自己的 adb, 所以不打包官方包里的 adb.
- Linux 的官方 scrcpy 需要 GLIBC 2.35, 与 CI 使用的 ubuntu-22.04 一致.

## 体积增量 (实测或按压缩后大小计算)

| 目标 | 安装包增量 | 安装后增量 |
| --- | --- | --- |
| macOS arm64 | +4.4 MB | +10.3 MB |
| macOS x64 | 约 +5.4 MB | 约 +13.8 MB |
| Windows x64 | 约 +7.2 MB | 约 +17.8 MB |
| Linux x64 | 约 +13.5 MB | 约 +35.1 MB |

## Requirements

- 四个发布目标都内置 scrcpy 5.0.1: macOS arm64, macOS x64, Windows x64, Linux x64. 每个安装包只带自己目标的文件, 不带官方包里的 adb.
- 没有设置自定义路径时, 应用只使用内置 scrcpy, 不再查找 PATH 和常见安装位置.
- 设置里的自定义路径保留, 优先级最高, 路径无效时明确报错, 不回退到内置版.
- 投屏时 scrcpy 继续使用应用自己的 adb, 不影响 Logcat 和性能监控的连接.
- 设置页显示当前使用的 scrcpy 路径, 版本, 以及来源 (内置或自定义路径).
- 内置 scrcpy 缺失或不可执行时明确报错, 提示重新安装应用. 删除让用户自行安装 scrcpy 的提示.
- 用户已保存的自定义路径和投屏偏好继续有效.
- 内置的 scrcpy 文件来自官方发布包, 版本和 SHA-256 固定, 校验失败时 CI 构建失败, 不产出安装包.
- 随安装包分发 scrcpy 的许可证文件.
- 不把 scrcpy 二进制提交到 git 仓库. 本地开发运行一次获取脚本后即可使用内置版.

## Acceptance Criteria

- [ ] `Package` 工作流四个目标全部构建成功.
- [ ] 四个目标的安装包都带齐运行 scrcpy 所需的文件, 文件 SHA-256 与官方包一致, 且不带其他目标的文件和官方包里的 adb.
- [ ] 校验和不匹配或必需文件缺失时, 获取脚本非零退出, CI 构建失败.
- [ ] 未安装系统 scrcpy 的 macOS 上, 从 Finder 启动打包后的应用, 设置页显示来源为内置, 能投屏一台真实设备.
- [ ] 投屏期间 Logcat 持续输出, 没有 adb server 重启. 停止投屏, 关闭窗口, 拔线, 退出应用后没有残留 scrcpy 进程.
- [ ] 设置无效的自定义路径时显示路径错误, 不使用内置版. 恢复默认后回到内置版.
- [ ] 内置文件缺失时投屏工具和设置页显示明确错误, 界面上没有安装 scrcpy 的提示.
- [ ] Rust 单元测试, 前端单元测试, 类型检查, clippy 和 `pnpm test:browser` 全部通过.
- [ ] `.trellis/spec/backend/mirror.md` 与实现一致.
- [ ] Windows 和 Linux 实机验证结果记录在任务中, 未验证的项目要明确标注.

## Out of Scope

- 把 mac 的 adb 裁成单架构, 这是独立的体积优化.
- 修改或重新编译官方 scrcpy 二进制.
- 应用内更新 scrcpy, 版本随应用发布更新.
- macOS 公证和 Developer ID 签名.

## Open Questions

无.
