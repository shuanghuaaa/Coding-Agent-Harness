# CaseAI Match 风格 · Harness WebUI 重设计规格

日期：2026-08-13  
状态：用户已确认信息架构与视觉系统；色板为近白 + 炭黑单色（已去掉青色）  
范围：`webui/` 视觉与信息架构重设计。Harness 内核、WebSocket 协议、会话/工作区/HITL/凭据 API **不改契约**。  
取代：`docs/superpowers/specs/2026-08-08-mission-control-webui-design.md` 中的**视觉风格与页面壳布局**。该文档中的功能（会话持久化、轮次可观测、HITL 改参、反馈闭环展示）仍然有效。

参考源：`caseaimatch-design (Community).fig` 及用户提供的 6 张 PNG（图标规范、Typography/Radius/Color、Create Case、Cases 列表、组件库、Sign Up/In）。

---

## 1. 目标

把 WebUI 从「深色 Mission Control HUD」换成 CaseAI Match 的 **浅底 SaaS 操作台**：近白画布、白卡片主舞台、Inter 排版、炭黑主按钮与中性强调（无彩色主色）。布局、字体、留白、组件规格与 CaseAI 一致。

功能集合不变。用户仍能：下达任务、看清轮次与工具、看见测试反馈闭环、审批危险动作、管理凭据与工作区、续跑历史会话。

气质：专业、留白、可扫描。不是聊天机器人皮肤，也不是霓虹终端。

---

## 2. 已确认决策

| 决策 | 结论 |
|------|------|
| 改版深度 | 全量 CaseAI 化：Token + 新 IA + 组件规范，不只换肤 |
| 默认主题 | 近白画布 `#F7F7F8`。深色可选，按 `#09090B` 反相，不作为本次必交付 |
| 主按钮 | 炭黑 `#18181B` 白字 |
| 强调 | 与墨色同系：选中/焦点用浅灰底 + 炭黑字；Home 问候 `#3F3F46` |
| Caveat Brush | 仅 Home 一句装饰问候，颜色为深灰而非彩色 |
| 色板 | **近白 + 炭黑单色**：不用青 / 冷灰蓝 / 暖紫 / 洋红 |
| 产品字体 | Inter 400 / 500 / 600 |
| 图标 | Lucide，导航线框/填充切换；`strokeWidth={1.75}`；状态用实心 |
| 动效 | 纯 CSS，&lt;300ms，不引入动画库 |
| 后端 | 不新增协议；不改工具/反馈/HITL 语义 |

---

## 3. 信息架构

### 3.1 CaseAI → Harness 映射

| CaseAI | Harness |
|--------|---------|
| Cases | 会话 / 任务 |
| Ask Me Anything + Prompt chips | 下达编码任务 + 模板快捷入口 |
| Chat box | 用户气泡 + Agent 轮次卡 |
| Case 详情 / 侧栏 | 工作区文件 / Diff / 运行指标 |
| Sign up / credentials | API Key 引导与设置 |
| Alert / modal | HITL 审批、错误提示 |
| Create Case 右栏 helper | Settings / Projects 旁路说明 |

### 3.2 页面

1. **Home**（无活动会话时的默认页）  
   Caveat 问候 + 主输入 + Prompt chips + 最近会话扁卡片列表。
2. **Session Workspace**（主操作台）  
   左 Sessions 箱、中对话流 + Composer、右 Context 箱（Files / Metrics / Checkpoint）。HITL 为阻断模态。
3. **Projects**  
   绑定/切换/解除工作区；分区 + 右侧 helper。
4. **Settings**  
   API Key 状态/录入/清除、默认模型、主题、连接信息。凭据未配置时用认证分栏布局引导。

窄导航轨始终在最左：Home / Sessions / Projects / Settings。可收成仅图标。

### 3.3 会话页交互（功能不变，呈现换皮）

- 轮次默认折叠：摘要 + **最终结果完整可见**；展开才看思考与工具轨迹。
- 反馈闭环：fail → 分类 pill（compile / assertion / timeout / runtime）→ 再修正，作为时间线条目标。
- HITL：全屏遮罩 + 白圆角面板；允许（黑按钮）/ 拒绝（描边）/ 改参数后允许。
- 运行中：页头或 Composer 显示 Running；取消始终可达。
- Markdown 与代码真实渲染；最终结果不困在小滚动框。
- `max_rounds` 文案为「达到轮次上限」，不是「任务失败」。

---

## 4. App Shell 与留白

页面本身不滚动。画布是近白灰；主舞台是浮起的白卡片，四周露出画布，不要三栏贴死窗口。

```text
┌─ 72px 导航轨 ─┬─ 24–32px 间隙 ─┬─ 白卡片主舞台 (radius 24–32, padding 24–32) ─┐
│ Home          │                │ 页头：左标题 · 右主按钮                         │
│ Sessions      │                │ 内容区内部滚动                                 │
│ Projects      │                │ Session 页：左列表 | 中对话 | 右 Context        │
│ Settings      │                │ 底：Composer（仅 Session / Home）              │
└───────────────┴────────────────┴──────────────────────────────────────────────┘
```

