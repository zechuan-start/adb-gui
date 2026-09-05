# 统一设置实施清单

## 已完成

- [x] 用户批准实现, 读取相关规范并在当前 main 分支串行实施.
- [x] 建立版本化设置 schema 和唯一存储, 保留原 theme/ui 所有权.
- [x] 明确配置损坏/写入失败, 提供显式恢复, 保留原数据和最后有效值.
- [x] 从日志和性能运行态迁出长期偏好, 更新所有消费者, 列预设由 columns 派生.
- [x] 统一侧栏/日志/性能设置入口, 保留共用 action 的日志快捷按钮.
- [x] 完成弹窗分组, 首尾焦点循环, Escape 和入口焦点恢复.
- [x] render 前应用启动页, StrictMode 共用更新请求, 关闭使当前启动检查永久失效.
- [x] 截图/录屏所有调用传必填行为快照, 区分保存成功与外部打开失败.
- [x] 覆盖存储重载/损坏/失败/恢复, 日志运行态隔离, 启动检查及 opener 组合测试.
- [x] Browser 实际验证双尺寸/双主题, 指定与恢复上次启动页, 键盘操作.
- [x] 原生偏好跨重启检查, 截图四组合, 截图复制, 录屏关闭自动打开和自然结束自动打开.
- [x] 更新 frontend/settings-clipboard.md 和 backend/quality-guidelines.md 合约.
- [x] 构建并通过 LaunchServices 启动最终调试包, 恢复测试改动的默认开关.

## 检查命令

~~~sh
corepack pnpm test
corepack pnpm build
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
~~~

所有命令通过. 最后弹窗键盘修复后重跑 347 项前端测试, TypeScript/Vite 和 Tauri debug 构建; 后端无后续代码修改.

## 验收上限

- [ ] 原生性能后台采集/手动暂停/断线完整组合未实测, 控制器/store 测试通过.
- [ ] 未逐项修改全部偏好后做原生冷启动遍历; 已确认新偏好重启保留和旧主题保留.
- [ ] 启动检查零调用/在途失效通过单测, 原生未抓包; WebKit 存储未故障注入.
- [ ] 用户要求后再提交/归档.

详细产物与证据: [总任务验证记录](../09-05-settings-clipboard/validation.md).

## 回滚边界

撤回本次偏好/UI/跨层参数修改时保留原 theme/adb-gui-ui. 不清理用户日志, 文件和缓存.
