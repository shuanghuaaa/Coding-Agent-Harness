# SPEC.md — Coding Agent Harness

> *Spec-Driven, Subagent-Built, Human-Owned.*  
> 项目：AI4SE 期末项目 · A · Coding Agent Harness

---

## 1. 问题陈述

### 1.1 要解决的问题

当前编码智能体（Cursor、Claude Code、Copilot 等）虽能完成大部分编码工作，但多数开发者对其内部机制缺乏理解——它们如何组织上下文、如何解析动作、如何确保安全、如何从错误中自我修正。本项目不是为开发者提供另一个"帮你写代码"的工具，而是**构建一个透明的、可观测的、机制可验证的 Coding Agent Harness**，让使用者看清 Agent 的每一个决策环节。

核心等式 **Agent = LLM + Harness**（§A.1）：LLM 相当于 CPU，只负责"决定下一步做什么"这一行任务决策；其余都是工程——把一个只会产生下一步设想的 LLM，封装成一台能稳定、可靠工作的系统。本项目通过"用一个 Harness（Superpowers）去造另一个 Harness"的方式，让开发者对这套方法论形成第一手的批判性理解。

### 1.2 目标用户

- 学习 AI4SE 的学生，希望通过实操理解 Agent = LLM + Harness 的工程本质
- 对 Agent 内部机制感兴趣的开发者，希望在 mock LLM 下确定性验证 Agent 行为

### 1.3 为什么值得做

当 LLM 能完成大部分"思考"时，工程师的价值落在 Harness 这层工程（治理、反馈、上下文、安全、分发）。本项目不是提示词工程练习，而是**编码实现一个可独立验证的 harness 内核**——移除 LLM 后，仓库里仍有大量可独立测试的工程代码（§A.4-C）。

---

## 2. 用户故事

| # | 用户故事 | I (独立) | N (可协商) | V (有价值) | E (可估算) | S (小) | T (可测试) |
|---|---------|---------|-----------|-----------|-----------|------|----------|
| 1 | 作为开发者，我可以通过 WebUI 输入一个编码任务，Agent 自动完成代码编写、测试和修正 | ✅ 不依赖其他故事 | 任务格式可协商 | 核心价值交付 | 2-3 天 | 可拆分为主循环+工具+UI | 输入"写一个 add 函数"，断言 agent 返回完成状态 |
| 2 | 作为开发者，我可以看到 Agent 的每一步操作（工具调用、执行结果、反馈闭环修正过程） | ✅ 独立于任务执行 | 展示粒度可协商 | 可观测性是信任基础 | 1 天 | 单组件开发 | WebSocket 推送消息可在 WebUI 中渲染 |
| 3 | 作为开发者，当 Agent 尝试执行危险命令时，系统会弹出审批窗口，我可以选择允许、拒绝或修改参数 | ✅ 独立于工具执行 | 危险动作列表可协商 | 治理安全核心 | 1-2 天 | 护栏+弹窗 | mock LLM 下注入 `rm -rf /` 断言拦截+弹窗 |
| 4 | 作为开发者，我可以在首次使用时安全录入 API Key，系统会加密存储，且后续无需重复输入 | ✅ 独立于 Agent 核心 | 存储方案可协商 | 安全合规必需 | 1 天 | 凭据模块独立 | 录入 key → 重启 → 断言无需重新输入 |
| 5 | 作为开发者，我可以通过 Docker 一键部署整个系统，包括 WebUI 和 Harness 内核 | ✅ 独立于开发 | 镜像仓库可协商 | 分发必需 | 0.5 天 | 单 Dockerfile | `docker build && docker run` → `curl localhost:3000/health` 返回 200 |

---

## 3. 功能规约

### 3.1 Agent 主循环（决策封装）

| 项目 | 描述 |
|------|------|
| 输入 | 用户自然语言编码任务 + 上下文（.rules 配置规则 + 记忆检索结果 + 工具定义） |
| 行为 | 1. ContextBuilder 组装 system prompt（含规则、记忆、工具定义）→ 2. 调用 LLM → 3. 解析 LLM 响应中的 tool_calls → 4. guardrail() 拦截危险动作 → 5. ToolDispatcher 分发执行 → 6. 若为 `run_test` 工具，FeedbackValidator 解析结果、FeedbackInjector 回灌 → 7. StopCondition 判断是否停机 |
| 输出 | `RunResult { status, rounds, messages, feedbackHistory }` |
| 边界条件 | 最大轮数默认 10（可在 StopCondition 中配置）；用户可通过 `cancel()` 随时终止；LLM 返回 `finish_reason='stop'` 且无 tool_calls 时自动停机 |
| 错误处理 | 工具执行失败时，将 error 信息作为 tool 消息回灌给 LLM（而非让主循环崩溃）；LLM 调用失败由 LLMProvider 实现层处理（MockLLM 抛异常、OpenAI 兼容层自动重试 3 次） |
| §A.4 合规 | 主循环 100% 自己编码（`src/agent/loop.ts`），不依赖任何 Agent 编排框架；mock LLM 下可确定性测试（`tests/agent/loop.test.ts`） |