**间距（8px 网格）**

| Token | 值 | 用途 |
|-------|-----|------|
| space-1 | 4px | 图标与微间隙 |
| space-2 | 8px | 标签与控件、pill 内边距 |
| space-3 | 12px | 列表项内边距、控件组 |
| space-4 | 16px | 卡片内边距（紧） |
| space-5 | 24px | 卡片内边距（标准）、主舞台 padding |
| space-6 | 32px | 区块之间 |
| space-7 | 48px | 页面大分区（Home 问候与列表之间） |

**Session 主舞台内部分栏**

- 左 Sessions：默认 240px，可拖 200–320px，可折叠。
- 中对话：flex 1，最小宽度 360px。
- 右 Context：默认 280px，可拖 240–400px，可折叠。
- 分栏用 1px `#E4E4E7`，不要厚面板框。
- 窄于 1100px：右栏收为顶栏抽屉；Sessions 收为滑出抽屉。不做移动端深度适配。

**表单页（Projects / Settings）**

Create Case 模式：左约 70% 控件，右约 30% Caption 灰色 helper，竖向对齐对应区块，不用竖线硬分割。区块间距 32–48px。

**认证/凭据引导**

左右分栏：左白底表单，右 `#F4F4F5` 说明（密钥加密存储、无需重复输入）。

---

## 5. 视觉 Token

### 5.1 颜色

相对 CaseAI 原板：去掉彩色主强调；中性面近白 + zinc，交互强调与炭黑同系。语义红绿橙仅用于状态。

```css
--canvas: #F7F7F8;
--surface: #FFFFFF;
--ink: #18181B;
--ink-strong: #09090B;
--muted: #71717A;
--subtle: #A1A1AA;
--border: #E4E4E7;
--fill: #F4F4F5;
--primary: #18181B;
--display-accent: #3F3F46; /* 仅 Caveat 问候 */
--success: #059669;
--success-bg: #ECFDF5;
--warning: #D97706;
--warning-bg: #FFFBEB;
--danger: #DC2626;
--danger-bg: #FEF2F2;
--info-bg: #F4F4F5;
```

主按钮背景 `--ink`，文字白。禁用：`--subtle` 底 + 白字 60% 透明。

### 5.2 字体

- UI：`Inter, ui-sans-serif, system-ui, sans-serif`
- 装饰标题：`Caveat Brush, cursive`（仅 Home 问候一行）
- 代码：`ui-monospace, SFMono-Regular, Menlo, Consolas, monospace`

| 角色 | 大小 / 行高 / 字重 |
|------|-------------------|
| Display | 28–32 / 40 / 600 |
| Headline | 20 / 28 / 600 |
| Title | 16 / 24 / 600 |
| Body | 14 / 22 / 400 |
| Label | 12 / 16 / 500 |
| Caption | 11 / 16 / 400 |

标题 Semi Bold，正文 Regular，侧栏与标签 Medium。禁止 700+ 作为默认标题。

### 5.3 圆角

| Token | 值 | 用途 |
|-------|-----|------|
| radius-sm | 8px | 输入、小控件、checkbox |
| radius-md | 12px | 按钮、下拉 |
| radius-lg | 16px | 用户气泡、小卡片 |
| radius-xl | 24px | 轮次卡、Composer、Context 面板 |
| radius-2xl | 32px | 主舞台白壳 |
| radius-full | 999px | 状态 pill、圆形发送钮 |

### 5.4 阴影与焦点

- shadow-sm：列表项轻微抬起  
- shadow-md：轮次卡、模态  
- 主舞台：白底 + 淡 shadow-md，浮在 `--canvas` 上  
- 不用重描边堆层级  
- Focus：2px 外环 `--primary` 30% 透明；错误态用 `--danger`

### 5.5 图标

- 导航：Outline 默认，Filled = 当前页。
- 状态（成功/警告/拦截）：实心粗图标。
- 工具栏与列表：细线框，圆角端点。
- 默认色 `--ink`；弱化 `--subtle`；激活 `--primary` 或填充 `--ink`。

---

## 6. 组件规格（按功能命名）

