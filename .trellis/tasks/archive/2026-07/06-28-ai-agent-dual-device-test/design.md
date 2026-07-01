# AI Agent 双设备自动化测试 - 技术设计

## 技术选型

### 核心框架: Midscene.js

选择理由:
- 视觉驱动, 基于截图 + 多模态模型定位元素, 不依赖 accessibility tree 或 selector.
- 原生支持 Android (通过 ADB + scrcpy), 可创建多个 AndroidAgent 实例绑定不同设备.
- 提供 `aiAct` (自主规划操作), `aiAssert` (断言), `aiQuery` (提取数据), `aiWaitFor` (等待) 等完整 API.
- 支持多种视觉模型: Doubao-Seed, Qwen, Gemini, AutoGLM, 通过云端 API 调用.
- AndroidWorld Benchmark Pass@1 93.1%, 生产级可靠性.
- JS/TS 生态, 和 Node.js CLI 项目天然适配.

### 视觉模型

MVP 阶段使用云端 API, 按需选择:
- **Doubao-Seed-2.1** — 视觉定位强, Midscene 默认推荐.
- **qwen3.7-plus** — 性价比高, 有开源自部署选项.
- **gemini-3.5-flash** — 多模态理解强.

模型通过环境变量配置, 可随时切换, 不影响测试用例.

### 运行时

- Node.js >= 18.
- ADB 已安装且两台设备已连接 (USB 或 WiFi).
- pnpm 作为包管理器.

## 架构

```
ai-test-agent/
├── package.json
├── tsconfig.json
├── .env.example              # 模型 API key 模板
├── config.yaml               # 全局配置 (默认设备 serial, 超时, 报告目录)
├── cases/                    # 测试用例 YAML
│   └── example-task-flow.yaml
├── src/
│   ├── cli.ts                # CLI 入口, 解析命令行参数
│   ├── orchestrator.ts       # 核心编排引擎: 乒乓状态机
│   ├── agents.ts             # 双 Agent 初始化和生命周期管理
│   ├── yaml-parser.ts        # YAML 用例解析和校验
│   ├── reporter.ts           # 测试报告生成
│   └── types.ts              # 类型定义
├── reports/                  # 运行产物 (gitignore)
└── README.md
```

## YAML 测试用例 Schema

```yaml
# 用例元信息
name: "创建任务并审核通过"         # 用例名称
description: "验证执行端创建任务后质量端可审核通过" # 可选描述
timeout: 300                       # 整体超时秒数, 默认 300

# 设备配置 (可被 CLI 参数覆盖)
devices:
  executor:
    serial: "DEVICE_A_SERIAL"      # ADB serial
  quality:
    serial: "DEVICE_B_SERIAL"

# 前置条件: 描述期望的初始状态, 每个角色各一条
preconditions:
  executor: "已登录执行账号, 停留在任务列表页"
  quality: "已登录质量账号, 停留在任务列表页"

# 有序步骤列表
steps:
  - role: executor                 # executor | quality
    action: "点击新建任务按钮, 填写标题为'测试任务001', 选择类型为'常规检查', 点击提交"
    assert: "页面显示'提交成功'"    # 可选, 操作后断言
    waitBefore: null               # 可选, 操作前等待条件
    timeout: 60                    # 可选, 单步超时

  - role: quality
    waitBefore: "任务列表中出现'测试任务001'" # 等执行端数据同步
    action: "找到'测试任务001'并点击进入, 检查表单内容, 点击'通过'"
    assert: "显示'审核完成'"

  - role: executor
    waitBefore: "任务状态显示为'已通过'"
    action: "刷新页面, 点击进入下一步表单, 填写检查结果, 点击提交"
    assert: "下一步提交成功"
```

