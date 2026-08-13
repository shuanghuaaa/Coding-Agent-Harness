# CaseAI 冷色调 WebUI 重设计 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把 `webui/` 换成 CaseAI Match 的浅底 SaaS 壳（冷灰蓝画布 + 白舞台 + 冷靛强调），功能与 WebSocket 契约不变。

**Architecture:** 先把现有 CSS 变量映射到规格 Token（让 3000 行样式跟色），再把 `App` 壳改成「72px 导航轨 + 画布留白 + 白卡片舞台」。会话列表只出现在 Session 页舞台内；Home 用问候 + Composer + chips + 最近会话。不改后端。

**Tech Stack:** React 18, Vite, lucide-react, 纯 CSS, Inter + Caveat Brush（Google Fonts）

## Global Constraints

- 规格：`docs/superpowers/specs/2026-08-13-caseai-webui-redesign.md`（冷色调已确认）
- 不改 WebSocket / REST 契约；不新增 UI 组件库
- 主按钮近黑 `#1E293B`；强调冷靛 `#4F6BFF`；Caveat 仅 Home 一句问候
- `max_rounds` 文案「达到轮次上限」，class 用 warn 不是 bad
- 前端验证：`cd webui; npm run build`；PowerShell 用 `;` 不用 `&&`
- 不在本计划里 `git commit`（用户未要求提交）

## File map

- Modify: `webui/index.html` — `color-scheme` 改为 light
- Modify: `webui/src/styles.css` — Token、壳、Home、Composer、HITL、表单分栏
- Modify: `webui/src/App.tsx` — AppRail + Stage；Home；Sessions 仅会话页；Projects/Settings 分栏
- Modify: `webui/src/components/HITLModal.tsx` — 主按钮黑底、拒绝描边（class 即可）

---

### Task 1: 冷色 Token + 字体

**Files:**
- Modify: `webui/index.html`
- Modify: `webui/src/styles.css`（`:root` 与 `@import`）

- [ ] **Step 1:** `index.html` 的 `color-scheme` 改为 `light`
- [ ] **Step 2:** Google Fonts 增加 `Caveat+Brush`；`:root` 浅色变量改为规格 Token，并增加 `--canvas/--ink/--primary/--radius-2xl` 等别名；深色按 `#0F172A` 冷反相
- [ ] **Step 3:** `cd webui; npm run build` 必须通过

---

### Task 2: AppRail + 白舞台壳

**Files:**
- Modify: `webui/src/App.tsx`
- Modify: `webui/src/styles.css`（`.app-shell` / `.app-rail` / `.app-canvas` / `.app-stage`）

壳结构：

```tsx
<div className="app-shell">
  <aside className="app-rail">…Home/Sessions/Projects/Settings…</aside>
  <div className="app-canvas">
    <div className="app-stage">
      <div className={`app-body ${page === 'session' ? '' : 'no-sidebar'}`}>
        {page === 'session' && <aside className="sidebar">最近会话…</aside>}
        <main className="main-area">…</main>
      </div>
    </div>
  </div>
</div>
```

- 轨宽 72px；画布 padding 20–24px；舞台 `border-radius: 24px`；`--canvas` 露出一圈
- 导航：Home→`dashboard`，Sessions→最近会话否则新会话，Projects→`project`，Settings→`settings`
- 折叠侧栏只影响 Session 内会话列表，不影响轨
- [ ] **Step:** 改 JSX + CSS 后 `npm run build`

---

### Task 3: Home（Ask + chips + 最近会话）

**Files:**
- Modify: `webui/src/App.tsx`（`page === 'dashboard'` 块）
- Modify: `webui/src/styles.css`（`.page-home`）

- Caveat 问候「想做什么？」颜色 `--display-accent`
- 复用 `handleSubmit` / Composer
- chips：`写一个带测试的函数` / `修复这个 bug` / `重构这段代码` / `生成单元测试` —— 只填入 Composer，不自动发送
- 最近会话扁卡片，点击 `handleSelectSession`
- 去掉统计大盘作为 Home 主角（规格 P2）

---

### Task 4: Session / Composer / 状态 pill

**Files:**
- Modify: `webui/src/App.tsx`（`statusBadge`、Composer 发送钮）
- Modify: `webui/src/styles.css`（`.composer` `.send-btn` `.badge.warn` `.round-card`）

- `max_rounds` → `{ label: '达到轮次上限', className: 'warn' }`
- Composer 浅填 `--fill`，发送钮圆形黑底
- 轮次卡 radius-xl、淡边；用户气泡 ink 底

---

### Task 5: Projects / Settings / HITL

**Files:**
- Modify: `webui/src/App.tsx`（项目页工作区 + helper；设置凭据分栏）
- Modify: `webui/src/styles.css`（`.form-split` `.hitl-dialog`）
- Modify: `webui/src/components/HITLModal.tsx`（批准 `btn-primary`，拒绝 `btn-ghost`）

- Projects：当前工作区 + 最近项目 + 右侧 helper「工具只在工作区内执行」；保留编排区
- Settings：左录入密钥，右说明加密存储
- HITL：白模态；允许黑按钮；拒绝描边

---

### Task 6: 构建验收

- [ ] `cd webui; npm run build` 通过
- [ ] 对照规格第 11 节：浅冷画布、白舞台、黑主按钮、冷靛、Home 问候、HITL 阻断、max_rounds 文案