### 3.2 工具层（动作 / 工具）

| 工具 | 功能 | 输入 | 输出 | 边界条件 | 错误处理 |
|------|------|------|------|---------|---------|
| `read_file` | 读取文件内容 | `path: string` | `{ content: string }` 或 `{ error: string }` | 路径跨平台兼容（`/` 和 `\`）；限制在工作区内 | 文件不存在 → 返回 error 而非抛异常 |
| `write_file` | 创建/覆盖文件 | `path: string, content: string` | `{ content: "File written: ..." }` 或 `{ error: string }` | 自动创建父目录；路径经过 guardrail 检查 | 权限不足 → 返回 error |
| `delete_file` | 删除文件 | `path: string` | `{ content: "File deleted: ..." }` 或 `{ error: string }` | 路径经过 guardrail 检查（系统文件拦截） | 文件不存在 → 返回 error |
| `shell` | 执行 shell 命令 | `command: string` | `{ content: stdout, error?: stderr }` | 超时 30s；maxBuffer 10MB；命令经过 guardrail 检查 | 命令失败 → 捕获 exit code + stderr |
| `search` | 代码搜索（ripgrep） | `pattern: string, path?: string` | `{ content: string }` | 超时 10s；默认搜索当前目录 | ripgrep 不可用 → 返回 error |
| `git_diff` | 查看 git 变更 | 无 | `{ content: string }` | 超时 10s；非 git 仓库 → 返回 error | 命令失败 → 返回 error |
| `run_test` | 运行测试并触发反馈闭环 | `command: string` | `{ content: stdout, error?: stderr }` | 超时 60s；maxBuffer 10MB；执行后触发 FeedbackValidator | 测试失败 → 返回 stdout + stderr，由 FeedbackValidator 解析 |

所有工具实现统一 `Tool` 接口（`src/tools/base.ts`），通过 `ToolDispatcher`（`src/tools/dispatcher.ts`）按名称路由分发。工具分发在 mock LLM 下可确定性测试（`tests/tools/dispatcher.test.ts`）。

### 3.3 反馈闭环 ★（Main Contribution，对应 §A.4-D）

| 项目 | 描述 |
|------|------|
| 触发条件 | 每次工具执行后，若工具名在 `feedbackToolNames` 列表中（默认 `['run_test']`） |
| 校验器（FeedbackValidator） | 解析测试输出（stdout + error），客观判定通过/失败；提取失败详情（测试名、期望值、实际值、文件、行号） |
| 失败分类（FailureClassifier） | 四类：`compile`（TS 编译错误）、`assertion`（断言失败，含 expected/got）、`timeout`（超时）、`runtime`（其他运行时错误） |
| 回灌策略（FeedbackInjector） | 失败时构造结构化反馈消息（含失败详情、分类、文件位置），作为 system 消息注入 messages[]，驱动下一轮 LLM 修正 |
| 深度实现 | ① 多轮修正追踪（`feedbackHistory` 记录每轮状态）；② 失败模式识别（同一测试重复失败时可检测）；③ 确定性测试（mock LLM 下注入失败 → 断言 agent 下一轮改变行为） |
| §A.4 合规 | 反馈闭环是**纯代码机制**——校验器、分类器、注入器都是确定性函数，不接受 LLM 参与；mock LLM 下可完全验证（`tests/feedback/classifier.test.ts`、`tests/feedback/validator.test.ts`、`tests/feedback/injector.test.ts`） |

### 3.4 治理护栏（危险动作拦截 + HITL）

| 项目 | 描述 |
|------|------|
| 危险动作定义 | 7 种模式：`rm -rf`（critical）、`git push --force`（high）、`DROP TABLE`（critical）、`sudo`（high）、写系统文件（critical）、删系统文件（critical）、curl/wget 外发请求（high） |
| 拦截机制 | `guardrail(toolName, args): GuardResult` 函数 —— 正则匹配 + 危险等级判定，**不依赖 LLM 判断**（§A.4-B/C） |
| HITL 审批（深度实现） | 主循环检测到拦截后，调用 `hitlCallback` → 服务端通过 WebSocket 推送 HITL 请求到 WebUI → WebUI 弹窗显示危险动作详情 → 用户选择：允许 / 拒绝 / 修改参数后允许 → 主循环根据响应执行或跳过 |
| 沙箱 | 工具执行目录限制在 `HARNESS_WORKSPACE` 环境变量指定的根目录内；文件工具路径经过路径遍历检查 |
| §A.4 合规 | `guardrail()` 是纯函数，输入 `{ command: "rm -rf /" }` 断言 `blocked: true`，每次结果一致；测试无需真实 LLM（`tests/guard/guardrail.test.ts`）；HITL 通过 `hitlCallback` 回调注入，mock LLM 下可测试（`tests/agent/hitl.test.ts`） |

### 3.5 记忆层（上下文与记忆）

| 项目 | 描述 |
|------|------|
| 存储 | SQLite 数据库（`better-sqlite3`），单表 `memories` |
| 存储内容 | `key`（唯一标识）、`value`（内容）、`category`（`convention` / `decision` / `preference`） |
| 检索方式 | 每次构建上下文时，`MemoryStore.list()` 获取全部记忆条目，按 `updated_at` 降序排列，注入到 system prompt 中（标注为"Project Memory"） |
| CRUD | `set(key, value, category)`（upsert）、`get(key)`、`list()`、`delete(key)` |
| §A.4 合规 | MemoryStore 是纯数据层，CRUD 操作不依赖 LLM；mock LLM 下可确定性测试（`tests/memory/store.test.ts`） |

### 3.6 配置层

| 项目 | 描述 |
|------|------|
| 配置格式 | `.rules` 文件（纯文本，每行一条规则） |
| 加载时机 | Agent 启动时由 `ConfigLoader.load(path)` 读取 |
| 注入方式 | 规则列表注入到 ContextBuilder，作为 system prompt 的"Project Rules"段落 |
| 示例规则 | `Use TypeScript`、`No any types`、`Test framework: vitest`、`Prefer arrow functions` |
| 边界条件 | 文件不存在 → 返回空数组，不报错；空行自动过滤 |
| §A.4 合规 | ConfigLoader 是纯 I/O 函数，不依赖 LLM；mock LLM 下可测试（`tests/config/loader.test.ts`） |

### 3.7 凭据管理

| 项目 | 描述 |
|------|------|
| 存储方案 | 优先 Windows Credential Manager（`keytar`），fallback 到 AES-256-GCM 加密文件 |
| 首次录入 | WebUI 引导页 → 隐藏输入框输入 API Key → 加密存储 → 提示"凭据已安全存储" |
| 查看状态 | 显示"已配置"或"未配置"，**绝不回显明文** |
| 更新/清除 | WebUI 支持重新录入或删除凭据 |
| 安全约束 | Key 绝不硬编码、绝不提交 Git、绝不写入日志（日志过滤 `sk-` 前缀）；内存中解密后使用完毕立即释放 |
| §A.4 合规 | CredentialStore 是纯存储接口，mock 下可测试（`tests/credentials/store.test.ts`） |

### 3.8 LLM 抽象层

| 项目 | 描述 |
|------|------|
| 接口 | `LLMProvider.chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>` |
| 实现 1 | `MockLLM`：预设响应序列（`LLMResponse[]`），按顺序返回，追踪 `receivedMessages`，用于确定性测试 |
| 实现 2 | `OpenAICompatibleProvider`：调用 OpenAI 兼容 API，支持自定义 `baseURL`（适配 njusehub 中转），自动重试 3 次 |
| 可扩展性 | 新增供应商只需实现 `LLMProvider` 接口，无需修改主循环 |
| §A.4 合规 | LLMProvider 是抽象接口，MockLLM 是核心测试基础设施——所有 harness 机制测试都通过 MockLLM 注入预设行为来验证 |

---

## 4. 非功能性需求

### 4.1 性能

- Agent 单轮循环（不含 LLM 调用）响应时间 < 100ms
- WebUI 页面加载时间 < 2s
- SQLite 记忆检索 < 50ms

### 4.2 安全（凭据威胁模型）

| 威胁 | 对策 |
|------|------|
| API Key 泄露到 Git | key 绝不硬编码，凭据存储独立于代码仓库；`.gitignore` 排除 `.env`、`credentials/`、`*.db` |
| 进程内存读取 | 凭据仅在调用 LLM 时解密到内存，使用后立即释放；进程退出时自动清除 |
| `.env` 文件泄露 | 不使用 `.env` 明文存储，优先用 OS 钥匙串（Windows Credential Manager） |
| 日志泄露 | 日志中过滤所有 `sk-` 开头的字符串及 Bearer token |
| 跨平台风险 | Windows CM 不可用时 fallback 到 AES-256-GCM 加密文件（随机 IV + 认证标签），主密码由用户通过 `HARNESS_MASTER_PASSWORD` 环境变量设定 |
| 传输安全 | WebSocket 连接支持 token 认证（`HARNESS_TOKEN` 环境变量） |

### 4.3 可用性

- WebUI 响应式设计，支持桌面浏览器（Chrome / Edge）
- 错误信息对用户友好，避免暴露内部堆栈
- 首次使用有引导流程（录入 API Key → 配置规则 → 开始使用）

### 4.4 可观测性

- 每轮 Agent 循环输出结构化日志（轮次、工具调用、执行结果、反馈状态）
- WebUI 通过 WebSocket 实时展示 Agent 行为流（状态推送 + 结果推送）
- 日志分级（debug/info/warn/error），通过 `LOG_LEVEL` 环境变量控制

---

## 5. 系统架构

### 5.1 组件图

```
┌─────────────────────────────────────────────────┐
│                  WebUI (React 18 + Vite)          │
│  聊天面板 (ChatPanel) · Agent 日志 (AgentLog)     │
│  HITL 审批弹窗 (HITLModal)                       │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket (ws)
┌──────────────────────┴──────────────────────────┐
│              Harness 内核 (TypeScript)            │
│                                                   │
│  ConfigLoader ──→ MemoryStore ──→ ContextBuilder │
│  (.rules)         (SQLite)         (组装 messages)│
│                                       │           │
│                                       ▼           │
│  ┌──────────────────────────────────────────┐    │
│  │           Agent Loop (主循环)              │    │
│  │                                          │    │
│  │  LLMProvider.chat()                      │    │
│  │    → 解析 tool_calls                     │    │
│  │    → guardrail() 护栏拦截                 │    │
│  │    → hitlCallback (HITL 审批)            │    │
│  │    → ToolDispatcher.dispatch()           │    │
│  │    → FeedbackValidator.validate()  ★     │    │
│  │    → FeedbackInjector.inject()     ★     │    │
│  │    → StopCondition.shouldStop()          │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  LLMProvider ── ToolDispatcher ── CredentialStore │
│  (mock/openai)  (7 tools)         (WinCM/AES)   │
└──────────────────────────────────────────────────┘
```

### 5.2 数据流（以"写一个 add 函数"为例）

```
用户输入 "写一个 add 函数"
  → ConfigLoader 加载 .rules 规则
  → MemoryStore 检索历史记忆
  → ContextBuilder 构建 messages[]（system prompt + 规则 + 记忆 + 工具定义 + 用户任务）
  → AgentLoop 第1轮:
      LLM.chat(messages) → 解析 → tool_calls: [write_file, run_test]
      → guardrail(write_file) → 安全，执行 → 文件写入成功
      → guardrail(run_test) → 安全，执行 → 测试输出: "FAIL: add(1,2) expected 3 got -1"
      → FeedbackValidator.validate() → 状态: fail, 分类: assertion
      → FeedbackInjector.inject() → 注入失败反馈到 messages
  → AgentLoop 第2轮:
      LLM.chat(messages + 反馈) → 解析 → tool_calls: [write_file(修正), run_test]
      → write_file 修正代码
      → run_test → 测试输出: "3 passed"
      → FeedbackValidator.validate() → 状态: pass
      → LLM 返回 finish_reason='stop' → StopCondition → 停机
  → 返回 RunResult { status: 'completed', rounds: 2 }