| 组件 | 行为与外观 |
|------|------------|
| `AppRail` | 72px 轨；logo + 四项导航 + 底栏主题/折叠 |
| `Stage` | 白卡片主舞台，圆角 24–32，padding 24 |
| `PageHeader` | 左 Headline，右主按钮（黑底） |
| `HomeAsk` | 居中 Display/Caveat 问候 + 宽 Composer + Prompt chips |
| `SessionList` | Cases 风格扁卡片：标题、状态 pill、轮次、相对时间；hover 显示删除 |
| `FilterPills` | 全圆 pill：全部 / 运行中 / 成功 / 失败 / 达上限 |
| `UserBubble` | 右对齐，`--ink` 底白字，radius-lg |
| `RoundCard` | 白底淡边；折叠：meta + 最终结果；展开：思考 → 工具 → 结果 |
| `FeedbackPill` | pass 绿 / fail 红 / 分类橙或青；小胶囊 |
| `ToolStep` | 工具名 + 参数摘要；结果默认可折叠；`write_file` 代码易见 |
| `Composer` | 浅填 `#F4F4F5`、radius-xl；左附件/模型 pill，右黑圆发送 |
| `ContextDock` | pill 切换 Files / Metrics / Checkpoint |
| `HitlModal` | 居中白模态 + 遮罩；命令只读预览；参数 JSON 可编辑 |
| `AlertBar` | 组件库 Alert：左图标，浅色底，radius-md |
| `EmptyState` | 居中 Caption + 一个黑按钮或 Prompt chips |
| `CredentialGate` | 认证分栏：左密码输入，右说明 |

现有 `TaskRoundList` / `MarkdownContent` / `ToolResultView` / `HITLModal` / `DiffPanel` **保留逻辑，换 class 与外壳**，不重写数据流。

---

## 7. 页面映射

### Home

- 无会话选中、或用户点导航 Home。
- 问候一行 Caveat Brush + `#3F3F46`（例如 “What would you like to build?”），其余全部 Inter。
- Prompt chips 四枚：写函数+测试 / 修 bug / 重构 / 生成测试。点击填入 Composer，不自动发送。
- 下方「最近会话」扁列表，点击进入 Session。

### Session Workspace

- 进入方式：Home 发送任务、点会话、或导航 Sessions（打开最近一条，若无则回 Home）。
- 用户消息右气泡；Agent 为 RoundCard。
- 运行中最新轮次自动展开；结束后自动折叠并露出最终结果。
- 右栏 Files 浏览/打开；Metrics 轮次/工具/变更计数；Checkpoint 显示 diff 与回滚。

### Projects

- 当前工作区路径、最近项目、绑定/解除。
- 右侧 helper 解释「工具只在工作区内执行」。

### Settings

- 凭据已配置：状态「已配置」+ 更新/清除。
- 未配置：CredentialGate 阻断或半阻断，保存后才能跑真实 LLM；Mock 模式可提示但允许进入 Home。

---

## 8. 状态视觉

| 状态 | 表现 |
|------|------|
| 未连接 | 顶栏灰点 + AlertBar |
| 已连接 | 绿点 |
| MockLLM | Caption「Mock」pill，不假装真实模型 |
| 运行中 | 浅灰 pill「运行中 · 第 N 轮」+ Composer 禁用发送、显示取消 |
| 等待 HITL | 模态强制；背景不可点 |
| 成功 | 绿 pill |
| 失败 | 红 pill |
| 达轮次上限 | 橙 pill「达到轮次上限」 |
| 已取消 | 灰 pill |
| 工具失败 / 护栏拦截 | RoundCard 内红/琥珀 AlertBar |

---

## 9. 明确不做

- 冷灰蓝铺满、暖紫/洋红铺满、玻璃拟态、霓虹 HUD、深色作为本次默认主题。
- 新增仪表盘统计大屏、多用户、移动端优先。
- 照搬律师/Case 业务文案与角色（Admin/Attorney）。
- 改后端 API 形状或新增 WebSocket 事件。
- 为装饰引入新 UI 组件库（继续 CSS + 现有 React）。

---

## 10. 实施分期

1. **Tokens + App Shell**：CSS 变量、字体引入、`AppRail` + `Stage`、浅色主题替换现有深色变量。
2. **Home**：问候、Composer、chips、最近会话。
3. **Session 中栏**：气泡、RoundCard、Composer、Markdown/代码样式对齐 Token。
4. **Sessions 箱 + Context 箱**：列表、pill、拖拽宽度沿用现有逻辑。
5. **HITL / Settings / Projects**：模态与分栏表单对齐组件库。
6. **打磨**：空态、错态、焦点、折叠导航；可选深色变量（非阻断）。

每期保持现有会话/WS/HITL 行为可回归；优先改 `webui/src/styles.css` 与 `App.tsx` 壳，再下钻组件 class。

---

## 11. 验收

- 新用户 30 秒内能理解：这是指挥并监视会自我纠错的编码 Agent。
- 一次 fail→分类→修正→pass 在 RoundCard 上可讲清，不必读源码。
- HITL 出现时不可能被忽略。
- 最终代码比过程噪音更容易看见。
- 视觉对照 CaseAI PNG 的布局与规范；色板为近白画布、白舞台、炭黑主按钮、青色强调、Inter、大留白、导航填充态。
- 现有 vitest 与 WebUI 构建通过；桌面 Chrome/Edge 可用。
