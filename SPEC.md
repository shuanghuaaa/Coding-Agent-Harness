# SPEC.md — Coding Agent Harness

> *Spec-Driven, Subagent-Built, Human-Owned.*  
> 项目：AI4SE 期末项目 · A · Coding Agent Harness

---

## 1. 问题陈述

### 1.1 要解决的问题

当前编码智能体（Cursor、Claude Code、Copilot 等）虽然能完成大部分编码工作，但多数开发者对其内部机制缺乏理解——它们如何组织上下文、如何解析动作、如何确保安全、如何从错误中自我修正。本项目不是为开发者提供另一个"帮你写代码"的工具，而是**构建一个透明的、可观测的、机制可验证的 Coding Agent Harness**，让使用者看清 Agent 的每一个决策环节。

### 1.2 目标用户

- 学习 AI4SE 的学生，希望通过实操理解 Agent = LLM + Harness 的工程本质
- 对 Agent 内部机制感兴趣的开发者

### 1.3 为什么值得做

当 LLM 能完成大部分"思考"时，工程师的价值落在 Harness 这层工程（治理、反馈、上下文、安全、分发）。本项目通过"用一个 Harness（Superpowers）去造另一个 Harness"的方式，让开发者对这套方法论形成第一手的批判性理解。

---

## 2. 用户故事

| # | 用户故事 | INVEST 验证 |
|---|---------|------------|
| 1 | 作为开发者，我可以通过 WebUI 输入一个编码任务，Agent 自动完成代码编写、测试和修正 | 独立可测 |
| 2 | 作为开发者，我可以看到 Agent 的每一步操作（工具调用、执行结果、反馈闭环修正过程） | 独立可测 |
| 3 | 作为开发者，当 Agent 尝试执行危险命令时，系统会弹出审批窗口，我可以选择允许、拒绝或修改参数 | 独立可测 |
| 4 | 作为开发者，我可以在首次使用时安全录入 API Key，系统会加密存储，且后续无需重复输入 | 独立可测 |
| 5 | 作为开发者，我可以通过 Docker 一键部署整个系统，包括 WebUI 和 Harness 内核 | 独立可测 |

---

## 3. 功能规约

### 3.1 Agent 主循环

| 项目 | 描述 |
|------|------|
| 输入 | 用户自然语言编码任务 |
| 行为 | 组织上下文 → 调用 LLM → 解析动作 → 护栏拦截 → 分发执行 → 反馈闭环 → 停机判断 |
| 输出 | 编码结果（文件修改）+ 过程日志 |
| 边界条件 | 最大轮数（默认 10 轮）可配置；用户可随时终止 |
| 错误处理 | LLM 调用失败重试 3 次；工具执行失败回灌错误信息给 LLM |

### 3.2 工具层

| 工具 | 功能 | 输入 | 输出 |
|------|------|------|------|
| `read_file` | 读取文件内容 | 文件路径 | 文件内容字符串 |
| `write_file` | 创建/覆盖文件 | 路径 + 内容 | 成功/失败 |
| `delete_file` | 删除文件 | 路径 | 成功/失败 |
| `shell` | 执行 shell 命令 | 命令字符串 | stdout + stderr + exit code |
| `search` | 代码搜索 (grep) | 搜索模式 + 路径 | 匹配行列表 |
| `git_diff` | 查看 git 变更 | 无 | diff 输出 |
| `run_test` | 运行测试并解析结果 | 测试命令 | 通过/失败 + 详细失败信息 |

### 3.3 反馈闭环 ★（Main Contribution）

| 项目 | 描述 |
|------|------|
| 触发条件 | 每次工具执行后，如果是 `run_test` 工具 |
| 校验器 | 解析测试输出，判定通过/失败，提取失败详情（测试名、期望值、实际值、文件、行号） |
| 失败分类 | 编译错误 / 测试断言失败 / 运行时错误 / 超时 |
| 回灌策略 | 失败时构造结构化反馈消息，注入到 LLM 上下文，驱动下一轮修正 |
| 深度实现 | 多轮修正追踪（记录每轮失败信息 → 修正动作 → 再测试结果）；失败模式识别（同一错误重复出现的检测） |
| 确定性验证 | 全部在 mock LLM 下验证，不依赖真实 API |

### 3.4 治理护栏

