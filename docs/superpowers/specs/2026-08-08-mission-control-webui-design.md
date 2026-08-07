# Harness Mission Control — WebUI 重设计规格

日期：2026-08-08
状态：已获用户确认
范围：`webui/` 前端全面重设计 + 后端新增会话持久化（`SessionStore` + REST API）

## 背景与目标

Coding Agent Harness 的现有 WebUI 是单栏聊天气泡布局（960px 限宽、纯黑终端风）。用户反馈"过于死板丑陋"，核心问题：项目最大卖点（反馈闭环、治理护栏、工具轨迹）在 UI 上没有存在感；无历史会话能力；HITL 弹窗缺少协议已支持的"修改参数后批准"入口；WebSocket 断线后只能刷新页面。

目标：以**任务控制台（Mission Control）**为方向重设计——让使用者看清 Agent 的每一个决策环节，同时新增历史会话回顾能力。

## 已确认的决策

| 决策点 | 结论 |
|--------|------|
| 整体方向 | 任务控制台：对话流 + Agent 内部状态实时可视化 |
| 视觉风格 | 深色科技 HUD（空间站任务控制台质感） |
| 前端依赖 | 允许新增 `lucide-react`（图标）；动效纯 CSS，不引入动画库 |
| 历史边栏 | 历史任务会话列表（类 ChatGPT 左侧栏），可回顾完整对话与轮次 |
| 会话持久化 | 后端 SQLite + REST API（不用 localStorage） |

## 整体布局

全视口高度三区应用壳；页面本身不滚动，各栏内部独立滚动。

```
┌──────────────────────────────────────────────────────────┐
│ 顶栏：品牌 · 连接 LED · Agent 状态 · 当前轮次/工具计数      │
├──────────┬──────────────────────────────┬────────────────┤
│ 会话历史  │      对话时间线（主区）        │  控制台面板组   │
│ 240px    │      flex 自适应              │  320px         │
│ 可折叠    │                              │                │
│          ├──────────────────────────────┤                │
│          │  底部输入条（> 任务 + 发送/取消）│                │
└──────────┴──────────────────────────────┴────────────────┘
```

窄屏（< 1100px）降级：右侧面板组收起为主区顶部的可展开抽屉；历史栏变为可滑出抽屉。移动端不做深度适配（本项目为桌面演示工具）。

## 区域设计

### 左侧 · 会话历史栏（新增）

- 每次任务执行完毕由后端自动保存为一条会话；列表按 `created_at` 倒序
- 列表项：任务摘要（首行截断）、状态徽章（success / fail / cancelled / running）、轮次数、相对时间；hover 显示删除按钮
- 点击进入**回顾模式**：完整对话与轮次记录渲染到主区和右侧面板（只读，输入条禁用并提示"回顾模式"）
- 顶部"新任务"按钮返回实时模式
- 空状态：一行提示文案；加载失败：内联错误 + 重试按钮

### 中间 · 对话时间线

- **用户任务卡片**：右置，带角标的指令卡样式
- **Agent 轮次卡片**：轮次编号 + LLM 说明 + 工具调用块（结果默认折叠，lucide 图标区分 read/write/delete/shell/search/git/test）+ 反馈标签（fail/pass）
- **任务结束卡**：状态总结 + 反馈轨迹 mini 视图；旧 `AgentLog` 组件的大段原始消息列表不再作为 UI 主角（数据仍入库）
- **空状态**：HUD 风格欢迎屏（系统自检清单式使用指引，替代现有虚线 hint-box）

### 右侧 · 控制台面板组

1. **Agent 循环指示器**：`上下文 → LLM → 工具 → 反馈` 横向流程图，当前执行阶段发光高亮
2. **轮次时间线**：纵向节点列表；当前轮次脉冲；点击节点将主区滚动定位到对应轮次卡片
3. **反馈闭环轨迹**：fail → … → pass 轨迹条（项目核心贡献的直观展示）
4. **工具活动统计**：各工具调用次数 mini 条形图

空闲时各面板显示"待机"占位。所有数据从现有 WebSocket `progress` / `status` / `result` 事件派生，**不新增协议消息类型**。

### HITL 审批弹窗

- 告警风格重设计：severity 色带（high=琥珀 / critical=红）、更清晰的信息层级
- **补上"修改参数后批准"**：参数区为可编辑 JSON 文本域，校验非法 JSON 并提示；批准时携带 `modifiedArgs`（后端协议已支持，现 UI 缺失此入口）
- 键盘快捷键：`A` 批准 / `R` 拒绝（输入框聚焦时不触发）

### 顶栏

品牌（Harness Terminal）、连接 LED、Agent 状态（idle/running/awaiting approval/error/cancelled）、当前轮次与工具调用计数。

## 视觉系统（深色科技 HUD）

