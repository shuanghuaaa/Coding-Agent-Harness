# Coding Agent Harness

> AI4SE 期末项目 · A · Coding Agent Harness  
> **Agent = LLM + Harness** — 将 LLM 封装成一台能稳定、可靠编码的机器。

Coding Agent Harness 是一个以 **反馈闭环** 为核心贡献的编码智能体系统。它封装 LLM，提供工具、治理护栏、记忆、反馈闭环和 WebUI 交互界面，让使用者看清 Agent 的每一个决策环节。

## 目录

- [快速开始](#快速开始)
- [安装与运行](#安装与运行)
- [分发方式 (Docker)](#分发方式-docker)
- [API Key 安全配置](#api-key-安全配置)
- [目录结构](#目录结构)
- [核心机制](#核心机制)
- [测试](#测试)
- [云部署](#云部署)
- [已知限制](#已知限制)
- [许可证](#许可证)

## 快速开始

```bash
# 1. 克隆仓库
git clone https://github.com/<your-username>/coding-agent-harness.git
cd coding-agent-harness

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
| `HARNESS_TOKEN` | WebSocket 认证令牌 | 空（无认证） |
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

# 启动后，通过 API 存储密钥
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

## 目录结构

```
coding-agent-harness/
├── src/
│   ├── agent/          # Agent 主循环、上下文构建、停止条件
│   ├── llm/            # LLM 抽象层（MockLLM、OpenAI 兼容）
│   ├── tools/          # 工具系统（文件、Shell、搜索、Git、测试）
│   ├── feedback/       # 反馈闭环（分类器、校验器、注入器）
│   ├── guard/          # 治理护栏（危险动作拦截）
│   ├── memory/         # 记忆存储（SQLite）
│   ├── config/         # 配置加载器
│   ├── credentials/    # 凭证存储（AES 文件、Windows CM）
│   ├── server/         # HTTP + WebSocket 服务器
│   └── utils/          # 日志工具
├── webui/              # React + Vite 前端
│   └── src/
│       ├── components/ # ChatPanel, AgentLog, HITLModal
│       └── hooks/      # WebSocket 钩子
├── tests/              # 测试（23 个文件，84 个测试）
├── .github/workflows/  # CI 配置
├── Dockerfile
├── docker-compose.yml
├── SPEC.md             # 设计文档
├── PLAN.md             # 实现计划
└── README.md
```

## 核心机制

### 1. Agent 主循环

自实现的 Agent 主循环：组织上下文 → 调用 LLM → 解析动作 → 分发执行 → 回灌结果 → 停机判断。不依赖任何 Agent 编排框架。

### 2. 反馈闭环（★ 主要贡献）

确定性校验器 + 失败分类 + 多轮自我修正：

- **FailureClassifier**：将测试失败分类为 `compile`、`assertion`、`timeout`、`runtime`
- **FeedbackValidator**：解析测试输出，判定通过/失败
- **FeedbackInjector**：将失败信息注入 LLM 上下文，驱动自我修正

### 3. 治理护栏 + HITL

- 7 种危险动作模式（`rm -rf`、`git push --force`、`DROP TABLE`、`sudo`、系统文件写入/删除、外发网络请求）
- HITL 审批：拦截危险操作后，通过 WebUI 弹窗请求人工确认
- 支持修改参数后批准执行

### 4. 工具系统

- 文件操作（read/write/delete）— 带路径遍历沙箱
- Shell 命令执行 — 异步、超时保护
- 代码搜索 — ripgrep + Node.js 回退
- Git diff
- 测试运行

### 5. 记忆（SQLite）

- 跨会话存储项目约定、历史决策、偏好设置
- 按需提供给 LLM（非全量载入）

## 测试

所有核心机制均使用 Mock LLM 进行确定性单元测试，不依赖网络或真实 LLM。

```bash
# 一键运行全部测试
npm test

# 输出：23 个文件，84 个测试全部通过
```

### 机制演示

测试文件 `tests/integration/harness-demo.test.ts` 中包含：

1. 治理护栏拦截危险动作（`rm -rf /`）
2. 反馈闭环：注入失败 → Agent 修正 → 通过
3. 反馈闭环确定性行为验证

测试文件 `tests/agent/hitl.test.ts` 中包含：

4. HITL 回调拦截危险动作
5. 批准后执行危险操作
6. 拒绝后阻止危险操作
7. 修改参数后批准执行

## 云部署

### Render

项目根目录包含 `render.yaml` 配置文件。在 [Render](https://render.com) 上：

1. 连接 GitHub 仓库
2. Render 自动检测 `render.yaml` 并创建 Web Service
3. 在 Render Dashboard 中设置 `LLM_API_KEY` 等环境变量
4. 部署完成后获得公网 URL（如 `https://coding-agent-harness.onrender.com`）

### 其他平台

支持任何支持 Docker 的云平台（Railway、Fly.io、Vercel + Docker 等）。

## 已知限制

- **单用户**：当前版本不支持多用户并发任务
- **无任务队列**：同一时间只能运行一个 Agent 任务
- **WebSocket 认证**：基于查询参数 token，生产环境建议使用更安全的认证方式
- **文件工具沙箱**：依赖工作区根目录设置，需确保 `HARNESS_WORKSPACE` 正确配置
- **平台兼容**：Windows 和 macOS/Linux 路径分隔符均支持，但部分 shell 命令可能因操作系统而异

## 许可证

MIT