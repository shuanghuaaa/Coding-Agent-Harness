# 反馈闭环加深设计

日期：2026-08-14  
状态：用户已确认（方案 1 + 失败时展示测试文件片段）  
范围：反馈内核加深（可 mock 单测）+ 会话 UI 通俗展示 + 集成演示  
主贡献对齐：`SPEC.md` §3.3 / §8.2；WebUI 呈现对齐 CaseAI 会话卡（不复活整套 ControlDeck）

---

## 1. 目标

把反馈闭环从「后端能闭环、界面只显示通过/失败」提升为：

1. **机制更深**：历史带类型与摘要；注入文案含分类；同一测试连续失败可检测并警告。  
2. **效果通俗可见**：会话里一眼读懂「哪一轮失败、什么类型、后来是否通过」。  
3. **测试文件可见**：解析到有效 `file:line` 时，可查看该测试文件失败行附近片段。  
4. **可演示**：mock LLM 下确定性复现 fail → 分类 →（可选重复失败）→ 修正 → pass。

成功标准：去掉真实 LLM 后，新机制仍可用单测验证；真人打开会话无需读日志也能讲清修正故事。

---

## 2. 已确认决策

| 决策 | 结论 |
|------|------|
| 交付形态 | C：机制加深 + 界面讲故事 + mock 演示 |
| 实现路径 | 方案 1（主路径加深），不复活 ControlDeck |
| 测试文件 | A：失败卡片可拉取并展示相关测试文件片段 |
| 片段窗口 | 失败行上下各约 8 行（实现时可微调，默认 8） |
| 敏感数据 | 不回传完整测试 stdout 到 history；UI 按需读工作区文件 |

---

## 3. 机制设计

### 3.1 丰富 Feedback / History

扩展 `Feedback`（及写入 `feedbackHistory` 的条目），至少包含：

| 字段 | 含义 |
|------|------|
| `status` | `pass` \| `fail` |
| `round` | 轮次 |
| `summary` | 人话摘要 |
| `failures[]` | 已有 `TestFailure`（含 `type` / `file` / `line` / `testName`） |
| `failureTypes[]` | 本轮出现的类型去重列表，便于 UI pill |
| `repeatedFailure` | 可选：`{ testName, streak, message }` |

`RunResult.feedbackHistory` 从仅 `{ round, status }` 升级为上述结构化条目（向后兼容：旧会话缺字段时 UI 降级为只显示 status）。

### 3.2 重复失败检测

新增纯函数（建议 `src/feedback/repeated-failure.ts`）：

- 输入：当前 `Feedback` + 既有 `feedbackHistory`  
- 规则：对 `status === 'fail'` 的条目，按主要失败的 `testName`（若无则用 `file:line` 指纹）统计连续失败次数  
- 阈值：默认连续 **≥ 2** 次同名失败即标记 `repeatedFailure`（第二次出现即提示「再次失败」）  
- 输出写入当前 Feedback，并进入 Injector 文案

不依赖 LLM；单测直接构造 history 断言。

### 3.3 Injector 文案

失败消息须包含：

- `[FAIL]` + summary + round  
- 每条失败：`testName`、`type`（中英文或机器可读标签）、expected/got、`file:line`  
- 若有 `repeatedFailure`：追加一行警告，例如 `WARNING: "add" failed 3 times in a row. Try a different fix.`  
- 仍要求：先修代码再跑测

通过消息保持 `[PASS] …`。

### 3.4 主循环与进度事件

`AgentLoop` 在 `run_test` 反馈路径：

1. `validator.validate(...)`  
2. `detectRepeatedFailure(...)` 合并进 Feedback  
3. push 丰富 history  
4. `injector.inject(...)`  
5. `progress` / 持久化带上：`feedbackStatus`、以及精简的 `feedback` 摘要（types、summary、failures 的 file/line/testName/type、repeatedFailure）

协议：在现有 `RoundProgress` 上**扩展可选字段**，不删除旧字段。WebUI 忽略未知字段应仍可用。

### 3.5 Validator 小改进（可选但推荐）