```

### 5.3 外部依赖

| 依赖 | 用途 | 替代方案 |
|------|------|---------|
| OpenAI 兼容 API（njusehub） | 真实 LLM 调用 | MockLLM（离线测试） |
| SQLite（better-sqlite3） | 记忆存储 | 无（嵌入式，零配置） |
| Windows Credential Manager（keytar） | 凭据安全存储 | AES-256-GCM 加密文件 |
| React 18 + Vite | WebUI 前端 | 无（CLI 模式下可独立运行 harness 内核） |
| WebSocket（ws） | 前后端实时通信 | 无（harness 内核可脱离 WebSocket 以编程方式调用） |
| Docker | 分发容器化 | 源码方式（`npm install && npm run dev`） |

---

## 6. 数据模型

### 6.1 Memory 表

```sql
CREATE TABLE memories (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  key        TEXT NOT NULL UNIQUE,
  value      TEXT NOT NULL,
  category   TEXT NOT NULL CHECK (category IN ('convention', 'decision', 'preference')),
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);
```

### 6.2 Agent 消息

```typescript
interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

interface LLMResponse {
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length';
}
```

### 6.3 反馈记录

```typescript
type FailureType = 'compile' | 'assertion' | 'timeout' | 'runtime';

interface TestFailure {
  testName: string;
  expected: string;
  received: string;
  file: string;
  line: number;
  type: FailureType;
  raw: string;
}

