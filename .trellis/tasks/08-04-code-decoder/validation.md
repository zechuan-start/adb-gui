# 条码二维码解析验证记录

验证日期: 2026-08-31.

## 结论

P0 验收项通过. Release `.app` 已替换到 `/Applications/ADB GUI.app`, 使用在线 USB 设备和本地图片完成真实桌面冒烟. 未发现功能缺陷或阻断性日志.

## 验证环境

- macOS Darwin arm64, 最小窗口 900x600.
- ADB GUI release binary SHA256: `4c64510b8ec826af6ab09d05785ff09cee291d7cfd40dc65f12859a9d68d222c`.
- USB 设备: `z5rc4hobfelv9tvc`, 型号 `2312DRAABC`, 在线.
- 旧应用备份: `/Users/qi/.cache/adb-gui-smoke-backup-20260831/ADB GUI.app`.
- 样本目录: `/tmp/adb-gui-decoder-smoke-20260831`, `/tmp/adb-gui-decoder-limit-20260831`.

## 自动化门禁

| 检查 | 结果 |
|---|---|
| `pnpm test` | 18 个测试文件, 215 项通过 |
| Rust tests | 57 项通过 |
| `pnpm build` | 通过, WASM 资源进入本地产物 |
| `cargo fmt --check` | 通过 |
| Clippy `-D warnings` | 通过 |
| `rg -l "jsdelivr" dist/` | 无命中 |
| `pnpm tauri build --bundles app` | `.app` 产物成功生成; 后续 updater 签名因本机未配置 `TAURI_SIGNING_PRIVATE_KEY` 退出 1, 不影响本地 `.app` 冒烟 |

## 桌面冒烟

| 场景 | 结果 |
|---|---|
| 启动与设备 | 应用正常启动, 正确识别在线 USB 设备 |
| 文件选择 | 单张和批量 5 张均可解码 |
| Finder 拖拽 | 5 张合法图片全部解码; 同批 `.txt` 明确提示“已忽略 1 个不支持的文件” |
| 剪贴板 | 按钮和 `Command+V` 均可解码图片; 仅文本时提示“剪贴板中没有图片” |
| 50 张上限 | 选择 51 张时处理前 50 张并提示“已截断 1 张”; 最终 50/50 成功 |
| 进度与重复提交 | 解码中显示 `16 / 50`; 选择和粘贴按钮禁用, 完成后恢复 |
| 码制往返 | “生码”页生成的 QRCode 和 Code128 均逐字回读 |
| 多码和格式 | 单图同时识别 QRCode 与 Code128; WebP 成功解码 |
| 空白与错误隔离 | 空白图显示“未识别到码”; 单张错误隔离由 store 测试覆盖, 不影响同批后续图片 |
| 汇总 | 5 张批次显示 4 张成功、5 个码; 50 张批次显示 50 张成功、50 个码 |
| 结果操作 | 单条复制和复制全部均经 `pbpaste` 核对; 清空结果通过 |
| URL | HTTP URL 显示打开操作并拉起默认浏览器; 非 URL 不显示该操作 |
| 页面状态 | 切换顶层页签后结果保留; 完整退出并重启后结果不恢复 |
| 主题与尺寸 | 亮色、暗色及 900x600 下无内容遮挡或不可达操作 |
| APK 拖拽回归 | 解码页监听随页签挂载和卸载, “工具”页既有监听及实现未修改; 未执行真实 APK 安装副作用 |

## 离线验证

使用 `sandbox-exec` 的 `(deny network*)` profile 全新启动 release 二进制. 该 profile 同时阻断本机 ADB 端口, 因此设备显示未连接, 不影响解码页.

清空结果后从剪贴板重新投入 QR 图片, 首次识别成功, 内容为 `https://example.com/adb-gui-smoke`. `lsof -nP -a -p <pid> -i` 无任何网络套接字, 构建产物也无 jsDelivr 引用, 确认 WASM 从本地资源加载.

## 运行日志

- `/tmp/adb-gui-smoke-20260831.out` 无错误输出.
- `/tmp/adb-gui-smoke-20260831.err` 仅有一次 macOS 输入法 `IMKCFRunLoopWakeUpReliable` Mach port 提示, 未影响任何操作, 与本功能无关.
