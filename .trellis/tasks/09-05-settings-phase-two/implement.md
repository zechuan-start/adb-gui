# 第二批实施与联合验收

## 规划与启动门禁

- [x] 核对第一批延期范围、代码和默认值.
- [x] 用户确认生码记住上次选择, 清空只删除正文与结果.
- [x] 完成并交叉检查父子任务 PRD/design/implement, 必需文档/本地链接/父子关系/JSON 元数据检查通过.
- [x] 2026-09-05 用户在实施顺序审阅后明确批准执行, 由主线程串行安排两个子任务, 使用现有 Android Studio 模拟器验证.
- [ ] 读取 trellis-before-dev, 确认第一批未提交改动, 再启动第一个子任务.

## 实施顺序

1. 实施 [文件应用与生码偏好](../09-05-browsing-codegen-settings/implement.md), 完成偏好迁移、视图逻辑和桌面验证.
2. 前一子任务通过后启动 [截图录屏保存目录](../09-05-capture-directory-settings/implement.md), 接入原生目录及失败恢复.
3. 同一个 Tauri 构建联合验收, 记录测试/Browser/原生/真机证据, 不用单测代替实机结果.
4. 更新合约及两份 README 保存目录说明, trellis-check 后审查最终 diff.
5. 用户要求时再提交. 不自动运行会提交的归档脚本, 不建分支/worktree, 不并行修改共享文件.

父任务是规划/验收入口, 不启动为业务实现目标. inline 模式不需 JSONL 注入.

## 统一检查

子任务先做定向检查, 最终集成执行完整门禁:

~~~sh
corepack pnpm test
corepack pnpm build
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --check
corepack pnpm tauri build --debug --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
open -n 'src-tauri/target/debug/bundle/macos/ADB GUI.app'
~~~

2026-09-05 已为第二批实际运行这些检查和构建, 结果见两个子任务 validation.md. 最终前端 380 项、Rust 125 项测试通过, 原生包完成模拟器主要路径验收.

## 联合冒烟

- [ ] 保存原偏好用于测试后恢复, 不记录生码/剪贴板正文.
- [ ] 第一批配置升级、跨重启、单组重置、损坏值及写入失败.
- [ ] 1200 x 800/900 x 600 两主题, 七分组键盘循环, 原生目录框取消后焦点返回.
- [ ] 离线设置与设备起始路径编辑, 不意外请求 ADB.
- [ ] 真机文件排序/隐藏/Home/无效目录恢复, 不误操作隐藏选择或重启传输.
- [ ] 应用排序不重启图标加载或改变所选包名; 搜索/刷新仍正确.
- [ ] 生码改参数保留旧结果并显示过时, 清空保留参数, 重启无正文/结果.
- [ ] 自定义中文/空格目录保存真实 PNG/MP4, 目录与打开选项生效时点正确.
- [ ] 录屏失败不删源, 手动重试/另存为成功, 不自动循环重试, 放弃有确认.
- [ ] 同包回归第一批设置、双向剪贴板、截图复制与原应用加载.
- [ ] 恢复测试偏好, 登记未覆盖平台, 不删除用户原文件.

## 风险与回滚

- 风险文件: settings.ts, codeGenerator store, DeviceFileManager, PackageManager, screen_record.rs.
- 生码偏好/生成快照/过时提示/清空一起改, 不给整个 store 加 persist.
- 保存链路先完成失败保留再接目录, 防止新设置引入数据丢失路径.
- 按子任务边界回滚, 不清空配置. 有待保存录屏时先完成保存或用户明确放弃, 不直接替换运行应用.

## 继续起点

两个子任务已按顺序完成实现和联合检查. 当前等待用户要求提交, 不自动提交或归档. 后续兼容性验证按子任务 validation.md 中明确未覆盖的项目继续.