当同时有 `stdout` 与 `error` 时：优先用能解析出 failures 的 stdout；避免仅因 stderr 存在就丢掉框架解析结果。保持确定性，补单测。

---

## 4. WebUI 呈现（通俗）

### 4.1 反馈轨迹（Agent 卡片）

在收缩/展开的 Agent 卡上增加「反馈轨迹」条（新小组件即可，可复用旧 `FeedbackTrail` 样式思想）：

- 有反馈的轮次：红点 `✕` + 类型 pill（断言 / 编译 / 超时 / 运行时）  
- 通过：绿点 `✓`  
- 文案示例：`第 2 轮 ✕ 断言失败 → 第 4 轮 ✓ 通过`  
- 有 `repeatedFailure`：单独一行提示，如 ``「add」已连续失败 3 次，建议换思路``

数据来源：实时 `progress` + 会话 `result.feedbackHistory` / 各 step 的 feedback 摘要。

### 4.2 工具区文案

仅当该工具调用关联到 `run_test` 反馈时显示「测试通过 / 测试未通过」；无反馈的工具保持「执行完成」，避免误标。

### 4.3 测试文件片段（确认项 A）

当失败条目含有效 `file`（非 `(unknown)`）时：

1. 反馈详情区提供「查看测试文件」展开/按钮  
2. 调用现有工作区读文件 API（与 `ToolResultView` / `getWorkspaceFile` 同路径策略）  
3. 若 `line > 0`：展示该行上下各约 8 行，高亮失败行  
4. 读失败或路径越界：显示路径 + 简短错误，不打断会话

不在服务端把整个测试文件塞进 feedbackHistory（避免 blob 膨胀）；UI 按需加载。

### 4.4 不做

- 不接回完整 ControlDeck / RoundTimeline 作为主布局  
- 不新增独立「演示静态页」（演示靠 mock 测试 + 真实会话 UI）

---

## 5. 测试与机制演示

| 用例 | 断言 |
|------|------|
| Injector 含 type | 构造带 `assertion` 的 Feedback → 文案含类型 |
| 重复失败 | history 两轮同 `testName` fail → `repeatedFailure.streak >= 2` 且注入含 WARNING |
| Validator stdout 优先 |（若做 3.5）stdout 可解析时 failures 非空 |
| harness-demo | mock：fail（含类型）→ 再 fail 同名 → 提示重复 → 修正 → pass；每次确定性 |

所有新测不依赖网络与真实 LLM。

---

## 6. 主要改动面（文件级）

| 区域 | 路径（预期） |
|------|----------------|
| 类型 | `src/feedback/types.ts` |
| 重复失败 | `src/feedback/repeated-failure.ts`（新） |
| 注入 | `src/feedback/injector.ts` |
| 校验 | `src/feedback/validator.ts`（可选） |
| 循环 / 进度 | `src/agent/loop.ts` |
| 会话持久化 | `src/server/session-store.ts`、`http-server.ts`（透传字段） |
| 前端类型 | `webui/src/types.ts` |
| 轨迹 UI | `webui/src/components/` 新小组件或扩展 `TaskRoundList.tsx` |
| 文件片段 | 复用 `getWorkspaceFile` + 小片段视图 |
| 测试 | `tests/feedback/*`、`tests/integration/harness-demo.test.ts` |

---

## 7. 风险与边界

| 风险 | 对策 |
|------|------|
| 旧会话无丰富 history | UI 仅显示 status；不报错 |
| stack 路径不在工作区 | 片段区降级为路径文案 |
| progress 载荷变大 | 只传 failures 摘要字段，不传 `raw` 全文 |
| 中文任务下 testName 不稳定 | 指纹回退 `file:line`；提示用可用名称 |

---

## 8. 验收清单

- [ ] mock 下重复失败检测单测绿  
- [ ] injector 文案含失败类型与重复警告  
- [ ] harness-demo 故事完整且确定性  
- [ ] 会话 Agent 卡可见通俗反馈轨迹  
- [ ] 失败时可展开相关测试文件片段（路径有效时）  
- [ ] 无反馈的工具不再误标「反馈失败」