interface Feedback {
  status: 'pass' | 'fail';
  failures: TestFailure[];
  round: number;
  summary: string;
}
```

### 6.4 护栏结果

```typescript
interface GuardResult {
  blocked: boolean;
  reason?: string;
  severity?: 'high' | 'critical';
}

interface HITLRequest {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  severity: 'high' | 'critical';
}

interface HITLResponse {
  toolCallId: string;
  approved: boolean;
  modifiedArgs?: Record<string, unknown>;
}
```

---

## 7. 凭据与分发设计

### 7.1 凭据录入 / 更新 / 清除流程

```
首次使用:
  1. WebUI 引导页 → 输入 API Key（隐藏输入框，type="password"）
  2. 尝试写入 Windows Credential Manager（keytar.setPassword）
  3. 失败（非 Windows 或 keytar 不可用） → AES-256-GCM 加密写入本地文件
  4. 提示"凭据已安全存储"

更新:
  1. WebUI 设置页 → 输入新 Key
  2. 覆盖存储 → 提示"已更新"

清除:
  1. WebUI 设置页 → 点击"清除凭据"
  2. 删除存储 → 提示"已清除，下次使用需重新录入"

查看状态:
  1. WebUI 设置页 → 显示"已配置"或"未配置"
  2. 绝不回显明文 Key