### 字段说明

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `name` | string | 是 | 用例名称 |
| `description` | string | 否 | 用例描述 |
| `timeout` | number | 否 | 整体超时秒数, 默认 300 |
| `devices.executor.serial` | string | 是 | 执行端设备 ADB serial |
| `devices.quality.serial` | string | 是 | 质量端设备 ADB serial |
| `preconditions.executor` | string | 否 | 执行端初始状态描述 |
| `preconditions.quality` | string | 否 | 质量端初始状态描述 |
| `steps[].role` | enum | 是 | `executor` 或 `quality` |
| `steps[].action` | string | 是 | 自然语言操作描述, 交给 `aiAct()` |
| `steps[].assert` | string | 否 | 操作后断言, 交给 `aiAssert()` |
| `steps[].waitBefore` | string | 否 | 操作前等待条件, 交给 `aiWaitFor()` |
| `steps[].timeout` | number | 否 | 单步超时秒数, 默认 60 |

## 核心模块设计

### 1. CLI (cli.ts)

```
npx ai-test run <path>              # 运行单个 YAML 或整个目录
  --executor-serial <serial>        # 覆盖 YAML 中的 executor 设备
  --quality-serial <serial>         # 覆盖 YAML 中的 quality 设备
  --report-dir <dir>                # 报告输出目录, 默认 ./reports
  --stop-on-failure                 # 遇到失败立即终止, 默认 true
  --model <model-name>              # 覆盖视觉模型
```

使用 `commander` 或 `yargs` 解析参数, 调用 orchestrator.

### 2. Orchestrator (orchestrator.ts)

核心编排引擎, 职责:

```typescript
async function runTestCase(caseFile: string, options: RunOptions): Promise<TestResult> {
  // 1. 解析 YAML
  const testCase = parseYaml(caseFile);

  // 2. 初始化双 Agent
  const { executorAgent, qualityAgent } = await initAgents(testCase.devices, options);

  // 3. 验证前置条件 (可选)
  if (testCase.preconditions) {
    await executorAgent.aiAssert(testCase.preconditions.executor);
    await qualityAgent.aiAssert(testCase.preconditions.quality);
  }

  // 4. 乒乓执行步骤
  const stepResults: StepResult[] = [];
  for (const step of testCase.steps) {
    const agent = step.role === 'executor' ? executorAgent : qualityAgent;
    const result = await executeStep(agent, step);
    stepResults.push(result);

    if (!result.passed && options.stopOnFailure) {
      break;
    }
  }

  // 5. 生成报告
  return generateReport(testCase, stepResults);
}

async function executeStep(agent: AndroidAgent, step: Step): Promise<StepResult> {
  const startTime = Date.now();
  try {
    // 等待前置条件
    if (step.waitBefore) {
      await agent.aiWaitFor(step.waitBefore, {
        timeoutMs: (step.timeout || 60) * 1000
      });
    }

    // 执行操作
    await agent.aiAct(step.action);

    // 断言
    if (step.assert) {
      await agent.aiAssert(step.assert);
    }

    // 截图
    const screenshotPath = await takeScreenshot(agent, step);

    return {
      passed: true,
      role: step.role,
      action: step.action,
      screenshotPath,
      duration: Date.now() - startTime,
    };
  } catch (error) {
    const screenshotPath = await takeScreenshot(agent, step);
    return {
      passed: false,
      role: step.role,
      action: step.action,
      error: error.message,
      screenshotPath,
      duration: Date.now() - startTime,
    };
  }
}
```

### 3. Agents (agents.ts)

双设备 Agent 初始化:

```typescript
import { AndroidAgent } from '@anthropic/midscene'; // 实际 import 以 Midscene 文档为准

interface AgentPair {
  executorAgent: AndroidAgent;
  qualityAgent: AndroidAgent;
  cleanup: () => Promise<void>;
}

async function initAgents(
  devices: { executor: DeviceConfig; quality: DeviceConfig },
  options: RunOptions
): Promise<AgentPair> {
  // 验证设备在线
  await verifyDeviceOnline(devices.executor.serial);
  await verifyDeviceOnline(devices.quality.serial);

  // 创建两个独立 Agent, 各绑定不同设备
  const executorAgent = new AndroidAgent({
    serial: devices.executor.serial,
    modelConfig: getModelConfig(options),
  });

  const qualityAgent = new AndroidAgent({
    serial: devices.quality.serial,
    modelConfig: getModelConfig(options),
  });

  return {
    executorAgent,
    qualityAgent,
    cleanup: async () => {
      await executorAgent.destroy();
      await qualityAgent.destroy();
    },
  };
}

function verifyDeviceOnline(serial: string): Promise<void> {
  // 执行 adb -s <serial> get-state, 确认返回 "device"
}

function getModelConfig(options: RunOptions) {
  // 从环境变量或 options 读取模型配置
  return {
    provider: process.env.MIDSCENE_MODEL_PROVIDER || 'doubao',
    apiKey: process.env.MIDSCENE_API_KEY,
    model: options.model || process.env.MIDSCENE_MODEL_NAME,
  };
}
```

