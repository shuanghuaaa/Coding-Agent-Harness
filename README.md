# Coding Agent Harness

> AI4SE 期末项目 · A · Coding Agent Harness  
> **Agent = LLM + Harness** — 将 LLM 封装成一台能稳定、可靠编码的机器。

Coding Agent Harness 是一个以 **反馈闭环** 为核心贡献的编码智能体系统。它封装 LLM，提供工具、治理护栏、记忆、反馈闭环、多角色编排和 CaseAI 风格 WebUI，让使用者看清 Agent 的每一个决策与修正环节。

## 目录

- [快速开始](#快速开始)
- [安装与运行](#安装与运行)
- [分发方式 (Docker)](#分发方式-docker)
- [API Key 安全配置](#api-key-安全配置)
- [安全边界](#安全边界)
- [目录结构](#目录结构)
- [核心机制](#核心机制)
- [机制演示](#机制演示)
- [WebUI](#webui)
- [测试与 CI](#测试与-ci)
- [云部署](#云部署)
- [已知限制](#已知限制)
- [文档索引](#文档索引)

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/shuanghuaaa/Coding-Agent-Harness.git
cd Coding-Agent-Harness

# 2. 安装依赖
npm install
cd webui && npm install && cd ..

# 3. 构建 WebUI
cd webui && npm run build && cd ..

# 4. 运行（使用 Mock LLM，无需 API Key）
npm run dev

# 5. 打开浏览器访问 http://localhost:3000
```

## 安装与运行

### 前置条件

- Node.js >= 20
- npm >= 9

### 使用真实 LLM

```bash
# 使用 OpenAI 兼容 API
LLM_PROVIDER=openai \
LLM_API_KEY=sk-your-key-here \
LLM_MODEL=gpt-4o-mini \
npm run dev

# 使用自定义 API 端点（如 Azure、Ollama、本地模型等）
LLM_PROVIDER=openai \
LLM_API_KEY=your-key \
LLM_BASE_URL=https://your-endpoint.com/v1 \
LLM_MODEL=your-model \
npm run dev
```

支持的环境变量：

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `LLM_PROVIDER` | LLM 提供商（`openai` 或 `mock`） | `mock` |
| `LLM_API_KEY` | API 密钥 | — |
| `LLM_MODEL` | 模型名称 | `gpt-4o` |
| `LLM_BASE_URL` | API 端点 URL | `https://api.openai.com/v1` |
| `HARNESS_WORKSPACE` | 工具操作的工作区根目录 | 当前目录 |
| `HARNESS_MASTER_PASSWORD` | AES 加密凭证的主密码 | — |
| `PORT` | 服务器端口 | `3000` |
| `LOG_LEVEL` | 日志级别（debug/info/warn/error） | `info` |

### 开发模式

```bash
# 后端热重载
npm run dev

# 前端热重载
cd webui && npm run dev  # 访问 http://localhost:5173

# 运行测试
npm test
```

## 分发方式 (Docker)

```bash
# 构建镜像
docker build -t coding-agent-harness .

# 运行容器
docker run -p 3000:3000 \
  -e LLM_PROVIDER=openai \
  -e LLM_API_KEY=sk-your-key \
  -v ./data:/app/data \
  coding-agent-harness

# 使用 docker-compose
docker-compose up
```

## API Key 安全配置

### 方式一：环境变量（开发环境）

通过 `.env` 文件或命令行设置。注意：`.env` 为明文存储，命令行 `export` 会进入 shell 历史记录。

### 方式二：AES 加密文件（跨平台）

```bash
# 设置主密码
export HARNESS_MASTER_PASSWORD="your-strong-password"

# 启动后，通过 API 或 WebUI Settings 存储密钥
curl -X POST http://localhost:3000/api/credentials \
  -H "Content-Type: application/json" \
  -d '{"service":"llm","account":"openai","password":"sk-your-key"}'
```

### 方式三：Windows 凭据管理器（Windows）

在 Windows 上自动使用 `keytar` 库调用 Windows Credential Manager 存储密钥。

### 威胁模型

- 密钥绝不硬编码在源码中
- 密钥绝不提交到 Git（已配置 `.gitignore`）
- 密钥绝不写入日志
- AES 加密使用 AES-256-GCM，随机 IV + 认证标签
- 内存中的密钥在进程退出时自动清除

## 安全边界

- 工具默认限制在 `HARNESS_WORKSPACE` 工作区内，文件路径做遍历检查
- 危险 shell / 系统路径 / 外发请求等由 `guardrail` 拦截，可经 HITL 审批
- 当前 WebUI 与 WebSocket 不设应用层访问令牌，公网部署依赖平台 HTTPS，适合单用户演示
- 仓库与镜像中不得包含真实 API Key；日志过滤 `sk-` 等敏感模式
- Mock LLM 模式可在无密钥环境下完整跑通单测与本地演示

## 目录结构

```
Coding-Agent-Harness/
├── src/
│   ├── agent/          # Agent 主循环、上下文构建、停止条件
│   ├── llm/            # LLM 抽象层（MockLLM、OpenAI 兼容）
│   ├── tools/          # 工具系统（文件、Shell、搜索、Git、测试）
│   ├── feedback/       # 反馈闭环（校验、分类、注入、摘要、重复失败、多框架解析器）
│   ├── guard/          # 治理护栏（危险动作拦截，可配置规则）
│   ├── memory/         # 记忆存储（SQLite）+ 关键词检索
│   ├── orchestration/  # 多角色编排（Coder / Reviewer / Tester）
│   ├── config/         # 配置加载器（.rules）
│   ├── credentials/    # 凭证存储（AES 文件、Windows CM）
│   ├── server/         # HTTP + WebSocket 服务器、会话持久化
│   ├── workspace/      # 工作区浏览、读文件、检查点
│   └── utils/          # 日志工具
├── webui/              # React + Vite 前端（CaseAI 浅色操作台）
│   └── src/
│       ├── api/        # sessions / credentials / workspace / checkpoint
│       ├── components/ # FeedbackTrail, TaskRoundList, TestFileSnippet, HITLModal 等
│       └── hooks/      # WebSocket（自动重连）与会话列表
├── tests/              # 约 41 个测试文件、约 185 个用例（Mock LLM，无网络）
├── docs/superpowers/   # 设计规格与实现计划
├── .github/workflows/  # CI（含测试与 Docker build）
├── Dockerfile
├── docker-compose.yml
├── SPEC.md             # 设计规格
└── README.md
```

## 核心机制

### 1. Agent 主循环

自实现的 Agent 主循环：组织上下文 → 调用 LLM → 解析动作 → 分发执行 → 回灌结果 → 停机判断。不依赖任何 Agent 编排框架。

### 2. 反馈闭环（★ 主要贡献）

确定性校验器 + 失败分类 + 多轮自我修正，并可在 WebUI 中「讲故事」：

- **FailureClassifier**：`compile` / `assertion` / `timeout` / `runtime`
- **FeedbackValidator**：解析测试输出，判定通过/失败；可插拔解析器（vitest / jest / mocha / generic）
- **FeedbackInjector**：将失败摘要、分类、`file:line`、重复失败警告注入 LLM 上下文
- **重复失败检测**：同一测试连续失败时标记 `repeatedFailure` 并写入注入文案
- **结构化 history**：`feedbackHistory` 含 `summary`、`failureTypes`、`failures`、`repeatedFailure`
- **UI**：`FeedbackTrail` 时间线 + 失败时可拉取测试文件片段（`TestFileSnippet`）

### 3. 多角色编排

- 角色：`coder`（可写）、`reviewer`（只读审查）、`tester`（跑测）
- 会话内可多选 1～3 个角色；1 个走单角色 loop，2～3 个按 coder → reviewer → tester 顺序编排
- 项目页点击角色卡片即可打开预勾该角色的会话（无独立编排侧栏）

### 4. 治理护栏 + HITL

- 危险动作模式拦截（含可配置的 `guardrail.config.json`）
- HITL 审批：拦截后经 WebUI 弹窗允许 / 拒绝 / 改参后允许

### 5. 工具系统

- 文件操作（read/write/delete）— 带路径遍历沙箱
- Shell 命令执行 — 异步、超时保护
- 代码搜索 — ripgrep + Node.js 回退
- Git diff
- 测试运行（触发反馈闭环）

### 6. 记忆（SQLite）

- 跨会话存储项目约定、历史决策、偏好设置
- `KeywordRetriever` 按任务关键词检索后注入上下文（非全量硬塞）

## 机制演示

对应作业 §A.6，入口：`tests/integration/harness-demo.test.ts`（`npm test` 即可复现）：

1. 治理护栏拦截危险动作（如 `rm -rf /`）
2. 注入测试失败 → 反馈闭环驱动 Agent 修正 → 通过
3. 重点维度：重复失败 WARNING / 结构化 feedback history（反馈加深）

## WebUI

CaseAI Match 风格的浅色 SaaS 操作台（近白画布 + 炭黑主按钮 + Inter）：

| 页面 | 作用 |
|------|------|
| Home | 问候 + 主输入 + 角色选择 |
| Session | 对话流、轮次卡、反馈轨迹、Composer、角色下拉 |
| Projects | 工作区绑定；角色卡片进入会话 |
| Settings | API Key、模型与连接信息 |

设计合同见 `webui/DESIGN.md`；规格见 `docs/superpowers/specs/2026-08-13-caseai-webui-redesign.md`。

## 测试与 CI

所有核心机制均使用 Mock LLM 进行确定性单元测试，不依赖网络或真实 LLM。

```bash
npm test
```

### CI / CD

| 平台 | 配置 | 作用 |
|------|------|------|
| GitLab CI | `.gitlab-ci.yml` | **必须**的 `unit-test` job（`npm ci && npm test`）；另有 `docker-build` |
| GitHub Actions | `.github/workflows/ci.yml` | push/PR 跑单测与构建（`master` / `main`） |
| Zeabur | 连接 GitHub `master` | 按 Dockerfile 构建并发布 Web 服务 |

作业要求的 CI/CD 执行记录以 GitLab / GitHub 流水线最后一次 **pass** 为准；本地可用 `npm test` 与 `docker build -t coding-agent-harness .` 复现。

## 云部署

### Zeabur

线上 WebUI：https://coding-agent-harness.zeabur.app

**部署架构：** GitHub 仓库 `master` → Zeabur 拉取并 Docker 构建 → 容器监听 `PORT` → 公网域名反代到 WebUI（Express 静态资源 + WebSocket / REST）。

在 Zeabur 控制台配置环境变量（如 `LLM_PROVIDER`、`LLM_API_KEY`、`LLM_MODEL`、`LLM_BASE_URL`、`PORT`、`HARNESS_WORKSPACE` 等）。密钥只放在平台密钥/环境变量中，不进镜像层与 Git。

## 已知限制

- **单用户**：当前版本不支持多用户并发任务
- **无任务队列**：同一时间只能运行一个 Agent 任务
- **公网暴露面**：当前版本不设应用层访问令牌，生产环境建议在网关加认证
- **文件工具沙箱**：依赖工作区根目录设置，需确保 `HARNESS_WORKSPACE` 正确配置
- **平台兼容**：Windows 和 macOS/Linux 路径分隔符均支持，但部分 shell 命令可能因操作系统而异

## 文档索引

| 文档 | 说明 |
|------|------|
| `SPEC.md` | 设计规格与 §A.4 / §A.5 |
| `PLAN.md` | 实现计划总表（含完成标记） |
| `SPEC_PROCESS.md` | 规约生成过程与冷启动 |
| `AGENT_LOG.md` | Superpowers 协作过程日志 |
| `REFLECTION.md` | 反思报告 |
| `webui/DESIGN.md` | WebUI 视觉合同（CaseAI） |
| `docs/superpowers/specs/*` | 分主题设计规格 |
| `docs/superpowers/plans/*` | 分主题细粒度计划 |
