# DESIGN.md — CaseAI Harness WebUI

Brand contract for the Coding Agent Harness WebUI (CaseAI Match, 2026-08).

取代早期「Harness Mission Control / Terminal」深色 HUD 合同。功能能力不变；视觉与信息架构见 `docs/superpowers/specs/2026-08-13-caseai-webui-redesign.md`。

## Identity

| Field | Value |
|-------|--------|
| System name | **Coding Agent Harness** |
| Visual system | CaseAI Match 浅色 SaaS 操作台 |
| Mood | 专业、留白、可扫描 |
| Density | 中等；轮次默认折叠，最终结果完整可见 |

## Color tokens

| Token | Value | Usage |
|-------|--------|--------|
| `--canvas` | `#F7F7F8` | 页面画布 |
| `--surface` | `#FFFFFF` | 主舞台 / 卡片 |
| `--ink` / `--ink-strong` | `#18181B` / `#09090B` | 正文 / 强对比 |
| `--muted` / `--subtle` | `#71717A` / `#A1A1AA` | 次要文案 |
| `--fill` | `#F4F4F5` | 浅填充、inset |
| `--primary` | `#18181B` | 主按钮（白字） |
| `--display-accent` | `#3F3F46` | Home 问候等装饰字色 |
| `--border` / `--border-strong` | `#E4E4E7` / `#D4D4D8` | 分隔线 |
| `--success` / `--warn` / `--danger` | `#059669` / `#D97706` / `#DC2626` | 状态（反馈 pill、HITL） |

单色主色板：无青 / 紫 / 洋红作为品牌主色。深色主题可选，非必交付。

## Typography

- **UI：** Inter 400 / 500 / 600（产品正文字体）
- **装饰问候（Home）：** Caveat Brush，仅一句，颜色为深灰
- **代码：** 等宽栈（用于终端块 / 代码块）
- 避免把 Inter 换成系统默认栈以外的「AI 默认」展示字体组合

## Layout

窄导航轨始终在最左：Home / 新建任务 / 会话 / 项目 / 设置（可收成仅图标）。

1. **Home** — Caveat 问候 + 主输入 + 角色选择  
2. **Session** — 对话流 + Composer；右侧 Context（文件树 / Metrics / Checkpoint）始终保留目录  
3. **文件编辑栏** — 点文件后出现在左导航右侧、对话左侧；可并列最多 4 个；不替换文件树  
4. **Projects** — 「导入」本机文件夹；三角色卡片点击进入会话（无「打开」服务器磁盘）  
5. **Settings** — API Key、模型、连接信息  

页面本身尽量不滚动；主舞台为浮起白卡片，四周露出画布。

## Components

- **轮次卡：** 默认折叠摘要；展开看思考与工具轨迹；最终结果完整可见  
- **FeedbackTrail：** fail → 分类 pill → 再修正的时间线；可打开测试文件片段  
- **角色选择：** Composer 旁下拉，多选 Coder / Reviewer / Tester（≥1）；改选对下一次发送生效  
- **HITL modal：** 白圆角面板；允许（黑按钮）/ 拒绝（描边）/ 改参后允许  
- **Markdown / 工具结果：** 真实渲染；工具输出用 `ToolResultView`

## Motion

| Interaction | Motion |
|-------------|--------|
| Button press | `transform: scale(0.97)` ~120ms ease-out |
| Modal / panel appear | opacity + 轻微 translateY，&lt;300ms |
| 状态色切换 | border/color ~200–300ms |

纯 CSS，不引入动画库。

## Toolchain

| Layer | Choice |
|-------|--------|
| Icons | lucide-react（`strokeWidth≈1.75`） |
| Animation | Pure CSS |
| Data | WebSocket + `/api/sessions` / credentials / workspace / checkpoint |
| Implementation | React 18 + Vite in `webui/` |

## Related specs

- CaseAI 重设计：`docs/superpowers/specs/2026-08-13-caseai-webui-redesign.md`
- 反馈 UI：`docs/superpowers/specs/2026-08-14-feedback-loop-deepening-design.md`
- 角色多选：`docs/superpowers/specs/2026-08-14-session-role-multiselect-design.md`
