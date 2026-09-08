# 验收记录

基线: 2026-09-08, macOS arm64. 完整检查结果与剩余原生/设备验收见[父任务集成验收](../09-08-i18n-bilingual/validation.md).

- 已实现首屏语言解析, 独立 locale 存储, languagechange 响应, 设置语言行与 HTML lang, 格式化缓存和 typed catalog.
- store/locale 与解析表驱动测试覆盖 zh-TW/zh-Hant/非中文/损坏存储/显式偏好/重载.
- settings ownership/reset 测试确认损坏设置不锁住语言, reset 不重置语言.
- 缺 key 与错误参数的 TypeScript 虚拟负向检查分别产生 TS2741/TS2322.
- macOS 真机构建验证系统中文初值, 显式英文, 菜单同步, Cmd+, 与保存英文偏好冷启动.
- Windows 原生及 macOS 系统语言设置实际更改未验收; 解析与 languagechange 由自动化覆盖.

2026-09-08 按用户明确要求归档交付. 保留父记录中的验证范围与未实测场景, 不将归档视为补做验收.
