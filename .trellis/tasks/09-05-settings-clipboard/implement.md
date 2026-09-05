# 总体实施与验收

## 当前状态

- [x] 用户授权规划, 确认第一版核心设置和手动剪贴板, 随后通过 "OK开始执行" 授权实现.
- [x] 统一设置子任务完成实现, 通过自动检查和桌面主要路径验收.
- [x] DEX 剪贴板子任务完成实现, 通过当前 Android 16 真机主要路径验收.
- [x] 更新共享状态/协议 spec, 检查最终 diff, 构建并启动最终 macOS debug 包.
- [x] 登记实际结果和未覆盖范围: [validation.md](./validation.md).
- [ ] 用户要求后再提交和归档. 当前保留 main 分支未提交改动.

## 实施结果

1. 先完成偏好 schema/存储, 唯一设置弹窗, 页面入口整合和截图/录屏行为快照.
2. 再扩展原 app-info.dex, 验证 shell Context/读写, 接入共享部署服务和手动工具 UI.
3. 同一个 Tauri 包完成双向文本, 图片拒绝, 截图/录屏与偏好重启检查.
4. 修复浏览器发现的反向 Tab 越界, 实际验证首尾循环/分组方向键/Escape, 重建最终包.

## 质量门禁

~~~sh
corepack pnpm test
corepack pnpm build
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
bash -n scripts/build-app-info-dex/build.sh
corepack pnpm tauri build --debug --bundles app --config '{"bundle":{"createUpdaterArtifacts":false}}'
~~~

已通过: 347 项前端测试, 119 项 Rust 测试, 类型/构建/格式/Clippy/DEX 构建检查. Browser 使用 1200 x 800 和 900 x 600 两种主题; 原生包通过 macOS open 启动.

## 未覆盖与后续检查

- [ ] 真实设备切换/断线注入, 旧 DEX 替换, 原生性能全部组合.
- [ ] Android 旧版本和其他 ROM, Windows/Linux 原生剪贴板.
- [ ] 原生启动更新检查网络抓包和 WebKit 存储故障注入.

这些项目的当前替代证据及局限见 validation.md, 不将单测记录为真机验证.

## 回滚边界

按功能一起撤回 Java/DEX/Rust/前端协议; 保留原 theme/adb-gui-ui, 用户文件和应用缓存. 不引入 input text, 固定 service call 编号或模拟成功.
