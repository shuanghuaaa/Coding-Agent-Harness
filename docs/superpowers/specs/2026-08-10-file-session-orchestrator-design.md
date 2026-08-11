# Design: 文件查看 · 会话续跑 · 多 Agent Orchestrator

> 日期：2026-08-10  
> 状态：待用户确认后进入实现计划  
> 关联诉求：右侧项目文件可真正打开；最近会话可继续；多 Agent 页具备真实编排能力（方案 B / 契约编排器）

## 1. 目标与边界

### 1.1 目标

1. **项目文件**：会话页右侧文件树来自真实工作区；点击文件可打开内容（只读）；文件夹可展开。路径防目录穿越。
2. **继续会话**：点「最近会话」进入后可继续输入；新轮次携带该会话历史 `messages`；结果写回同一 `sessionId`。
3. **多 Agent Orchestrator**：多 Agent 页发起任务走编排器：`Coder →（门禁）Reviewer →（门禁）Tester`；失败按配置打回 Coder；`maxRetries` 可配置（默认 2）。角色工具子集由代码强制隔离。UI 展示真实角色状态，去掉假百分比。

### 1.2 非目标（本轮不做）

- Planner 动态派工（由 LLM 决定下一步派谁）
- 文件查看器内直接保存编辑（Agent 仍可通过工具改文件）
- 多 Agent 并行写同一工作区（写文件阶段串行）
- 恢复历史未决 HITL 状态

### 1.3 成功标准

- mock LLM 下：编排顺序、门禁打回、重试耗尽、工具隔离均可单测（无网络）
- WebUI：能打开文件、历史会话能续聊、多 Agent 页状态来自 `orchestrator_status` 而非硬编码指标

---

## 2. 项目文件（真实可打开）

### 2.1 后端

- 保留 `GET /api/workspace/files`（树元数据）
- 新增 `GET /api/workspace/file?path=<相对路径>`
  - 复用 `file-tools` 的路径解析：限制在 `workspaceRoot` 内，拒绝 `..` 与越界
  - 成功：`{ path, content, size }`（UTF-8 文本）
  - 失败：越界/不存在 → `400`/`404`；超限（默认 1MB）或判定为二进制 → `400`/`415` + 明确 `error`
  - 鉴权与现有 `/api/*` 一致（`HARNESS_TOKEN` → Bearer / query）

### 2.2 前端

- 文件夹：点击展开/折叠（保持现状）
- 文件：点击 → `getWorkspaceFile(path)` → 上下文区打开只读查看器（路径标题 + 关闭）
- 布局：查看器优先占文件相关区域；检查点 Diff 面板仍在下方
- 检查点变更文件继续高亮

### 2.3 不做

- UI 内写回磁盘、资源管理器内删改文件

---

## 3. 最近会话可继续

### 3.1 根因

- 选中历史进入 `review` 只读；composer / submit 被 `Boolean(review)` 禁用
- WS `task` 与 `AgentLoop.run(task)` 只接受新任务字符串，忽略 `SessionData.messages`

### 3.2 协议

单 Agent（含续跑）继续使用：

```ts
// WS client → server
{ type: 'task', payload: { task: string; sessionId?: number } }
```

多 Agent 使用独立消息，避免与续跑缠绕：

```ts
{ type: 'orchestrate', payload: { task: string; maxRetries?: number; sessionId?: number } }
```

### 3.3 AgentLoop

```ts
run(task: string, options?: { priorMessages?: Message[] }): Promise<RunResult>
```

- 有 `priorMessages`：经 `ContextBuilder` 在剥离/保留 system 后的历史上追加本轮 user，再进入循环
- 无：与现行为一致（system + 单条 user）

### 3.4 SessionStore

- 新增 `update(id, fields)`（更新 status / rounds / data / 必要时 task 摘要策略保持原 task 不变）
- 带 `sessionId` 的续跑：结束时 `update` 同一行（合并 progress / messages / feedback）
- 无 `sessionId`：仍 `save` 新行
- 续跑请求时若该连接已有 running loop：**拒绝**并回 status/错误提示（不排队）

### 3.5 前端

- 选中会话：加载详情到时间线，**不进入只读**；记住 `activeSessionId`
- composer 可用；占位「继续输入以接着干…」；发送带 `sessionId`
- 「新会话」：清空 `activeSessionId` 与时间线
- 顶栏可显示「续跑 · #id」

### 3.6 边界

- 不恢复未决 HITL；新一轮危险动作重新审批

---

## 4. 多 Agent Orchestrator（契约 + 门禁）

### 4.1 角色注册表（代码配置）

