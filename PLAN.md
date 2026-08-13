# PLAN.md — Coding Agent Harness 实现计划

> 由 `writing-plans` 沉淀；细粒度步骤见 `docs/superpowers/plans/`。  
> 本文件为交付用总表：每个 task 含目标、文件、验证步骤，并标注完成状态与代表 commit。

**Goal：** 自实现 Coding Agent Harness 内核（决策 / 工具 / 记忆 / 治理 / 反馈 / 配置）+ WebUI + Docker 分发；**主贡献 = 反馈闭环**。

**约束：** TDD（先红后绿）；mock LLM 确定性单测；无真实凭据入库；Docker 可一键运行。

**依赖示意：**

```
T1 → T2 → T3 → T4 → T5..T7 → T8 / T9..T10（可并行）→ T11 → T12 → T13 → T14..T15 → T16 → T17 → T18 → T19
后续增量：编排 / CaseAI UI / 反馈加深（见 Phase B）
```

---

## Phase A — 内核与首版 WebUI（主计划）

详细步骤：`docs/superpowers/plans/2026-08-05-coding-agent-harness.md`

### Task 1: Initialize project — [x]

- **目标：** npm / TypeScript / Vitest / Docker 脚手架
- **文件：** `package.json`、`tsconfig.json`、`vitest.config.ts`、`Dockerfile`、`docker-compose.yml`、`.gitignore`
- **验证：** `npm install` 成功；目录结构就绪
- **完成：** 仓库初始化阶段（早期 commits）

### Task 2: Define agent types — [x]

- **目标：** `Message` / `ToolCall` / `RunResult` 等类型
- **文件：** `src/agent/types.ts`、`tests/agent/types.test.ts`
- **验证：** 失败测试先写 → 类型导出后变绿
- **完成：** 早期 agent types commits

### Task 3: LLMProvider + MockLLM — [x]

- **目标：** 可注入 mock 的 LLM 抽象层
- **文件：** `src/llm/provider.ts`、`mock-llm.ts`、`openai-compatible.ts`、`tests/llm/*`
- **验证：** MockLLM 按序返回预设响应；记录 `receivedMessages`
- **完成：** `tests/llm/mock-llm.test.ts` 等

### Task 4: Tool interface + dispatcher — [x]

- **目标：** 统一 `Tool` + 按名分发
- **文件：** `src/tools/base.ts`、`dispatcher.ts`、`tests/tools/dispatcher.test.ts`
- **验证：** 已知工具路由正确；未知工具抛错

### Task 5–7: File / Shell / Search / Git / Test tools — [x]

- **目标：** 七类工具可执行并回灌结果
- **文件：** `src/tools/file-tools.ts`、`shell-tool.ts`、`search-git-test-tools.ts`、对应 tests
- **验证：** 工作区内读写；shell 超时；`run_test` 可触发反馈路径

### Task 8: Guardrail — [x]

- **目标：** 危险动作确定性拦截（非提示词）
- **文件：** `src/guard/rules.ts`、`guardrail.ts`、`tests/guard/guardrail.test.ts`
- **验证：** `guardrail('shell', { command: 'rm -rf /' })` → `blocked: true`

### Task 9–10: Feedback classifier / validator / injector — [x] ★

- **目标：** 解析测试输出 → 分类 → 回灌消息
- **文件：** `src/feedback/*`、`tests/feedback/*`
- **验证：** 断言 fail 分类；注入文案含 expected/got/`file:line`

### Task 11–13: ContextBuilder / StopCondition / AgentLoop — [x]

- **目标：** 自实现主循环（组织上下文 → LLM → 解析 → 护栏 → 分发 → 反馈 → 停机）
- **文件：** `src/agent/context-builder.ts`、`stop-condition.ts`、`loop.ts`、`tests/agent/*`
- **验证：** MockLLM 下多轮完成；`cancel()` 可停

### Task 14–15: Memory + Config + Credentials — [x]