| 项目 | 描述 |
|------|------|
| 危险动作定义 | `rm -rf`、`git push --force`、`DROP TABLE`、`sudo`、任意修改系统文件（`/etc/`、`C:\Windows\`）、对外网络请求 |
| 拦截机制 | `guardrail(action)` 函数，正则匹配 + 危险等级判定 |
| HITL 审批 | WebUI 弹窗显示危险动作详情 → 用户选择允许/拒绝/修改参数 → 结果回传给主循环 |
| 沙箱 | 工具执行目录限制在项目根目录内，无法越界访问 |

### 3.5 记忆层

| 项目 | 描述 |
|------|------|
| 存储 | SQLite 数据库 |
| 存储内容 | 项目约定（如"使用 TypeScript""遵循 ESLint 规则"）、历史决策（如"上次选择用 axios 而不是 fetch"）、用户偏好 |
| 检索方式 | 每次构建上下文时，按关键词匹配检索相关记忆，注入到 system prompt |
| CRUD | 支持新增、更新、删除记忆条目 |

### 3.6 配置层

| 项目 | 描述 |
|------|------|
| 配置格式 | `.rules` 文件（Markdown 格式，声明式规则） |
| 加载时机 | Agent 启动时加载 |
| 注入方式 | 规则内容注入到 system prompt 中 |
| 示例规则 | "始终使用 TypeScript""禁止使用 any 类型""测试框架使用 vitest" |

### 3.7 凭据管理

| 项目 | 描述 |
|------|------|
| 存储方案 | 优先 Windows Credential Manager，fallback 到 AES-256-GCM 加密文件 |
| 首次录入 | WebUI 引导用户输入 API Key（隐藏输入框），加密存储 |
| 查看状态 | 显示"已配置"或"未配置"，不回显明文 |
| 更新/清除 | WebUI 支持重新录入或删除凭据 |

### 3.8 LLM 抽象层

| 项目 | 描述 |
|------|------|
| 接口 | `LLMProvider.chat(messages: Message[]): Promise<LLMResponse>` |
| 实现 1 | `MockLLM`：预设响应序列，用于确定性测试 |
| 实现 2 | `OpenAICompatibleLLM`：调用 OpenAI 兼容 API（支持自定义 Base URL） |
| 可扩展性 | 新增供应商只需实现 `LLMProvider` 接口 |

---

## 4. 非功能性需求

### 4.1 性能

- Agent 单轮循环（不含 LLM 调用）响应时间 < 100ms
- WebUI 页面加载时间 < 2s
- SQLite 记忆检索 < 50ms

### 4.2 安全（凭据威胁模型）

| 威胁 | 对策 |
|------|------|
| API Key 泄露到 Git | key 绝不硬编码，凭据存储独立于代码仓库 |
| 进程内存读取 | 凭据仅在调用 LLM 时解密到内存，使用后立即释放 |
| `.env` 文件泄露 | 不使用 `.env` 明文存储，优先用 OS 钥匙串 |
| 日志泄露 | 日志中过滤所有 `sk-` 开头的字符串 |
| 跨平台风险 | Windows CM 不可用时 fallback 到 AES 加密文件，主密码由用户设定 |

### 4.3 可用性

- WebUI 响应式设计，支持桌面浏览器
- 错误信息对用户友好，避免暴露内部堆栈
- 首次使用有引导流程（录入 API Key → 配置规则 → 开始使用）

### 4.4 可观测性

- 每轮 Agent 循环输出结构化日志（轮次、工具调用、执行结果、反馈状态）
- WebUI 实时展示 Agent 行为流
- 错误/警告分级显示

---

## 5. 系统架构

### 5.1 组件图

```
┌─────────────────────────────────────────────────┐
│                  WebUI (React)                    │
│  聊天面板 · 文件浏览 · 终端输出 · HITL 审批弹窗    │
└──────────────────────┬──────────────────────────┘
                       │ WebSocket
