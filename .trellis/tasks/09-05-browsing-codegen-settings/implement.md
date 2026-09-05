# 浏览与生码实施清单

## 启动前

- [x] 2026-09-05 用户在实施顺序审阅后明确要求由主线程安排具体任务并开始执行, 授权按本子任务到保存目录子任务的顺序推进.
- [x] 读取 trellis-before-dev, frontend settings/state/component/quality, backend device-files 合约及父任务 research.
- [x] 确认第一批未提交改动, 在 main 原位置实施, 不提交或回滚已有修改. 不先启动目录子任务.

## 1. 统一偏好与设置入口

- [x] 添加 files/apps/codegen 类型、默认值、解码和分组恢复, 保留 version 1 及旧值.
- [x] 新增三分组与页面设置入口, 排序枚举/方向复用, 保持 stable dimensions 和原 modal 焦点边界.
- [x] 定向测试旧配置补全、非法枚举/路径形状、写失败、单组重置和不持久化运行数据.

## 2. 文件浏览工作流

- [x] 将固定后端展示排序迁至唯一前端视图投影, 保留所有协议和路径校验.
- [x] 接入排序/方向/目录优先/隐藏, 不变更真实数据或触发列表重载.
- [x] 清理被隐藏的选择与预览, 旧预览不可重新出现, 已提交传输继续原快照.
- [x] 起始目录只在激活/新设备/Home 时读快照, 失败可编辑和显式打开下载目录.
- [x] 定向测试排序组合、0 字节、符号链接、隐藏文件、稳定键、初始错误和迟到预览.
- [x] 已检查设置双尺寸与原生文件读取/不可访问起始目录, 中文和路径形状由单测覆盖; 完整预设/权限组合未逐项实测, 见 validation.md.

## 3. 应用列表工作流

- [x] cache/fresh/packages 三路径移除提前排序, 只在显示投影使用当前偏好.
- [x] 接入五维排序/方向, 保留中文默认规则和未知值在后, 不改元信息/图标请求依赖.
- [x] 测试平局、缺失值、缓存到新数据、搜索与选中包名稳定.
- [x] 模拟器切排序保持所选包名; 元信息/图标加载依赖已审查, 未逐条抓包计数, 见 validation.md.

## 4. 生码工作流

- [x] 迁出 draft 中的长期参数, 生成时组成一次性输入快照.
- [x] 同步结果快照/过时判断, 参数变化保留旧结果, 只点击生成才更新.
- [x] 页面参数和弹窗同源持久, 自定义空值清晰错误, 配置失败禁用生成.
- [x] clear/canClear 改为仅正文和结果, 分组重置保留当前内容.
- [x] 回归解析、草稿、快照和列表测试, 覆盖参数切换/恢复、清空、重启无正文及存储失败.

## 5. 验证门禁

~~~sh
corepack pnpm test
corepack pnpm build
perl -e 'alarm shift; exec @ARGV' 60 cargo test --manifest-path src-tauri/Cargo.toml
cargo fmt --manifest-path src-tauri/Cargo.toml --check
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
git diff --check
~~~

- [x] Browser 实际操作 1200 x 800/900 x 600 双主题, 七组方向键/Tab/Escape, 文件/应用/生码入口焦点返回.
- [x] 原生退出重开验证应用排序和起始目录偏好, 模拟器文件/应用读取通过; 生码清空/重载边界由 store 测试覆盖.
- [x] 第一批日志/性能/启动偏好回归, 更新对应 spec, trellis-check 审查唯一来源与未说明行为变化.
- [x] 保存验证记录并恢复测试改动, 通过后再进入目录子任务.

## 风险与回滚

优先检查 codeGenerator 的结果快照、PackageManager 的加载依赖以及文件页的激活 effect. 修改排序绝不能挂到设备加载回调依赖导致反复请求. 回滚时一起恢复参数所有权与消费者, 不删除配置或缓存.

2026-09-05 已完成实现和独立检查, 具体通过项与实测上限见 [validation.md](./validation.md). 未提交或归档, 允许后续目录子任务继续串行实施.
