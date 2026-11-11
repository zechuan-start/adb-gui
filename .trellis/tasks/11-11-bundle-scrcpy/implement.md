# Implementation Plan

按顺序执行. 每一步完成后运行对应验证.

## 1. 获取脚本和打包配置

- [x] 新增 `scripts/fetch-scrcpy.mjs` (见 design.md).
- [x] 新增 `src-tauri/resources/scrcpy/.gitkeep`, 更新 `.gitignore`.
- [x] `src-tauri/tauri.conf.json` 增加 scrcpy 目录映射.
- [x] `src-tauri/resources/README.txt` 增加 scrcpy 的来源, 更新方法和本地开发说明.
- [x] 验证: 本机运行脚本后目录内容符合白名单. 改错一个 SHA-256 时脚本非零退出, 改回后恢复. 目录只有 `.gitkeep` 时 `cargo check` 通过.

## 2. 后端查找逻辑

- [x] 修改 `src-tauri/src/commands/mirror.rs` 的来源枚举, 查找函数和 `detect_scrcpy`, 删除 PATH 和常见位置查找.
- [x] 重写查找测试: 自定义路径有效, 自定义路径无效不回退, 相对路径, 使用内置版, 内置版缺失. 更新序列化测试.
- [x] 验证: `cargo test --manifest-path src-tauri/Cargo.toml`, `cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings`.

## 3. 前端

- [x] 修改 `src/lib/tauri.ts`, `src/lib/mirror.ts`, `src/components/MirrorTool.tsx`, `src/components/settings/MirrorPreferences.tsx`, `src/components/settings/sections/MirrorSection.tsx`.
- [x] 更新 `en.ts`, `zh-CN.ts`, `tools-*.ts`, `backend-*.ts` 中的文案, 删除不再使用的文案.
- [x] 更新 `src/lib/mirror.test.ts`, `src/store/mirror.test.ts`, `src/components/MirrorTool.test.tsx`.
- [x] 更新 `scripts/screenshots/mock-tauri.js` 和 `smoke.mjs`.
- [x] 验证: `pnpm test`, `pnpm build`, `pnpm test:browser`.

## 4. CI

- [x] `.github/workflows/release.yml` 的矩阵增加 `target`, 在 `tauri-action` 前运行获取脚本.

## 5. 规格文档

- [x] 更新 `.trellis/spec/backend/mirror.md`: 范围, 签名, 查找规则, 错误矩阵, 用例, 测试要求.
- [x] 更新 `.trellis/spec/backend/quality-guidelines.md` 中资源映射的描述.

## 6. 本机打包验证 (macOS arm64)

- [x] 用 `CARGO_TARGET_DIR` 指向 scratchpad 构建 `.app` 和 DMG, 确认包内文件和 SHA-256.
- [x] 真实设备: 从 Finder 启动, 确认来源为内置. 验证投屏, Logcat 连续性, 停止, 关窗, 拔线, 无效自定义路径, 恢复默认, 退出后 `pgrep scrcpy` 无残留.
- [x] 需要时临时移除包内 scrcpy, 确认缺失时的报错.

## 7. CI 验证

- [ ] 用户同意后提交推送, 手动触发 `Package` 工作流.
- [ ] 下载四个目标的产物, 核对文件清单和 SHA-256.
- [ ] 把未能实机验证的 Windows 和 Linux 项目记录到任务中.

## 回滚点

- 第 1 步和第 4 步可以独立回退, 不影响运行时.
- 第 2, 3 步必须一起回退, 否则前后端的来源枚举不一致.