- **目标：** SQLite 记忆、`.rules` 配置、WinCM / AES 凭据
- **文件：** `src/memory/*`、`src/config/loader.ts`、`src/credentials/*`、对应 tests
- **验证：** CRUD；规则加载；凭据不回显明文

### Task 16: HTTP + WebSocket server — [x]

- **目标：** 任务推送、HITL、会话持久化
- **文件：** `src/server/*`、`tests/server/*`
- **验证：** sessions API；WS 消息类型

### Task 17: 机制演示（§A.6）— [x] ★

- **目标：** mock 下复现护栏拦截 + 反馈闭环修正 + 重点维度行为
- **文件：** `tests/integration/harness-demo.test.ts`
- **验证：** `npm test` 中该文件全部通过
- **说明：** 后续加深含重复失败 WARNING（见 Phase B）

### Task 18–19: WebUI + Docker 集成 — [x]

- **目标：** React WebUI；Express 托管静态资源；镜像可跑
- **文件：** `webui/`、`Dockerfile`
- **验证：** `docker build`；本地 `npm run dev` 打开 UI

---

## Phase B — 增量（编排 / UI / 反馈加深）

### Task B1: 多角色编排 — [x]

- **计划：** `docs/superpowers/plans/2026-08-10-file-session-orchestrator.md`
- **规格：** `docs/superpowers/specs/2026-08-10-file-session-orchestrator-design.md`
- **文件：** `src/orchestration/*`、`tests/orchestration/*`
- **验证：** coder→reviewer→tester 子集流水线单测
- **代表 commit：** `70158ba` … `2271966`、`992efac`

### Task B2: Mission Control → CaseAI WebUI — [x]

- **计划 / 规格：** `docs/superpowers/plans|specs/2026-08-13-caseai-webui-redesign.md`
- **文件：** `webui/src/App.tsx`、`styles.css`、`webui/DESIGN.md`
- **验证：** Home / Session / Projects / Settings；HITL / 反馈可见
- **代表 commit：** `74e0763`

### Task B3: 反馈闭环加深 + UI 讲故事 — [x] ★

- **计划 / 规格：** `docs/superpowers/plans|specs/2026-08-14-feedback-loop-deepening*`
- **文件：** `src/feedback/summary.ts`、`repeated-failure.ts`、parsers；`FeedbackTrail.tsx`、`TestFileSnippet.tsx`
- **验证：** `tests/feedback/repeated-failure.test.ts`、`harness-demo` 重复失败用例
- **代表 commit：** `74e0763`

### Task B4: 会话角色多选 — [x]

- **规格：** `docs/superpowers/specs/2026-08-14-session-role-multiselect-design.md`
- **文件：** `webui/src/App.tsx`、`src/orchestration/orchestrator.ts`、`http-server.ts`
- **验证：** 单角色 `task`+`agentRole`；多角色 `orchestrate`+`roles[]`
- **代表 commit：** `74e0763`

### Task B5: 交付文档与仓库清理 — [x]

- **目标：** Zeabur URL、删无用文件、补齐 `PLAN`/`SPEC_PROCESS`/`AGENT_LOG`/`REFLECTION`
- **代表 commit：** `1b28692` 及后续 docs commits

---

## 并行提示（历史）

| 可并行组 | Tasks |
|----------|--------|
| 工具实现 | T5 / T6 / T7（接口稳定后） |
| 护栏 vs 反馈 | T8 ∥ T9–T10 |
| 记忆 vs 凭据 | T14 ∥ T15 部分 |

Worktree 曾用于 `feat/harness-improvements` 等分支，后已合并进 `master` 并删除多余分支。

---

## 验证总命令

```bash
npm test
# 机制演示重点：tests/integration/harness-demo.test.ts
```

CI：`.gitlab-ci.yml` → job `unit-test`；GitHub Actions → `.github/workflows/ci.yml`。
