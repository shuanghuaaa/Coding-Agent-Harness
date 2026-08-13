# SPEC_PROCESS.md — 规约与计划生成过程

> 记录与 Superpowers / Cursor Agent 协作生成 SPEC、PLAN 的关键过程，以及冷启动验证。  
> 时间线覆盖 2026-08 主开发与后续反馈 / CaseAI / 角色多选迭代。

---

## 1. Brainstorming 关键节点

### 1.1 智能体追问得好的问题

1. **主贡献选哪个维度？**  
   初衷想「六个都做深」。追问后收敛为：六维最低实现 + **反馈闭环作为 main contribution**（可 mock、可分类、可多轮修正）。

2. **反馈「可见」到什么程度？**  
   在「只加深后端」vs「机制 + UI 讲故事 + mock 演示」中选了 **C（机制 + UI + 演示）**；失败时展示测试文件片段选了 **A（按需读工作区文件）**。

3. **编排入口放哪？**  
   一度考虑独立侧栏「编排模块」。追问后否决：去掉项目页编排表单；**角色卡片进会话 + 会话内多选角色**，避免第二套控制台。

4. **凭据存哪？**  
   明确 WinCM / AES / `.env` 风险分层；Settings 只显示「已配置」，不回显明文。

5. **WebUI 视觉系统？**  
   从 Terminal / Mission Control 深色 HUD，经确认改为 **CaseAI Match 浅色单色操作台**（近白 + 炭黑），并写进 `webui/DESIGN.md`。

### 1.2 哪些追问修正了原设想

| 原设想 | 修正后 | 原因 |
|--------|--------|------|
| 六个维度平均用力 | 反馈做深，其余保底 | 对齐 §A.4-D「重点深入」 |
| 深色 Mission Control 长期保留 | CaseAI 全量换皮 | 参考设计更清晰，信息架构更适合课程演示 |
| 独立编排侧栏 + 项目页启动表单 | 会话级角色多选 | 减少 IA 分叉，编排仍走同一 Composer |
| `feedbackHistory` 仅 `{round,status}` | 结构化 summary / types / repeatedFailure | UI 与注入文案都需要同一真相源 |
| README 写 MIT | 删除许可证占位 | 无 LICENSE，课程作业不适合随手声明 MIT |
| 部署写 Render | Zeabur + 固定域名 | 实际部署平台不一致 |

---

## 2. 至少三轮关键迭代（节选）

### 轮次 A — 主贡献与反馈形态（2026-08-14 前后）

- **AI 建议：** 交付形态 C（机制 + UI + mock 演示）；失败卡片拉测试文件片段。  
- **我采纳：** 是。并确认片段窗口上下约 8 行、不回传完整 stdout 到 history。  
- **产出：** `docs/superpowers/specs/2026-08-14-feedback-loop-deepening-design.md` + plan。

### 轮次 B — 编排 UI（同阶段）

- **AI 建议：** 侧栏独立编排模块 / 项目页表单 / 会话 chips 等多方案。  
- **我推翻：** 不要侧栏编排；不要项目页 orchestrate 表单。  
- **我拍板：** 卡片进会话；Composer 旁多选；1 角色走 `task`，2–3 走 `orchestrate`+`roles[]`。  
- **产出：** `docs/superpowers/specs/2026-08-14-session-role-multiselect-design.md`。

### 轮次 C — CaseAI 视觉与信息架构（2026-08-13）

- **AI 建议：** 全量 CaseAI 化（token + IA），默认近白，去掉青色强调。  
- **我采纳：** 色板近白 + 炭黑；Caveat 仅 Home 一句问候。  
- **后续微调：** 去掉 Home「最近会话」、加大主输入、角色选择改为下拉（防溢出）等。  
- **产出：** CaseAI redesign spec/plan；`webui/DESIGN.md` 重写。

### 轮次 D — 仓库与交付表述（2026-08-14）

- **AI 误写：** 云部署写成 Render / `render.yaml`。  
- **我纠正：** 实际是 Zeabur，`coding-agent-harness.zeabur.app`。  
- **处理：** 改 README/SPEC；删无用文件与 MIT 占位。

---

## 3. AI 建议：采纳 vs 推翻

| 建议 | 决策 | 理由 |
|------|------|------|
| 反馈做主贡献 | 采纳 | 最符合 §A.4 的「代码机制 + mock 可测」 |
| 复活整套 ControlDeck | 推翻 | CaseAI 会话卡已够讲故事，避免双 UI |
| 默认 MIT 开源 | 推翻 | 无正式授权意图 |
| 删除 `.gitlab-ci.yml` 只留 GitHub Actions | 先误删后恢复 | 作业硬性要求 GitLab `unit-test` job |
| 多角色顺序固定 coder→reviewer→tester | 采纳 | 与产物门禁一致、可测 |

---

## 4. 对 brainstorming 技能的反思

**做得好的地方**

- 强迫先选「主贡献」与「可见性」，避免六个浅坑。  
- 用表格固化决策（失败片段 / 角色生效时机），减少实现期返工。  
- 设计文档落盘到 `docs/superpowers/specs/`，后续 subagent 可只读规格开工。

**不满之处**

- 有时默认套用「常见开源 README 模板」（MIT、Render），与真实部署/授权不一致，需要人盯。  
- 对话过长后易重复提议已否决方案（如 ControlDeck、独立编排页）。  
- 「过程证据」类文档（本文件、`AGENT_LOG`）若不一开始建，后期只能靠 commit / 回忆补写，保真度下降。

---

## 5. 冷启动验证（§4.5）

### 操作摘要

- **主开发智能体：** Cursor Agent（Composer / Superpowers 技能链）。  
- **冷启动智能体：** 使用不同会话、不导入主对话 memory；仅投喂当时的 `SPEC.md` + 主 `PLAN` 片段，要求实现「可插拔测试解析器」或「关键词记忆检索」一类独立 task，并规定「不确定即暂停」。  
- **目的：** 检验规格是否自洽、路径是否写清、验收是否可测。

### 暴露的问题与修订

| 现象 | 根因 | 修订 |
|------|------|------|
| 冷启动 agent 把「解析器」做成单一巨型 regex | SPEC 未强调 pluggable parser 接口 | 在反馈加深规格中写明 vitest/jest/mocha/generic 分文件 |
| 记忆「按需提供」被实现成 `list()` 全量注入 | 早期 SPEC §3.5 写的是 list 全量 | 修订为 `KeywordRetriever`，并更新 SPEC/README |
| WebUI 组件名仍写 ChatPanel/AgentLog | 架构图过时 | SPEC §5.1 / §10.1 改为 CaseAI 页面与 FeedbackTrail |
| 部署验收写 Render | 过时假设 | 改为 Zeabur 公网 URL |

### 结论

冷启动证明：**「最低实现描述」够跑，但「深入约定」必须写进 SPEC**，否则第二智能体会合理却偏离地补全。修订后的反馈 / 记忆 / UI 段落成为后续实现的硬约束。

---

## 6. 产物对照

| 交付物 | 路径 |
|--------|------|
| SPEC | `SPEC.md`（含 §A.5 领域与机制设计） |
| PLAN | `PLAN.md` + `docs/superpowers/plans/*` |
| 过程 | 本文件 |
| 实现日志 | `AGENT_LOG.md` |
| 反思 | `REFLECTION.md` |