```

### 7.2 分发形态

- **Docker 容器**（首选）：`docker build -t coding-agent-harness . && docker run -p 3000:3000 coding-agent-harness`
- 多阶段构建（webui-builder → backend-builder → runtime），最终镜像基于 `node:20-alpine`
- `docker-compose.yml` 包含一键启动配置
- 镜像可推送到 Docker Hub 或 GitHub Container Registry

### 7.3 目标平台

- Linux x86_64（Docker 容器）
- 浏览器访问 WebUI（Chrome / Edge）
- 开发环境：Windows / macOS / Linux（Node.js 20+）

### 7.4 Key 在目标机器的安全配置方式

| 方式 | 命令 / 说明 | 安全等级 |
|------|-----------|---------|
| 环境变量 | `docker run -e LLM_API_KEY=sk-xxx ...` | 中（容器内环境变量，不进入宿主机 shell history） |
| AES 加密文件 | 设置 `HARNESS_MASTER_PASSWORD`，通过 API 或 WebUI 录入 | 较高（AES-256-GCM，需主密码） |
| Windows CM | 自动检测并使用，无需额外配置 | 高（OS 级别加密） |

---

## 8. 领域与机制设计（§A.5 专属）

### 8.1 领域分析：Coding 场景下的四类机制

| 维度 | Coding 领域的具体表现 | 为什么这样设计 |
|------|---------------------|--------------|
| **动作 / 工具** | 读写文件（read_file / write_file / delete_file）、执行 shell 命令、代码搜索（ripgrep）、Git 操作（git_diff）、运行测试（run_test）——共 7 个工具 | 覆盖 coding agent 核心操作：探索代码库 → 修改代码 → 验证修改 |
| **客观反馈信号** | 测试结果（通过/失败）是最核心的客观信号：确定、可解析、可回灌。其次为 lint 输出、类型检查错误 | 测试输出是结构化、确定性的——"3 passed"或"FAIL: expected 3 got -1"——可被代码解析而无需 LLM 判断 |
| **危险动作** | `rm -rf`（递归删除）、`git push --force`（强制推送）、`DROP TABLE`（删库）、`sudo`（提权）、系统文件写入/删除、curl/wget 外发请求 | 这些操作一旦执行不可逆或造成安全风险，必须代码级拦截而非依赖 LLM 自觉 |
| **记忆需求** | 项目约定（类型系统、lint 规则）、历史决策（选型理由）、用户偏好（代码风格） | 跨会话保持一致性，但不全量载入——按需注入 system prompt |

### 8.2 重点维度：反馈闭环 ★（Main Contribution）

**为什么选反馈闭环：**

1. **天然由代码构成**（§A.4-D）：校验器解析测试输出、分类器做模式匹配、注入器构造消息——全程是确定性代码，最适合用 mock LLM 做确定性单元测试
2. **是 Agent 从"盲写"到"智能"的关键机制**：没有反馈闭环，Agent 只会写代码而无法验证；有了反馈闭环，Agent 能根据测试结果自我修正
3. **最能体现"移除 LLM 后还剩多少工程"的判据**（§A.4-C）：反馈闭环的全部逻辑（解析、分类、注入）不依赖 LLM，mock LLM 下完全可验证
4. **难度适中、实用性强、通用性高**：反馈闭环可复用到任何 coding agent 场景

**编码实现方案（呼应 §A.4）：**

```typescript
// === 校验器（FeedbackValidator）===
// 确定性代码：解析测试输出字符串 → 判定通过/失败
// Mock LLM 测试：传入 "FAIL: add(1,2) expected 3 got -1 at math.ts:3"
//   → 断言 status='fail', failures[0].type='assertion'
class FeedbackValidator {
  validate(testOutput: string, round: number, error?: string): Feedback {
    // 纯字符串解析，无 LLM 参与
    if (error) {
      return { status: 'fail', round, summary: `Tests failed: ${error}`,
               failures: [this.classifier.parseFailure(error)] };
    }
    if (testOutput.includes('FAIL')) {
      const failures = testOutput.split('\n')
        .filter(l => l.includes('FAIL'))
        .map(l => this.classifier.parseFailure(l));
      return { status: 'fail', round, summary: `${failures.length} test(s) failed`, failures };
    }
    return { status: 'pass', round, summary: 'All tests passed', failures: [] };
  }
}

