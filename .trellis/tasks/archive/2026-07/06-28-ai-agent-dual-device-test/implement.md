# AI Agent 双设备自动化测试 - 实施计划

## 环境准备

在开始编码前需要确认:

- [ ] Node.js >= 18 已安装.
- [ ] pnpm 已安装.
- [ ] ADB 已安装, `adb devices` 可列出设备.
- [ ] 两台 Android 设备已连接 (USB 或 WiFi), serial 已记录.
- [ ] 选定视觉模型的 API Key 已获取 (Doubao / Qwen / Gemini 任选一个).
- [ ] 阅读 Midscene.js Android 接入文档: https://midscenejs.com/integrate-with-android.html

## 实施步骤

### Phase 1: 项目骨架 (Day 1)

- [ ] 1.1 新建项目目录, 初始化 `pnpm init`.
- [ ] 1.2 安装依赖: Midscene Android SDK, js-yaml, commander, zod, typescript, tsx.
  - 确认 Midscene Android 的确切 npm 包名 (查 npm registry 或官方文档).
- [ ] 1.3 配置 tsconfig.json (ESM, strict, outDir: dist).
- [ ] 1.4 创建目录结构: `src/`, `cases/`, `reports/`.
- [ ] 1.5 创建 `.env.example` 和 `.gitignore`.
- [ ] 1.6 创建 `src/types.ts` — 定义 TestCase, Step, StepResult, TestResult 等类型, 用 zod schema 做 YAML 校验.

### Phase 2: YAML 解析 (Day 1)

- [ ] 2.1 实现 `src/yaml-parser.ts`:
  - 读取 YAML 文件, 用 zod schema 校验.
  - 返回强类型 TestCase 对象.
  - 错误时给出清晰的校验失败信息 (哪个字段, 什么问题).
- [ ] 2.2 创建示例用例 `cases/example-task-flow.yaml`.
- [ ] 2.3 写一个简单测试: 解析示例 YAML 并打印结构.

### Phase 3: Agent 管理 (Day 2)

- [ ] 3.1 实现 `src/agents.ts`:
  - `verifyDeviceOnline(serial)` — 调用 adb 确认设备状态.
  - `initAgents(devices, options)` — 创建两个 Midscene AndroidAgent.
  - `cleanup()` — 销毁 Agent, 释放资源.
- [ ] 3.2 实现 `getModelConfig()` — 从环境变量读取模型配置.
- [ ] 3.3 验证: 连接真实设备, 创建 Agent, 执行一个简单的 `aiAct("点击屏幕中央")`, 确认可工作.

### Phase 4: 编排引擎 (Day 2-3)

- [ ] 4.1 实现 `src/orchestrator.ts`:
  - `runTestCase(caseFile, options)` — 主入口.
  - `executeStep(agent, step)` — 单步执行逻辑 (waitBefore → aiAct → aiAssert → screenshot).
  - `takeScreenshot(agent, step)` — 截图并保存到报告目录.
- [ ] 4.2 实现乒乓分发逻辑: 根据 step.role 选择 executorAgent 或 qualityAgent.
- [ ] 4.3 实现失败处理: 截图 + 错误记录 + stopOnFailure 控制.
- [ ] 4.4 实现全局超时: 用 Promise.race 或 AbortController.

### Phase 5: 报告 (Day 3)

- [ ] 5.1 实现 `src/reporter.ts`:
  - 收集所有 StepResult, 生成 TestResult.
  - 写入 `reports/<case-name>/<timestamp>/result.json`.
  - 截图文件已在 Phase 4 落盘.
- [ ] 5.2 CLI 运行结束后打印摘要: 通过/失败步骤数, 总耗时, 报告路径.
- [ ] 5.3 确认 Midscene 内置报告是否自动生成 (如果支持, 直接复用).

### Phase 6: CLI (Day 3)

- [ ] 6.1 实现 `src/cli.ts`:
  - `run <path>` 命令: 单个 YAML 或目录.
  - 命令行参数: `--executor-serial`, `--quality-serial`, `--report-dir`, `--stop-on-failure`, `--model`.
- [ ] 6.2 在 package.json 添加 `bin` 入口.
- [ ] 6.3 支持 `npx tsx src/cli.ts run cases/example-task-flow.yaml` 直接运行.

### Phase 7: 端到端验证 (Day 4)

- [ ] 7.1 连接两台真实设备, 两台都安装目标 App 并登录不同账号.
- [ ] 7.2 编写一个真实业务测试用例 YAML (至少 3 步: 执行 → 质量 → 执行).
- [ ] 7.3 运行端到端测试, 验证:
  - 乒乓切换正确.
  - 截图正确保存.
  - 断言通过或失败时行为正确.
  - 报告文件完整.
- [ ] 7.4 修复端到端中发现的问题.

### Phase 8: 文档 (Day 4)

- [ ] 8.1 编写 README.md:
  - 项目介绍和架构图.
  - 环境准备步骤.
  - YAML 用例编写指南 (字段说明 + 示例).
  - CLI 使用方法.
  - 模型配置说明.
  - 常见问题.

## 验证命令

```bash
# 解析 YAML (Phase 2 验证)
npx tsx src/cli.ts parse cases/example-task-flow.yaml

# 单设备连通性 (Phase 3 验证)
npx tsx src/cli.ts check-devices --executor-serial XXX --quality-serial YYY

# 运行测试用例 (Phase 7 验证)
npx tsx src/cli.ts run cases/example-task-flow.yaml \
  --executor-serial DEVICE_A \
  --quality-serial DEVICE_B

# 批量运行
npx tsx src/cli.ts run cases/
```

## 风险文件

- `src/agents.ts` — Midscene AndroidAgent 的实际 API 可能和设计文档中的伪代码不同, 需要在 Phase 3 参考最新文档调整.
- `src/orchestrator.ts` — 步骤间同步的 `aiWaitFor` 超时配置需要根据实际业务响应速度调优.

## 回滚点

- Phase 3 结束: 如果 Midscene Android SDK 无法正常工作, 需要评估是否切换到 Open-AutoGLM (Python) 方案.
- Phase 4 结束: 编排引擎可独立验证 (mock Agent), 不依赖真实设备.
