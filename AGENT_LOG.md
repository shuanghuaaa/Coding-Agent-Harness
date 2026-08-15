# AGENT_LOG.md

> Superpowers / Cursor Agent 协作过程日志（关键节点）。  
> 每条含：时间、task、技能、关键上下文、产物 / commit、人工干预与教训。

---

## 2026-08 — 内核奠基

### 2026-08-05 · Plan bootstrap

- **技能：** `brainstorming` → `writing-plans`
- **Task：** 主计划 Tasks 1–19
- **上下文：** 选定 Coding Agent Harness；主贡献定为反馈闭环
- **产物：** `docs/superpowers/plans/2026-08-05-coding-agent-harness.md`、`SPEC.md` 初版
- **人工：** 确认六维保底 + 反馈深入；拒绝寄生 LangChain AgentExecutor
- **教训：** 计划必须写清「先写失败测试」路径，否则 subagent 会先堆实现

### 2026-08 · TDD 内核实现（摘要）

- **技能：** `subagent-driven-development` / `test-driven-development` / `requesting-code-review`
- **Task：** T2–T17（types → MockLLM → tools → guard → feedback → loop → demo）
- **关键 prompt：** 只允许改 task 指定文件；红→绿→重构→commit
- **产物：** `src/agent|llm|tools|feedback|guard|memory|config|credentials|server/*`；`tests/**`
- **机制演示：** `tests/integration/harness-demo.test.ts`（护栏 + 反馈修正）
- **人工：** Critical 评审问题（路径沙箱、HITL 回调注入）要求修完再进下一 task
- **教训：** MockLLM 预设序列长度必须与工具调用轮次对齐，否则「偶发」停机

---

## 2026-08-10 · 会话 / 编排

- **技能：** `brainstorming` → `writing-plans` → SDD
- **规格：** `docs/superpowers/specs/2026-08-10-file-session-orchestrator-design.md`
- **Task：** 角色 registry、产物门禁、orchestrator、WS orchestrate、WebUI 多页
- **代表 commit：** `70158ba`（roles）、`0e7d565`（artifacts）、`2271966`（orchestrator）、`f307f9f`（WS）、`8797f84`（WebUI）
- **人工：** 要求编排失败在 retry 耗尽后必须 fail pipeline（`08f900d` / `452a8d4`）
- **教训：** 「解析失败当成功」是静默错误；门禁要在 orchestrator 层断言

---

## 2026-08-13 · CaseAI WebUI

- **技能：** `brainstorming`（设计确认）→ plan → 实现
- **规格 / 计划：** `docs/superpowers/specs|plans/2026-08-13-caseai-webui-redesign.md`
- **上下文：** 用户确认近白 + 炭黑单色；去掉青色；Caveat 仅 Home
- **产物：** `webui/src/App.tsx`、`styles.css`、组件 Markdown/ToolResult 等
- **人工：** 多次微调（问候字体、去掉最近会话、输入框尺寸、composer 顶边）
- **教训：** 视觉规格若不写进 DESIGN.md，后续 PR 容易混回深色 HUD token

---

## 2026-08-14 · 反馈加深（主贡献强化）

- **技能：** `brainstorming` → `writing-plans` → `subagent-driven-development`（Tasks 1–4）→ 后续任务内联完成
- **规格 / 计划：** `2026-08-14-feedback-loop-deepening-*`
- **决策表：** 交付形态 C；方案 1；测试文件片段 A；不复活 ControlDeck
- **产物：** `summary.ts`、`repeated-failure.ts`、丰富 `Feedback`；`FeedbackTrail`、`TestFileSnippet`；demo 扩展
- **代表 commit：** `74e0763`
- **人工：** API 限流后改为当前会话内联完成 Tasks 5–8；要求中文可读节点
- **教训：** history 字段一扩，前后端类型必须同日更新，否则 UI 降级成只有 pass/fail

---

## 2026-08-14 · 会话角色多选

- **技能：** `brainstorming`（编排入口）
- **规格：** `docs/superpowers/specs/2026-08-14-session-role-multiselect-design.md`
- **决策：** 无侧栏编排；无项目页表单；卡片进会话；多选 ≥1；改选下轮生效
- **产物：** Composer 角色下拉；`agentRole` / `roles[]` 协议；orchestrator 子集执行
- **代表 commit：** `74e0763`
- **人工：** 否决独立编排模块；chips 改下拉防溢出
- **教训：** 产品入口与协议字段要一起定，否则前端发 `orchestrate`、后端仍跑满三角色

---

## 2026-08-14 · 分支收敛与文档交付

- **技能：** 仓库治理 + 文档同步
- **动作：** 合并功能分支到 `master`；改 GitHub 默认分支；删远端多余分支
- **文档：** README/SPEC/DESIGN 对齐 Zeabur；删 MIT 占位；清 SDD 草稿 / `recursion.c` / Word 锁文件
- **代表 commit：** `1b28692`
- **人工纠正：** 部署不是 Render；作业要求保留 `.gitlab-ci.yml` 的 `unit-test`
- **偏离记录：** 曾短暂删除 `.gitlab-ci.yml`（误判「只用 GitHub」）→ 已恢复并写入本日志

---

## 机制演示对照（§A.6）

| 要求 | 位置 |
|------|------|
| ① 护栏拦截危险动作 | `harness-demo.test.ts` — Guardrail blocks `rm -rf /` |
| ② 注入失败 → 反馈改变下一步 | 同文件 — Feedback loop correct → pass |
| ③ 重点维度确定性行为 | 同文件 — 重复失败 WARNING / 结构化 feedback（加深后） |

运行：`npm test`

---

## CI / 部署

- **GitLab CI：** `.gitlab-ci.yml` → `unit-test`（`npm ci && npm test`）
- **GitHub Actions：** `.github/workflows/ci.yml`（master/main）
- **线上：** https://coding-agent-harness.zeabur.app

---

## 2026-08-15 · 工作区导入与文件栏

- **技能：** `test-driven-development`
- **Task：** 公网站点从本机导入文件夹；编辑栏与文件树分离；写回本机
- **原因：** 线上容器没有访问者的 `D:\`；旧「打开」浏览的是服务器磁盘
- **产物：** `POST /api/workspace/import`、`PUT /api/workspace/file`、`webui/src/lib/local-fs.ts`；去掉「打开」；导入上限 5000 文件 / 50MB
- **人工：** 要求多文件并列、对话仍在右侧、目录栏不被占用、同步回本地
- **教训：** 浏览器写回本机必须走文件夹授权；刷新后授权丢失。WebUI `tsc` 同名变量会直接让 Zeabur 镜像构建失败