// === 分类器（FailureClassifier）===
// 确定性代码：正则匹配 + 关键词分类
// Mock LLM 测试：传入 "error TS2322: Type 'string' is not assignable..."
//   → 断言 classify() 返回 'compile'
class FailureClassifier {
  classify(errorMessage: string): FailureType {
    if (/expected|Expected|assert/i.test(errorMessage)) return 'assertion';
    if (/TS\d{4}|compilation|syntax error/i.test(errorMessage)) return 'compile';
    if (/timeout|timed out/i.test(errorMessage)) return 'timeout';
    return 'runtime';
  }

  parseFailure(raw: string): TestFailure {
    // 正则提取：testName、expected、received、file、line
    const type = this.classify(raw);
    // ... 解析逻辑 ...
    return { testName, expected, received, file, line, type, raw };
  }
}

// === 注入器（FeedbackInjector）===
// 确定性代码：构造结构化消息字符串
// Mock LLM 测试：传入 Feedback{fail, [...]} → 断言消息包含 "Tests failed (Round 1)"
class FeedbackInjector {
  buildMessage(feedback: Feedback): string {
    if (feedback.status === 'pass') return `✅ ${feedback.summary}`;
    return [
      `❌ ${feedback.summary} (Round ${feedback.round}):`,
      ...feedback.failures.map(f =>
        `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.file}:${f.line}]`
      ),
      'Please analyze the failures and fix the code.',
    ].join('\n');
  }

