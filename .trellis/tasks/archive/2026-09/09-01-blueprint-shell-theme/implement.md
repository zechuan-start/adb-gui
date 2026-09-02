# Blueprint 应用外壳与主题实施计划

## 1. 建立视觉基础

- [x] 搜索并记录现有全局 token、圆角和主题使用点.
- [x] 引入本地 IBM Plex Sans/Mono 资源和 font role.
- [x] 将 light/dark token 替换为 Blueprint 色值, 增加网格、surface 和日志预留 token.
- [x] 增加 `prefers-reduced-motion` 与统一 focus-visible 规则.

验证: 构建通过, 五个现有页面在亮暗主题下仍可读.

## 2. 收敛主题 store

- [x] 校验持久化 theme 值.
- [x] 为缺失 `matchMedia` 和旧 listener API 提供显式兼容路径.
- [x] 添加 system theme change 和手动 theme 不跟随的测试.

验证: theme store 定向测试通过.

## 3. 新增 UI 状态

- [x] 新建 `src/store/ui.ts` 和测试.
- [x] 实现 PaneId、默认日志开关、切页退出铺满和持久化边界.
- [x] 保证 action 内部维护不变量, 组件不重复拼接规则.

验证: 默认值、逐页记忆、切页和持久化测试通过.

## 4. 提取外壳

- [x] 创建 `src/components/layout/` 组件.
- [x] 将顶部六页签迁移为五项左侧索引导航.
- [x] 将设备控件迁移到 54 px 顶栏.
- [x] 保留 Activity polling、process map 和设备监听 effect.
- [x] 为后续 Logcat 提供持续 runtime 和可见 panel 插槽.

验证: 所有页面可进入, 设备切换与 Activity 刷新正常.

## 5. 视觉检查

- [x] 浏览器检查 `1200x800` light/dark.
- [x] 浏览器检查 `900x600` light/dark.
- [x] 检查 system theme、focus、reduced motion 和文本截断.
- [x] 运行全量前端测试与构建.

```bash
corepack pnpm test
corepack pnpm build
```

风险文件: `src/App.tsx`、`src/index.css`、`src/store/theme.ts`、新 `src/store/ui.ts` 和 `src/components/layout/`.