- **色板**：深空蓝黑基底 `#070b12` 系（替代纯黑）；主 accent 信号绿 `#3dd68c`，辅助信息色青 `#22d3ee`；warn `#e6a23c` / danger `#f07178` 沿用
- **质感**：细网格背景、1px 半透明边框、面板角落刻度标记；发光效果仅用于状态点与当前循环阶段（克制）
- **字体**：沿用 IBM Plex Mono（等宽 = 终端气质），中文系统字回退；仪表盘数字加大字号
- **动效**：纯 CSS，仅四类——按钮按压 120ms、卡片入场 200ms、LED 脉冲 1.6s、循环阶段高亮过渡 300ms；`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` 沿用
- **密度**：工具优先的中高密度；圆角 ≤6px；无柔和阴影
- 重写 `webui/DESIGN.md`，使其与本规格一致

## 后端改动（会话持久化）

### SessionStore（新增 `src/server/session-store.ts`）

完全仿照 `MemoryStore` 模式（`better-sqlite3`、WAL），使用独立数据库文件 `data/sessions.db`（关注点分离）。

表结构：

```sql
CREATE TABLE IF NOT EXISTS sessions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  task TEXT NOT NULL,
  status TEXT NOT NULL,
  rounds INTEGER NOT NULL,
  created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  data TEXT NOT NULL  -- JSON: { progressEvents, feedbackHistory, messages }
)
```

`data` 内含：每轮 progress 事件（`round` / `assistantContent` / `actions` / `feedbackStatus`）、反馈历史、完整消息列表。

### 任务生命周期接线（`src/server/http-server.ts`）

- `onProgress` 回调中累计轮次事件到数组
- `loopWithHITL.run(task)` 结束后保存会话（含 success / fail）；error 与 cancel 分支同样落库（保存已产生的部分数据）

### REST API（新增，注册在 `app.get('*')` 通配之前）

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | `/api/sessions` | 列表（id / task 全文 / status / rounds / created_at），倒序；摘要截断由前端完成 |
| GET | `/api/sessions/:id` | 完整会话数据（含 data JSON） |
| DELETE | `/api/sessions/:id` | 删除；不存在返回 404 |

### 启动接线（`src/index.ts`）

实例化 `SessionStore`（`data/sessions.db`）并注入 `HarnessServer` 构造函数。

## 前端架构

```
webui/src/
├── App.tsx                  # 三区布局壳 + 模式切换（实时 / 历史回顾）
├── api/sessions.ts          # REST 封装（list / get / remove）
├── hooks/useWebSocket.ts    # 协议不变；新增自动重连（指数退避）
├── hooks/useSessions.ts     # 会话列表 CRUD 状态
├── components/
│   ├── TopBar.tsx           # 品牌 + 状态仪表
│   ├── SessionSidebar.tsx   # 历史会话列表
│   ├── ChatTimeline.tsx     # 对话时间线（用户卡 + 轮次卡 + 结束卡）
│   ├── RoundCard.tsx        # Agent 轮次卡片（工具块折叠）
│   ├── ControlDeck.tsx      # 右侧面板组容器
│   ├── LoopIndicator.tsx    # Agent 循环阶段指示器
│   ├── RoundTimeline.tsx    # 轮次时间线（点击定位）
│   ├── FeedbackTrail.tsx    # 反馈闭环轨迹
│   ├── ToolStats.tsx        # 工具活动统计
│   └── HITLModal.tsx        # 重设计 + 参数编辑
└── styles.css               # 重写（HUD 设计系统 tokens）
```

新增依赖：`lucide-react`。

## 数据流

- **实时模式**：WebSocket 协议不变；`progress` 事件同时驱动 ChatTimeline 与 ControlDeck（轮次 / 反馈 / 工具统计均从 chat 状态派生）
- **回顾模式**：点击历史会话 → `GET /api/sessions/:id` → 同一组组件只读渲染（数据源切换，组件不区分模式）
- **任务结束**（`result` 到达）：前端重新拉取会话列表

## 错误处理与实用增强

- **WebSocket 自动重连**：断线后指数退避重连（1s 起，上限 10s），顶栏显示重连状态；替换现在"断线只能刷新"的行为
- REST 请求失败：侧边栏 / 主区内联错误提示 + 重试按钮
- HITL 参数编辑：非法 JSON 时禁用批准按钮并提示

## 测试策略

- 后端（跟随现有 84 个测试的模式，Mock LLM、不依赖网络）：
  - `SessionStore` 单元测试：增删查、倒序、404 分支
  - `/api/sessions` 端点测试：列表、详情、删除
  - 任务完成后会话落库的集成测试（复用现有 harness-demo 测试基建）
- 前端：现状无测试框架，不新增；提供手动验证清单（mock 任务全流程、HITL 三分支含修改参数、历史回顾、断线重连）

## 明确不做（YAGNI）

- 多用户 / 多任务并发（与项目已知限制一致）
- 会话重命名、搜索、分页（列表量小，暂不需要）
- 移动端深度适配
- 原始消息列表的独立查看页
- 主题切换（仅深色 HUD 一套）