  inject(messages: Message[], feedback: Feedback): Message[] {
    messages.push({ role: 'system', content: this.buildMessage(feedback) });
    return messages;
  }
}
```

**深度实现细节：**

1. **多轮修正追踪**：`feedbackHistory: Array<{ round: number; status: string }>` 记录每轮测试结果
2. **失败分类**：四类（compile / assertion / timeout / runtime），帮助 LLM 理解失败性质
3. **结构化回灌**：失败消息包含测试名、期望值、实际值、文件位置、行号——足够 LLM 定位并修正
4. **确定性验证**：`tests/integration/harness-demo.test.ts` 中 mock LLM 注入失败 → 断言 agent 收到反馈并改变行为

### 8.3 其他维度（最低实现，满足 §A.4-D"基础要完整"）

| 维度 | 实现方式 | 关键代码 | §A.4-C 单测验证 |
|------|---------|---------|---------------|
| 决策 | 自己编码的主循环（`AgentLoop.run()`），不依赖任何框架 | `src/agent/loop.ts` | `tests/agent/loop.test.ts`：mock LLM 下验证完整循环 |
| 工具 | 统一 `Tool` 接口 + `ToolDispatcher` 按名称路由 | `src/tools/base.ts` + `dispatcher.ts` | `tests/tools/dispatcher.test.ts`：断言分发到正确工具 |
| 记忆 | SQLite CRUD，自实现 `MemoryStore` | `src/memory/store.ts` | `tests/memory/store.test.ts`：set/get/delete 确定性验证 |
| 治理 | `guardrail()` 纯函数 + `hitlCallback` 回调 | `src/guard/guardrail.ts` | `tests/guard/guardrail.test.ts`：传入危险命令断言拦截 |
| 配置 | `.rules` 文件解析，`ConfigLoader.load()` | `src/config/loader.ts` | `tests/config/loader.test.ts`：断言规则加载正确 |

---

## 9. 实现边界：§A.4 合规性声明

> 本节明确声明每个机制如何满足 §A.4 的"机制必须是代码，不能是提示词"要求，以及 §A.4-C 的"移除 LLM 后还能用单测验证"判据。

### 9.1 (A) 必须自己实现，不得寄生于现成框架

| 组件 | 自实现证明 | 未使用框架 |
|------|----------|----------|
| Agent 主循环 | `src/agent/loop.ts` — 完整的 while 循环：LLM 调用 → 解析 → guardrail → dispatch → feedback → stop | 未使用 LangChain AgentExecutor、AutoGen、CrewAI、LlamaIndex agent 或任何编码智能体 SDK 的 agent runner |
| LLM 抽象层 | `src/llm/provider.ts` — `LLMProvider` 接口；`MockLLM` 可注入 mock | 仅使用底层 OpenAI 兼容 API（`openai` npm 包的 chat completion），不依赖其 agent 循环 |
| 工具分发 | `src/tools/dispatcher.ts` — 自实现 `ToolDispatcher`，按名称路由 | 未使用框架的 tool executor |
| 治理护栏 | `src/guard/guardrail.ts` — 自实现 `guardrail()` 函数 | 未使用框架的 guard 机制 |
| 反馈闭环 | `src/feedback/` — 自实现 `Validator`、`Classifier`、`Injector` | 未使用框架的 feedback 机制 |

### 9.2 (B) 机制必须是代码，不能是提示词——逐机制对比

| 机制 | 提示词版（不算实现） | 代码版（本项目实现） | 代码位置 |
|------|-------------------|-------------------|---------|
| 危险动作拦截 | 在 system prompt 中写"不要执行 rm -rf" | `guardrail(action)` 函数：正则匹配 → 返回 blocked: true | `src/guard/guardrail.ts` |
| 反馈信号 | 让 LLM 自己检查测试结果是否正确 | `FeedbackValidator.validate()`：解析测试输出字符串 → 客观判定 pass/fail | `src/feedback/validator.ts` |
| 失败分类 | 让 LLM 判断失败类型 | `FailureClassifier.classify()`：正则匹配 + 关键词判定 | `src/feedback/classifier.ts` |
| 记忆检索 | 让 LLM 回忆历史决策 | `MemoryStore.list()`：SQLite 查询，确定性返回 | `src/memory/store.ts` |
| 停机判断 | 让 LLM 自己决定何时停止 | `StopCondition.shouldStop()`：轮数比较 + finish_reason 检查 | `src/agent/stop-condition.ts` |
| 配置注入 | 让 LLM 遵守规则 | `ConfigLoader.load()`：读取文件 → 注入 system prompt 的"Project Rules"段落 | `src/config/loader.ts` |

### 9.3 (C) 判定标准：移除真实 LLM 后，机制还能用单测验证吗？

| 机制 | Mock LLM 单测 | 测试文件 | 验证内容 |
|------|-------------|---------|---------|
| 工具分发 | ✅ | `tests/tools/dispatcher.test.ts` | 按名称路由到正确工具；未知工具抛异常 |
| 治理拦截 | ✅ | `tests/guard/guardrail.test.ts` | 传入 `rm -rf /` → 断言 blocked: true；传入 `npm test` → 断言 blocked: false |
| 反馈回灌 | ✅ | `tests/feedback/validator.test.ts`、`classifier.test.ts`、`injector.test.ts` | 传入测试输出字符串 → 断言解析结果、分类正确、消息格式正确 |
| 记忆读写 | ✅ | `tests/memory/store.test.ts` | set → get → 断言值一致；delete → get → 断言 undefined |
| 停机判断 | ✅ | `tests/agent/stop-condition.test.ts` | 传入轮数和 finish_reason → 断言 shouldStop 正确 |
| 主循环 | ✅ | `tests/agent/loop.test.ts` | Mock LLM 预设响应 → 断言循环完成、轮数正确 |
| 反馈闭环（完整） | ✅ | `tests/integration/harness-demo.test.ts` | 注入失败 → 断言 agent 收到反馈、改变行为、最终通过 |

### 9.4 (D) 基础要完整，重点要深入

- **六个维度全部有可运行的最低实现**：决策（主循环）、工具（7 个工具 + 分发器）、记忆（SQLite CRUD）、治理（7 种危险模式 + HITL）、反馈（校验器 + 分类器 + 注入器）、配置（.rules 加载器）
- **重点维度：反馈闭环** — 深入实现了多轮修正追踪、四类失败分类、结构化回灌、确定性验证（详见 §8.2）

---

## 10. 技术选型与理由

| 技术 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript 5.4+ | LLM SDK 生态最完善；vitest mock 机制最强；前后端统一语言减少上下文切换；严格类型检查减少运行时错误 |
| 运行时 | Node.js 22 | 满足 `openai` 引擎要求；Docker `node:22-alpine` |
| 测试 | Vitest 1.6 | 原生 TypeScript 支持；mock 机制强大；与 Vite 共享配置 |
| 记忆存储 | SQLite（better-sqlite3） | 零配置、嵌入式、无需额外进程；满足最低实现要求 |
| 凭据存储 | keytar（Windows CM，optional）+ AES-256-GCM | Windows CM 优先；AES-256-GCM 跨平台 fallback；Linux 容器省略 keytar |
| WebSocket | ws | 轻量（无额外依赖）；前后端实时通信 |
| 前端 | React 18 + Vite | 生态成熟；HMR 开发体验好；承接 Open Design 产物 |
| 前端设计 | Open Design + Harness Terminal | 见 §10.1 |
| LLM | OpenAI 兼容 API | 可插拔，支持自定义 baseURL（适配 njusehub 中转）；MockLLM 用于离线测试 |
| 分发 | Docker（多阶段构建） | 一键部署；环境隔离；`node:22-alpine` 最小镜像 |

### 10.1 前端设计系统（Open Design）

本项目 WebUI 按课程通用要求 §3.6，使用 **[Open Design](https://github.com/nexu-io/open-design)** 进行界面开发，并在此说明所选设计系统与 skill。

| 项 | 选型 | 说明 |
|----|------|------|
| 工具链 | [Open Design](https://github.com/nexu-io/open-design) | brief → design system → artifact → 迁入 `webui/` |
| 设计系统 | **Harness Terminal** | 高对比终端风（近黑底、终端绿强调、等宽字体、低圆角） |
| 设计合同 | `webui/DESIGN.md` | 色板、字体、布局、组件与动效 token |
| Open Design skill | prototype / live-artifact | 产出控制台结构与视觉方向 |
| Cursor skill | `emil-design-eng` | 按钮 press、HITL 入场、连接 LED pulse 等交互打磨（ease-out，&lt;300ms） |
| 实现落点 | `webui/src/` | `styles.css` + `ChatPanel` / `AgentLog` / `HITLModal` |

**不做：** 多主题切换、重型 UI 组件库、营销落地页。WebUI 定位为单页 Operator Console；Harness 内核可在无 UI 下独立测试。

设计过程纪要：`docs/superpowers/specs/2026-08-07-harness-terminal-ui-design.md`。

---

## 11. 验收标准

| # | 对应需求 | 验收标准 | 验证方式 |
|---|---------|---------|---------|
| 1 | Agent 主循环 | 输入编码任务 → Agent 自动完成多轮修正 → WebUI 展示完整过程 | 启动服务 → WebUI 输入任务 → 观察 Agent 行为流 |
| 2 | 反馈闭环（★ Main Contribution） | Mock LLM 下确定性验证：注入失败 → Agent 修正 → 通过，每次结果一致 | `npm test` → `tests/integration/harness-demo.test.ts` 通过 |
| 3 | 治理护栏 + HITL | 输入危险命令 → WebUI 弹出审批窗口 → 拒绝后 Agent 不执行 | `npm test` → `tests/guard/guardrail.test.ts` + `tests/agent/hitl.test.ts` 通过 |
| 4 | 凭据管理 | 首次录入 Key → 关闭重启 → 无需重新输入 | `tests/credentials/store.test.ts` 通过 |
| 5 | 一键测试（含 mock LLM） | `npm test` 全部通过，所有核心机制测试不依赖网络与真实 LLM | CI 中 `npm test` 绿色 |
| 6 | Docker 分发 | `docker build && docker run` 启动，`curl localhost:3000/health` 返回 200 | CI 中 `docker build` 成功 |
| 7 | 线上部署 | 提供公网 URL，WebUI 正常运行 | Render 部署后浏览器访问 URL |
| 8 | 机制演示（§A.6） | 在 mock LLM 下确定性复现：① 护栏拦截一个危险动作；② 注入失败 → 反馈闭环使 agent 改变行为；③ 重点维度（反馈闭环）的确定性行为 | `tests/integration/harness-demo.test.ts` 包含三个测试用例，mock LLM 下每次结果一致 |

---

## 12. 风险与未决问题

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM API 不稳定（njusehub 中转） | Agent 无法正常运行 | Mock LLM 测试不依赖外部 API；真实运行可切换供应商（修改 `LLM_BASE_URL`） |
| keytar 在 Windows 上的兼容性 | 凭据存储不可用 | 已验证 AES-256-GCM 加密文件 fallback 可用；`tests/credentials/` 覆盖两种方案 |
| 反馈闭环复杂度超预期 | 难以在 mock 下完成完整的失败分类 | 先做 pass/fail 基础校验（Task 9），再做失败分类和多轮追踪（Task 10），渐进式实现 |
| Docker 镜像体积过大 | 分发体验差（下载慢） | 多阶段构建（webui-builder → backend-builder → runtime）；node:alpine 基础镜像；仅复制生产依赖 |
| 单用户架构限制 | 无法支持多用户并发 | 当前版本明确为单用户；架构上 AgentLoop 是无状态的（可扩展为多实例） |
| WebSocket 断连 | 前端丢失实时更新 | 前端 `useWebSocket` hook 包含重连逻辑；状态在重连后可从服务端恢复 |
| 前端设计工作量 | 延期 | 使用 Open Design 的 `emil-design-eng` skill 加速 UI 开发；核心机制在 CLI 下可独立测试，UI 为锦上添花 |

---

> **SPEC 版本**：v2.1（补充 Open Design / Harness Terminal 前端设计系统说明）  
> **最后更新**：2026-08-07