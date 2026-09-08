# 代码基线调研

> 2026-09-08 主线程实测. 所有数字来自 `rg -c '[一-龥]'`, 以行为单位, 同一行多处文案只记一次.

## 文案分布

| 范围 | 文件数 | 含中文行数 | 说明 |
| --- | --- | --- | --- |
| `src/**` 非测试 | 85 | 810 | 界面文案, 提示, aria-label, 抛错文案 |
| `src/**` 测试 | 22 | 143 | 直接断言中文字面量, 迁移后必须改为引用词典 |
| `src-tauri/src/**` | 12 | 181 | 命令返回给 UI 的中文错误文案 |
| `scripts/screenshots/**` | 2 | 26 | 截图脚本的模拟数据与说明 |

前端热点文件 (含中文行数): `DeviceFileManager.tsx` 55, `CodeDecoderPage.tsx` 43, `settingsSections.ts` 42, `PackageManager.tsx` 35, `ScreenRecordTool.tsx` 28, `settings.ts` 27, `CodeGeneratorPage.tsx` 24, `logcatQuery.ts` 23, `LogcatActions.tsx` 21, `PerformancePanel.tsx` 21.

后端热点文件: `device_files.rs` 70, `clipboard.rs` 32, `screen_record.rs` 28, `capture_output.rs` 17.

## 现成可复用的形状

- `src/store/theme.ts` 是"跟随系统"的完整模板: 独立 localStorage key, 模块初始化时读取并应用, 监听系统变化, 导出 dispose 供 HMR 使用. 语言 store 直接照此形状实现, 把 `matchMedia` 换成 `languagechange` 事件.
- `src/lib/settingsSections.ts` 用注册表集中描述设置行的 label/description, 迁移后这些字段改为词典引用, 是文案集中化收益最大的一处.
- `src/store/feedback.ts` 的 toast 只存 `message: string`, 语言切换后已显示的 toast 不会重新翻译. 需要改存结构化错误描述.

## 必须一起改的隐藏点

- 硬编码 `"zh-CN"` 的格式化共 4 处, 语言切换后必须跟随:
  - `src/components/CodeGeneratorPage.tsx:200` `toLocaleString("zh-CN")`
  - `src/components/performance/MetricChart.tsx:176` `toLocaleTimeString("zh-CN", { hour12: false })`
  - `src/lib/deviceFiles.ts:340` `new Intl.DateTimeFormat("zh-CN", ...)`
  - `src/lib/appInfo.ts:4` `new Intl.Collator("zh-CN", ...)` (应用名排序)
- `src-tauri/src/lib.rs:66` 原生菜单项 `"设置…"` 在 Rust 启动时创建, 早于前端可用, 是唯一必须在 Rust 侧保留双语文案的位置.
- `src/lib/tauri.ts` 的原生对话框标题与按钮文案 (`选择截图与录屏保存目录`, `放弃保存`, `恢复默认设置`, `保存设备文件` 等) 由前端作为参数传入插件, 属于前端文案.
- `src/lib/settings.ts` 的解码抛错文案 (`设置格式无效` 等) 在设置读取失败路径上使用. 此时 `adb-gui-settings` 不可信, 所以语言偏好不能存在同一份文件里.
- `index.html` 固定 `lang="en"`, 需要运行时按解析结果写 `document.documentElement.lang`.
- `README.md` (英文) 第 14/48/58/66/75/83/92 行引用的 `docs/images/*.png` 全部是中文界面截图.

## 测试现状

`ownership.test.tsx`, `StatusBanner.test.tsx`, `settingsSections.test.ts` 等 22 个测试文件直接断言中文字面量 (例如 `expect(html).toContain("设备未授权")`). 迁移后这类断言改为引用 `zh-CN` 词典的同一条目, 文案调整不再破坏测试.

## 原生菜单语言初始化补充 (2026-09-08)

- 当前 `src-tauri/src/lib.rs` 的 `macos_menu` 与 `builder.menu(macos_menu)` 均受 `cfg(target_os = "macos")` 限定. 设置菜单项保留 `open-settings` ID 与 `Cmd+,` 快捷键, 语言初始化只更换其文本来源.
- 当前 `Cargo.toml` / `Cargo.lock` 未引入 `sys-locale` 或 `tauri-plugin-os`. 检索本机锁定的 Tauri 2.11.3 源码未发现可直接复用的公开系统首选语言读取接口.
- 已核对上游 [sys-locale v0.3.2 API](https://github.com/1Password/sys-locale/blob/v0.3.2/src/lib.rs): `get_locales()` 按偏好顺序返回 BCP 47 标签, 读取不到时返回空迭代器; `get_locale()` 等价于取首项.
- 已核对 [macOS 实现](https://github.com/1Password/sys-locale/blob/v0.3.2/src/apple.rs): 调用 CoreFoundation 的 `CFLocaleCopyPreferredLanguages`, 不依赖启动 shell 的语言环境变量.
- 决策: 实现阶段将 `sys-locale = "0.3.2"` 加入 macOS target dependencies. 初始化菜单时按与前端一致的首选语言规则处理; 前端就绪后仅由前端生效语言驱动更新. 不新增 OS 插件或项目自有 FFI.
- 本次完成源码与文档核对, 未添加依赖, 未进行原生菜单运行验证. 实施时须覆盖系统初值, 显式偏好不同的冷启动和后续切换.
