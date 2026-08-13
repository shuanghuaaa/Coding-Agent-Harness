# 会话角色多选与项目页入口

日期：2026-08-14  
状态：用户已确认（「继续」）  
范围：去掉项目页编排启动栏；三角色卡片进会话；会话内多选角色（1～3），锁定可即时改

## 决策

| 项 | 结论 |
|----|------|
| 侧栏独立编排模块 | 不做 |
| 项目页编排表单 | 删除 |
| 项目页三角色卡片 | 点击 → 打开会话并预勾该角色 |
| 会话角色 | 多选 Coder/Reviewer/Tester，至少 1 个 |
| 生效时机 | 会话级；改勾选后下一次发送立即按新集合；不强制打断进行中任务 |
| 发送 | 1 角色 → 单角色 loop；2～3 角色 → 编排，顺序固定 coder→reviewer→tester，仅跑勾选的 |

## 协议

- 单角色：`task` payload 增加可选 `agentRole: AgentRole`
- 多角色：走现有 `orchestrate`，payload 增加 `roles: AgentRole[]`；服务端 Orchestrator 按传入子集执行

## UI

- 会话 Composer 旁多选 chips（禁用最后一个取消，保证 ≥1）
- 项目页卡片 `onClick` → `setPage('session')` + 设置 `selectedRoles`
- 去掉 orchestrate textarea / 最大重试 / 启动编排（maxRetries 可保留默认常量）