┌──────────────────────┴──────────────────────────┐
│              Harness 内核 (TypeScript)            │
│                                                   │
│  Config ──→ Memory ──→ ContextBuilder            │
│                              │                    │
│                              ▼                    │
│  ┌──────────────────────────────────────────┐    │
│  │           Agent Loop (主循环)              │    │
│  │  LLM.call → parse → guardrail → dispatch  │    │
│  │     ↑                        │            │    │
│  │     │    Feedback Loop ★     │            │    │
│  │     └── validate ← inject ──┘            │    │
│  │              ↓                             │    │
│  │         stop? → done / continue            │    │
│  └──────────────────────────────────────────┘    │
│                                                   │
│  LLMProvider ── ToolDispatcher ── CredentialStore │
│  (mock/real)    (files/shell/   (WinCM/AES)      │
│                  search/git/test)                  │
└──────────────────────────────────────────────────┘
```

### 5.2 数据流

```
用户输入 "写一个 add 函数"
  → Config 注入 .rules
  → Memory 检索历史
  → ContextBuilder 构建 messages[]
  → AgentLoop 第1轮:
      LLM → 解析 → guardrail(安全) → write_file → run_test → 失败
      → FeedbackLoop 注入失败信息
  → AgentLoop 第2轮:
      LLM(带反馈) → 解析 → guardrail(安全) → write_file(修正) → run_test → 通过
      → stop → 返回结果
