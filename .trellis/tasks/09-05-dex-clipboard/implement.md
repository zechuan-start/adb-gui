# DEX 剪贴板实施清单

## 已完成

- [x] 用户批准实现, 在设置子任务后于 main 分支串行实施, 读取前后端相关规范.
- [x] 确认 JDK/SDK/D8/ADB, 记录原 DEX 哈希, 实际重建全部 Java 源码.
- [x] 同一个 DEX 新增独立剪贴板入口, 保留应用信息入口和原协议.
- [x] 真机验证 shell UID/包名/opPackage/AttributionSource 一致, set/get/readback 成功.
- [x] 真机覆盖中文/多行/CRLF/表情/空白/引号/shell 片段/marker/控制字符/256 KiB/超限.
- [x] 真机验证 locked 拒绝, 未修改权限和锁屏配置.
- [x] 抽取唯一 DEX 部署, 有界全局部署锁, 临时文件 push/chmod444/原子发布, 失败清理.
- [x] stdin JSON/完整行 marker/严格 envelope/有界管道, 设备 8 秒和宿主 10 秒预算, set 不重试.
- [x] Rust 测试覆盖协议/大小/转义/非零退出/超时/部署清理及别名锁.
- [x] 桥接层封装原生文本插件和设备命令, 添加最小 capability.
- [x] ClipboardTool 使用 contextRevision/operationId/同步设备订阅, 点击才读源.
- [x] 控制器测试覆盖 A -> B -> A/断线/授权变化/传输变化/迟到 finally/空值/超限.
- [x] 真实 Tauri 电脑 -> 手机发送后独立 DEX get 比对成功.
- [x] 真实 Tauri 手机 -> 电脑传输后, 电脑原生输入框实际粘贴比对成功.
- [x] 最终包图片剪贴板发送明确失败, 手机目标摘要前后相同.
- [x] 原应用入口返回 227 个应用且剪贴板并发成功, 真机超时退出后无残留 helper.
- [x] 同步 backend/clipboard.md, frontend/settings-clipboard.md 和 resources/README.txt.

## 检查命令

~~~sh
bash -n scripts/build-app-info-dex/build.sh
ANDROID_HOME=/Users/qi/Library/Android/sdk bash scripts/build-app-info-dex/build.sh
test -s src-tauri/resources/app-info.dex
corepack pnpm test
corepack pnpm build
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
~~~

全部通过. 真机样例脚本位于 /Users/qi/.codex/scripts/adb-gui-clipboard-smoke.mjs, 不在测试输出中打印剪贴板正文.

## 验收上限

- [ ] Android 前台输入框实际粘贴未单独完成, 目标值已由 readback 和独立 get 确认.
- [ ] 真实设备切换/断线故障注入, 非主用户/工作资料, 旧 DEX 替换失败, USB/WiFi 别名并发部署未实测.
- [ ] 图标查询完整压力场景和最终包图标逐项比对未执行.
- [ ] Android 旧版本/其他 ROM, Windows/Linux 未实测.
- [ ] 用户要求后再提交/归档.

详细结果与兼容性上限: [总任务验证记录](../09-05-settings-clipboard/validation.md).

## 回滚边界

Java, 打包 DEX, Rust 协议和前端 UI 同步撤回; 保留已有用户缓存和文件. 不安装 APK, 不引入同步监听或模拟输入替代.