| Role | 职责 | 工具子集 |
|------|------|----------|
| `coder` | 实现/修改 | 读写文件、搜索、git_diff；受限 shell |
| `reviewer` | 审查变更 | 读文件、搜索、git_diff；**禁止写/删** |
| `tester` | 客观验证 | 读文件、`run_test`、只读 shell；**禁止写业务代码** |

- 每角色：独立 system prompt + Dispatcher/白名单强制（提示词不能越权）
- 单测：reviewer 调用 `write_file` → 拒绝

### 4.2 状态机

```
idle → coder_running → review_running → test_running → completed
                ↑              │               │
                └─ reject ←────┘               │
                └──────── fail ←───────────────┘
           (retryCount < maxRetries)
retry 耗尽 → failed
任意阶段 error/cancel → failed / cancelled
```

写文件阶段串行；本轮不做多角色并行写。

### 4.3 交接契约

```ts
interface StageArtifact {
  role: 'coder' | 'reviewer' | 'tester';
  summary: string;
  changedFiles: string[];
  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
  testStatus?: 'pass' | 'fail' | 'skipped';
  rawExcerpt?: string;
}
```

门禁规则（确定性代码）：

1. Reviewer 存在 `severity: 'block'` 的 finding → 打回 Coder（附 findings），`retryCount++`
2. Tester `testStatus === 'fail'` → 打回 Coder（附失败摘要），`retryCount++`
3. 契约字段解析失败 → **不阻断**（记 `warn`），避免格式不稳卡死；仅可解析的 blocking 字段触发打回
4. `retryCount > maxRetries` → `failed`

### 4.4 配置

- `maxRetries`：WS payload 优先，否则环境变量 `ORCHESTRATOR_MAX_RETRIES`，默认 `2`
- 本轮三角色全开（不做跳过某角色 UI）

### 4.5 协议与持久化

**进度**

- 现有 `progress` 增加可选 `agentRole`
- 新增 `orchestrator_status`：
  ```ts
  {
    phase: string;
    roles: Record<'coder'|'reviewer'|'tester', 'idle'|'running'|'waiting'|'done'|'blocked'|'error'>;
    retryCount: number;
    maxRetries: number;
    lastGate?: { from: string; reason: string };
  }
  ```

**结果**

- `result.payload` 增加 `orchestration?: { stages: StageArtifact[]; retries: number; status: string }`

**会话**

- 编排任务同样落 SessionStore；`data` 中保留合并后的 progress（带 role）与 messages
- 若带 `sessionId`：按续跑规则 `update`；否则 `save`

### 4.6 WebUI（多 Agent 页）

- 删除 `MOCK_AGENTS` 假指标
- 三角色卡片绑定 `orchestrator_status.roles`
- 任务输入 +「启动编排」+ `maxRetries` 数字输入（默认 2）
- 启动后可切到会话页看带角色标签的时间线
- 活动流继续使用真实 `sessions`

### 4.7 测试矩阵（mock LLM）

1. Happy path：coder → reviewer(pass) → tester(pass) → completed  
2. Review block → 打回 coder → 再通过 → completed  
3. Test fail → 打回 → `maxRetries` 耗尽 → failed  
4. Reviewer 调写工具 → 拒绝  

---

## 5. 模块落点（实现指引）

| 能力 | 主要落点 |
|------|----------|
| 读文件 API | `src/workspace/file-tree.ts` 或新 `read-workspace-file.ts`；`http-server.ts` 路由 |
| 续跑 | `src/agent/loop.ts`；`session-store.ts` `update`；`http-server.ts` task 处理；`useWebSocket.ts` / `App.tsx` |
| Orchestrator | 新 `src/agent/orchestrator.ts`（或 `src/orchestration/`）；角色注册；`http-server.ts` `orchestrate` |
| 工具隔离 | `ToolDispatcher` 或 per-loop dispatcher 构造时注入允许列表 |
| UI | `App.tsx` 文件查看器、去掉 review 锁、多 Agent 页真实状态；`types.ts` / API 客户端 |

---

## 6. 风险与缓解

| 风险 | 缓解 |
|------|------|
| 真模型不输出可解析 findings | 解析失败不阻断；可用约定 JSON 块 + 宽松解析；mock 测门禁 |
| 续跑上下文过长 | 本轮全量历史；若超限后续再做截断（非本轮） |
| 双 Node / native 模块 | 文档提醒用同一 Node 启后端；与本设计无关但影响演示 |

---

## 7. 决议摘要

- 多 Agent：方案 2（契约 Orchestrator + 门禁），非纯并行三提示词
- `maxRetries`：可配置，默认 2
- 续跑：写回同一 `sessionId`
- 文件：只读打开；编排与单 Agent 分 WS 消息类型