```

### 5.3 外部依赖

| 依赖 | 用途 |
|------|------|
| OpenAI 兼容 API（njusehub） | 真实 LLM 调用 |
| SQLite（better-sqlite3） | 记忆存储 |
| Windows Credential Manager（node-keytar） | 凭据安全存储 |
| React + Vite | WebUI 前端 |
| WebSocket（ws） | 前后端实时通信 |
| Docker | 分发容器化 |

---

## 6. 数据模型

### 6.1 Memory 表

```sql
CREATE TABLE memories (
  id        INTEGER PRIMARY KEY AUTOINCREMENT,
  key       TEXT NOT NULL,
  value     TEXT NOT NULL,
  category  TEXT NOT NULL,  -- 'convention' | 'decision' | 'preference'
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
```

### 6.3 反馈记录

```typescript
interface FeedbackRecord {
  round: number;
  testResult: 'pass' | 'fail';
  failures?: TestFailure[];
  actionTaken: string;  // agent 的修正动作
  resolved: boolean;
}

interface TestFailure {
  testName: string;
  expected: string;
  received: string;
  file: string;
  line: number;
}
```

---

## 7. 凭据与分发设计

### 7.1 凭据录入 / 更新 / 清除流程

```
首次使用:
  1. WebUI 引导页 → 输入 API Key（隐藏输入框）
  2. 尝试写入 Windows Credential Manager
  3. 失败 → AES-256-GCM 加密写入本地文件
  4. 提示"凭据已安全存储"

更新:
  1. WebUI 设置页 → 输入新 Key
  2. 覆盖存储 → 提示"已更新"

清除:
  1. WebUI 设置页 → 点击"清除凭据"
  2. 删除存储 → 提示"已清除，下次使用需重新录入"
```

### 7.2 分发形态

- **Docker 容器**：`docker build` + `docker run` 一键启动
- 镜像推送到 Docker Hub 或 GitHub Container Registry
- `docker-compose.yml` 包含 WebUI + Harness 后端

### 7.3 目标平台

- Linux x86_64（Docker 容器）
- 浏览器访问 WebUI（Chrome / Edge）

---

## 8. 领域与机制设计（Coding Agent Harness 专属）

### 8.1 领域分析

| 维度 | Coding 领域的具体表现 |
|------|---------------------|
| **动作 / 工具** | 读写文件、执行 shell 命令、运行构建与测试、代码搜索、Git 操作 |
| **客观反馈信号** | 测试结果（通过/失败）、lint 输出、类型检查错误、编译错误 |
| **危险动作** | `rm -rf`、`git push --force`、`DROP TABLE`、`sudo`、修改系统文件、对外网络请求 |
| **记忆需求** | 项目约定（类型系统、lint 规则）、历史决策（选型理由）、用户偏好 |

### 8.2 重点维度：反馈闭环 ★

**为什么选反馈闭环：**
- 天然由代码构成，最适合用 mock LLM 做确定性单元测试
- 是 Agent 从"盲写"到"智能"的关键机制
- 难度适中、实用性强、通用性高
- 最能体现"移除 LLM 后还剩多少工程"的判据

**编码实现方案：**

```typescript
// 校验器：解析测试输出，客观判定通过/失败
class FeedbackValidator {
  validate(testOutput: string): Feedback {
    // 解析 JSON 测试报告
    const report = parseTestReport(testOutput);
    if (report.passed) return { status: 'pass' };
    
    return {
      status: 'fail',
      failures: report.failures.map(this.classifyFailure),
      round: this.currentRound
    };
  }
  
  private classifyFailure(f: RawFailure): TestFailure {
    // 失败分类：编译错误 vs 断言失败 vs 运行时错误 vs 超时
    const type = f.message.includes('expected') ? 'assertion'
      : f.message.includes('compilation') ? 'compile'
      : f.message.includes('timeout') ? 'timeout'
      : 'runtime';
    return { ...f, type };
  }
}

// 回灌器：将反馈注入到 Agent 上下文
class FeedbackInjector {
  inject(loop: AgentLoop, feedback: Feedback): void {
    if (feedback.status === 'fail') {
      const message = this.buildFeedbackMessage(feedback);
      loop.addMessage({ role: 'system', content: message });
    }
  }
  
  private buildFeedbackMessage(fb: Feedback): string {
    return [
      `Tests failed (Round ${fb.round}):`,
      ...fb.failures.map(f => 
        `- ${f.testName}: expected ${f.expected}, got ${f.received} [${f.file}:${f.line}]`
      ),
      'Please analyze the failures and fix the code.'
    ].join('\n');
  }
}
```

### 8.3 其他维度（最低实现）

| 维度 | 实现方式 | 关键代码 |
|------|---------|---------|
| 决策 | 自己编码的主循环，不依赖框架 | `AgentLoop.run()` |
| 工具 | 统一 `Tool` 接口 + `ToolDispatcher` | `interface Tool { name, execute(args) }` |
| 记忆 | SQLite 存取 key-value | `MemoryStore.get/set/delete` |
| 治理 | `guardrail()` 函数 + HITL WebUI 弹窗 | `guardrail(action): boolean` |
| 配置 | `.rules` 文件解析 | `ConfigLoader.load(path)` |

---

## 9. 技术选型与理由

| 技术 | 选型 | 理由 |
|------|------|------|
| 语言 | TypeScript | LLM SDK 生态最完善，vitest mock 机制最强，前后端统一语言 |
| 运行时 | Node.js 20+ | LTS 稳定，Docker 镜像小 |
| 前端 | React 18 + Vite | 生态成熟，Open Design 支持 |
| 测试 | Vitest | 原生 TypeScript 支持，mock 机制强大 |
| 记忆存储 | SQLite (better-sqlite3) | 零配置，嵌入式，满足最低实现 |
| 凭据存储 | keytar + AES-256-GCM | Windows CM 优先，跨平台 fallback |
| WebSocket | ws | 轻量，前后端实时通信 |
| LLM | OpenAI 兼容 API | 可插拔，支持 njusehub 中转 |
| 分发 | Docker | 一键部署，环境隔离 |
| 前端设计 | Open Design | 课程推荐，提供设计系统 skill |

---

## 10. 验收标准

| # | 功能 | 验收标准 |
|---|------|---------|
| 1 | Agent 主循环 | 输入编码任务，Agent 自动完成多轮修正，WebUI 展示完整过程 |
| 2 | 反馈闭环 | Mock LLM 下确定性验证：注入失败 → Agent 修正 → 通过，每次结果一致 |
| 3 | 治理护栏 | 输入危险命令，WebUI 弹出审批窗口，拒绝后 Agent 不执行 |
| 4 | 凭据管理 | 首次录入 Key → 关闭重启 → 无需重新输入 |
| 5 | 一键测试 | `npm test` 通过，含 mock LLM 单元测试 |
| 6 | Docker 分发 | `docker build && docker run` 启动，WebUI 可访问 |
| 7 | 线上部署 | 提供公网 URL，WebUI 正常运行 |

---

## 11. 风险与未决问题

| 风险 | 影响 | 缓解措施 |
|------|------|---------|
| LLM API 不稳定（njusehub） | Agent 无法正常运行 | Mock LLM 测试不依赖外部 API；真实运行可切换供应商 |
| WebUI 前端工作量被低估 | 延期 | 先用简约 UI，核心机制在 CLI 下可独立测试 |
| 反馈闭环复杂度超预期 | 难以在 mock 下完成确定性验证 | 先做 pass/fail 基础校验，再做失败分类和多轮追踪 |
| Docker 镜像体积过大 | 分发体验差 | 多阶段构建，node:alpine 基础镜像 |
| 凭据存储跨平台兼容 | Windows CM 节点库不稳定 | 提前测试 keytar 在 Windows 上的行为，确保 AES fallback 可用 |