### 4. Reporter (reporter.ts)

```typescript
interface TestResult {
  name: string;
  passed: boolean;
  startTime: string;
  duration: number;
  steps: StepResult[];
}

interface StepResult {
  index: number;
  role: 'executor' | 'quality';
  action: string;
  assert?: string;
  passed: boolean;
  error?: string;
  screenshotPath: string;
  duration: number;
}

function generateReport(testCase: TestCase, steps: StepResult[]): TestResult {
  // 写入 reports/<case-name>/<timestamp>/
  //   result.json   — 结构化结果
  //   step-01-executor.png
  //   step-02-quality.png
  //   ...
  // Midscene 自带的可视化报告也会输出到此目录
}
```

## 数据流

```
YAML 文件
  ↓ parse
TestCase { name, devices, preconditions, steps[] }
  ↓ initAgents
AgentPair { executorAgent, qualityAgent }
  ↓ for each step
  ↓   选择 agent by role
  ↓   waitBefore? → agent.aiWaitFor()
  ↓   agent.aiAct(action)
  ↓   assert? → agent.aiAssert()
  ↓   takeScreenshot()
  ↓   → StepResult
  ↓ collect all StepResults
TestResult
  ↓ generateReport
reports/<case>/<timestamp>/result.json + screenshots
```

## 关键技术点

### 步骤间同步

乒乓切换时, 质量端可能需要等执行端提交的数据同步到后端再刷新. 方案:

- **视觉等待 (推荐)**: `waitBefore: "任务列表中出现'测试任务001'"`, Midscene 会轮询截图直到条件满足或超时.
- **固定延时 (降级)**: `waitBefore: "等待 5 秒"`, 简单但不可靠.
- **API 轮询 (P1)**: 后续可扩展为调用后端 API 确认数据状态.

### 失败处理

- 单步失败: 截图 + 记录错误 + 根据 `--stop-on-failure` 决定继续或终止.
- 全局超时: 整个用例超过 `timeout` 秒强制终止.
- Agent 连接失败: 启动时校验, 运行中断连则标记后续步骤为 skipped.

### 模型配置

通过环境变量, 和测试用例解耦:

```bash
MIDSCENE_MODEL_PROVIDER=doubao           # doubao / qwen / openai / gemini
MIDSCENE_API_KEY=sk-xxx
MIDSCENE_MODEL_NAME=doubao-seed-2.1      # 具体模型名
```

## 依赖

```json
{
  "dependencies": {
    "@anthropic/midscene": "latest",
    "js-yaml": "^4.1.0",
    "commander": "^12.0.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "typescript": "^5.5.0",
    "tsx": "^4.0.0",
    "@types/js-yaml": "^4.0.9"
  }
}
```

注意: Midscene 的实际包名需以 npm 发布为准 (`@midscene/android` 或 `@midscene/web`), 初始化时查阅最新文档确认.

## 风险和缓解

| 风险 | 影响 | 缓解 |
|------|------|------|
| AI 模型操作不稳定 | 步骤执行失败 | 用 `aiAct` 拆细步骤; 加重试; 选强模型 |
| 步骤间数据同步延迟 | 质量端看不到执行端数据 | `aiWaitFor` 视觉等待 + 合理超时 |
| Midscene Android 适配问题 | Agent 连不上设备 | 确认 ADB + scrcpy 环境; 参考官方 Android 接入指南 |
| 云端模型 API 限流 | 执行变慢 | 控制并发; 批量用例串行执行 |
