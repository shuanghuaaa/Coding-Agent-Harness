# File Viewer · Session Resume · Multi-Agent Orchestrator Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 让 WebUI 能打开真实工作区文件、历史会话可续跑写回同一 session，并实现带契约门禁与工具隔离的 Coder→Reviewer→Tester Orchestrator。

**Architecture:** 新增 `readWorkspaceFile` HTTP API；`AgentLoop.run` 支持 `priorMessages`；`SessionStore.update` 写回续跑；新模块 `src/orchestration/`（角色注册表 + 门禁解析 + Orchestrator）通过过滤后的 `ToolDispatcher` 串行跑三角色；WS 增加 `orchestrate` 与 `orchestrator_status`；前端去掉 review 只读锁与 MOCK_AGENTS。

**Tech Stack:** TypeScript, Express, ws, better-sqlite3, vitest, React 18, Vite

## Global Constraints

- Shell 是 PowerShell：命令链用 `;`，commit 用多个 `-m`，不用 bash heredoc
- 后端测试：仓库根目录 `npm test -- <path>`
- 前端构建：`webui` 目录 `npm run build`
- 机制须 mock LLM 可测；工具隔离与门禁必须是代码，不是提示词
- `maxRetries` 可配置，默认 `2`
- 续跑写回同一 `sessionId`；文件查看器只读
- UI 文案中文；不引入新 npm 依赖（除非测试必须）
- 实现严格按 `docs/superpowers/specs/2026-08-10-file-session-orchestrator-design.md`

---

## File Structure

| Path | Responsibility |
|------|----------------|
| `src/tools/file-tools.ts` | Export `resolveWorkspacePath` (existing guard) |
| `src/workspace/read-file.ts` | `readWorkspaceFile(root, relPath)` → content or typed error |
| `src/server/http-server.ts` | `GET /api/workspace/file`, task `sessionId`, `orchestrate` handler |
| `src/server/session-store.ts` | `update(id, input)` |
| `src/server/types.ts` | WS types: `orchestrate`, `orchestrator_status` |
| `src/agent/loop.ts` | `run(task, { priorMessages? })`; `RoundProgress.agentRole?` |
| `src/orchestration/roles.ts` | Role defs: prompts + allowed tool names |
| `src/orchestration/artifacts.ts` | Parse stage artifact / gate decision |
| `src/orchestration/orchestrator.ts` | State machine + retries |
| `webui/src/api/workspace.ts` | `getWorkspaceFile` |
| `webui/src/hooks/useWebSocket.ts` | sessionId, orchestrate, orchestrator status |
| `webui/src/App.tsx` | File viewer, resume, multi-agent UI |
| `webui/src/types.ts` | Matching WS/API types |
| `tests/workspace/read-file.test.ts` | Path + read tests |
| `tests/server/session-store.test.ts` | Extend update tests |
| `tests/agent/loop-resume.test.ts` | priorMessages |
| `tests/orchestration/artifacts.test.ts` | Gate parsing |
| `tests/orchestration/orchestrator.test.ts` | Full mock flows |
| `tests/orchestration/roles.test.ts` | Tool allowlist |

---

### Task 1: Workspace file read API

**Files:**
- Modify: `src/tools/file-tools.ts` — export `resolveWorkspacePath`
- Create: `src/workspace/read-file.ts`
- Modify: `src/server/http-server.ts` — add GET route near `/api/workspace/files`
- Test: `tests/workspace/read-file.test.ts`

**Interfaces:**
- Produces: `readWorkspaceFile(root: string, relativePath: string, maxBytes?: number): { path: string; content: string; size: number }`
- Throws / returns error codes used by HTTP: traversal → throw; missing → throw with message; too large / binary → throw with message containing `too large` or `binary`

- [ ] **Step 1: Write the failing test**

Create `tests/workspace/read-file.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWorkspaceFile } from '../../src/workspace/read-file';

describe('readWorkspaceFile', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ws-read-'));
    writeFileSync(join(root, 'hello.txt'), 'hello world', 'utf-8');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads a text file relative to root', () => {
    const r = readWorkspaceFile(root, 'hello.txt');
    expect(r.content).toBe('hello world');
    expect(r.path).toBe('hello.txt');
    expect(r.size).toBeGreaterThan(0);
  });

  it('blocks path traversal', () => {
    expect(() => readWorkspaceFile(root, '../secret')).toThrow(/traversal|blocked/i);
  });

  it('rejects missing files', () => {
    expect(() => readWorkspaceFile(root, 'nope.txt')).toThrow(/not found|ENOENT|Failed/i);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/workspace/read-file.test.ts`  
Expected: FAIL (module not found)

- [ ] **Step 3: Implement**

In `file-tools.ts`, export the existing resolver:

```ts
export function resolveWorkspacePath(inputPath: string, root: string = workspaceRoot): string {
  const resolved = path.resolve(root, inputPath);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path traversal blocked: ${inputPath}`);
  }
  return resolved;
}
```

Refactor internal `resolvePath` to call `resolveWorkspacePath(inputPath)`.

Create `src/workspace/read-file.ts`:

```ts
import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { resolveWorkspacePath } from '../tools/file-tools';

const DEFAULT_MAX = 1 * 1024 * 1024;

export function readWorkspaceFile(
  root: string,
  relativePath: string,
  maxBytes: number = DEFAULT_MAX,
): { path: string; content: string; size: number } {
  const abs = resolveWorkspacePath(relativePath, root);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw new Error(`File not found: ${relativePath}`);
  }
  if (!st.isFile()) throw new Error(`Not a file: ${relativePath}`);
  if (st.size > maxBytes) throw new Error(`File too large: ${relativePath}`);
  const buf = readFileSync(abs);
  if (buf.includes(0)) throw new Error(`binary file not supported: ${relativePath}`);
  const content = buf.toString('utf-8');
  const rel = relative(root, abs).replace(/\\/g, '/');
  return { path: rel, content, size: st.size };
}
```

In `http-server.ts` after files route:

```ts
this.app.get('/api/workspace/file', requireToken, (req, res) => {
  const p = typeof req.query.path === 'string' ? req.query.path : '';
  if (!p) {
    res.status(400).json({ error: 'missing path' });
    return;
  }
  try {
    res.json(readWorkspaceFile(this.workspaceRoot, p));
  } catch (err) {
    const msg = String(err);
    const status = /traversal|blocked/i.test(msg) ? 400
      : /not found/i.test(msg) ? 404
      : /too large|binary/i.test(msg) ? 415
      : 500;
    res.status(status).json({ error: msg });
  }
});
```

- [ ] **Step 4: Run tests — expect PASS**

Run: `npm test -- tests/workspace/read-file.test.ts`

- [ ] **Step 5: Commit**

```powershell
git add src/tools/file-tools.ts src/workspace/read-file.ts src/server/http-server.ts tests/workspace/read-file.test.ts
git commit -m "feat(workspace): add safe read-file API for WebUI"
```

---

### Task 2: SessionStore.update

**Files:**
- Modify: `src/server/session-store.ts`
- Modify: `tests/server/session-store.test.ts`

**Interfaces:**
- Produces: `update(id: number, input: NewSession): boolean` — returns false if id missing; does not change `created_at`

- [ ] **Step 1: Write failing test** (append to existing session-store tests)

```ts
it('update rewrites status rounds and data for existing id', () => {
  const id = store.save({
    task: 't1',
    status: 'completed',
    rounds: 1,
    data: { progressEvents: [], feedbackHistory: [], messages: [] },
  });
  const ok = store.update(id, {
    task: 't1',
    status: 'completed',
    rounds: 3,
    data: {
      progressEvents: [],
      feedbackHistory: [],
      messages: [{ role: 'user', content: 'again' }],
    },
  });
  expect(ok).toBe(true);
  const row = store.get(id)!;
  expect(row.rounds).toBe(3);
  expect(row.data.messages[0].content).toBe('again');
  expect(store.update(99999, { task: 'x', status: 'error', rounds: 0, data: { progressEvents: [], feedbackHistory: [], messages: [] } })).toBe(false);
});
```

- [ ] **Step 2: Run test — expect FAIL** (update not defined)

Run: `npm test -- tests/server/session-store.test.ts`

- [ ] **Step 3: Implement**

```ts
update(id: number, input: NewSession): boolean {
  const info = this.db
    .prepare('UPDATE sessions SET task = ?, status = ?, rounds = ?, data = ? WHERE id = ?')
    .run(input.task, input.status, input.rounds, JSON.stringify(input.data), id);
  return info.changes > 0;
}
```

- [ ] **Step 4: Run tests — expect PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/server/session-store.ts tests/server/session-store.test.ts
git commit -m "feat(sessions): support update for resume writes"
```

---

### Task 3: AgentLoop resume via priorMessages

**Files:**
- Modify: `src/agent/loop.ts` — `run` signature + `RoundProgress.agentRole?`
- Create: `tests/agent/loop-resume.test.ts`

**Interfaces:**
- Consumes: `ContextBuilder.build(history)`
- Produces: `run(task: string, options?: { priorMessages?: Message[]; agentRole?: string }): Promise<RunResult>`
- When `priorMessages` provided: strip any `role==='system'` from prior, then `build([...nonSystemPrior, { role:'user', content: task }])`
- Progress events include `agentRole` when options.agentRole set

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';

function makeLoop(responses: ConstructorParameters<typeof MockLLM>[0]) {
  return new AgentLoop({
    llm: new MockLLM(responses),
    dispatcher: new ToolDispatcher([]),
    contextBuilder: new ContextBuilder({ systemPrompt: 'sys', configRules: [], memories: [] }),
    stopCondition: new StopCondition({ maxRounds: 5 }),
    validator: new FeedbackValidator(),
    injector: new FeedbackInjector(),
  });
}

describe('AgentLoop resume', () => {
  it('appends new user turn after prior messages', async () => {
    const loop = makeLoop([{ content: 'continued', tool_calls: [], finish_reason: 'stop' }]);
    const result = await loop.run('follow up', {
      priorMessages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer1' },
      ],
    });
    expect(result.status).toBe('completed');
    const users = result.messages.filter((m) => m.role === 'user').map((m) => m.content);
    expect(users).toContain('first');
    expect(users[users.length - 1]).toBe('follow up');
    expect(result.messages.some((m) => m.role === 'system')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (run ignores options)

Run: `npm test -- tests/agent/loop-resume.test.ts`

- [ ] **Step 3: Implement minimal change in `loop.ts`**

```ts
export interface RoundProgress {
  round: number;
  assistantContent: string;
  actions: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
  agentRole?: string;
}

export interface RunOptions {
  priorMessages?: Message[];
  agentRole?: string;
}

async run(task: string, options?: RunOptions): Promise<RunResult> {
  this.cancelled = false;
  this.feedbackHistory = [];
  const prior = (options?.priorMessages ?? []).filter((m) => m.role !== 'system');
  this.messages = this.config.contextBuilder.build([
    ...prior,
    { role: 'user', content: task },
  ]);
  // ... rest unchanged; when emitProgress, pass agentRole: options?.agentRole
}
```

Update `emitProgress` / call sites to attach `agentRole` from a private field set at start of `run`: `this.currentAgentRole = options?.agentRole`.

- [ ] **Step 4: Run — expect PASS** (also run `tests/agent/loop.test.ts` to ensure no regression)

- [ ] **Step 5: Commit**

```powershell
git add src/agent/loop.ts tests/agent/loop-resume.test.ts
git commit -m "feat(agent): resume runs with priorMessages"
```

---

### Task 4: Role registry + tool allowlist

**Files:**
- Create: `src/orchestration/roles.ts`
- Create: `tests/orchestration/roles.test.ts`
- Optionally small helper: `createDispatcherForRole(role, allTools: Tool[]): ToolDispatcher`

**Interfaces:**
- Produces:
  ```ts
  export type AgentRole = 'coder' | 'reviewer' | 'tester';
  export interface RoleDefinition {
    role: AgentRole;
    systemPrompt: string;
    allowedTools: string[];
  }
  export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition>;
  export function filterToolsForRole(role: AgentRole, tools: Tool[]): Tool[];
  ```
- reviewer `allowedTools`: `read_file`, `search`, `git_diff` (match actual tool names in repo)
- tester: `read_file`, `run_test`, `search` (and shell only if existing tests use it — prefer `run_test` + `read_file` + `git_diff`)
- coder: full coding set used in `src/index.ts` minus nothing critical

- [ ] **Step 1: Grep actual tool names** from `src/index.ts` / tools, then write test:

```ts
import { describe, it, expect } from 'vitest';
import { filterToolsForRole, ROLE_DEFINITIONS } from '../../src/orchestration/roles';
import type { Tool } from '../../src/tools/base';

const fake = (name: string): Tool => ({
  name,
  description: name,
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ tool_call_id: '', content: 'ok' }),
});

describe('role tool isolation', () => {
  const all = ['read_file', 'write_file', 'delete_file', 'shell', 'search', 'git_diff', 'run_test'].map(fake);

  it('reviewer cannot get write_file', () => {
    const tools = filterToolsForRole('reviewer', all);
    expect(tools.map((t) => t.name)).not.toContain('write_file');
    expect(tools.map((t) => t.name)).not.toContain('delete_file');
  });

  it('tester cannot get write_file', () => {
    expect(filterToolsForRole('tester', all).map((t) => t.name)).not.toContain('write_file');
  });

  it('coder includes write_file', () => {
    expect(filterToolsForRole('coder', all).map((t) => t.name)).toContain('write_file');
  });

  it('every role has a non-empty systemPrompt', () => {
    for (const r of Object.values(ROLE_DEFINITIONS)) {
      expect(r.systemPrompt.length).toBeGreaterThan(20);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `roles.ts`** with Chinese/English prompts stating role duties and that reviewer/tester must not modify code; `filterToolsForRole` filters by `allowedTools` set.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration/roles.ts tests/orchestration/roles.test.ts
git commit -m "feat(orchestration): role registry with tool allowlists"
```

---

### Task 5: Artifact parsing + gate decisions

**Files:**
- Create: `src/orchestration/artifacts.ts`
- Create: `tests/orchestration/artifacts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StageArtifact {
    role: AgentRole;
    summary: string;
    changedFiles: string[];
    findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
    testStatus?: 'pass' | 'fail' | 'skipped';
    rawExcerpt?: string;
  }
  export type GateDecision =
    | { action: 'continue' }
    | { action: 'retry_coder'; reason: string }
    | { action: 'warn'; reason: string };

  export function parseArtifactFromAssistant(role: AgentRole, content: string, changedFiles: string[]): StageArtifact;
  export function decideGate(artifact: StageArtifact): GateDecision;
  ```
- Parser: look for fenced JSON block \`\`\`json ... \`\`\` or a line starting with `ARTIFACT:` + JSON; on failure return artifact with empty findings / `testStatus: 'skipped'` and summary = truncated content; `decideGate` then `continue` (warn path can be logged by orchestrator when parse soft-failed — expose `parseOk: boolean` on artifact or return `{ artifact, parseOk }`)

Prefer:

```ts
export function parseStageOutput(role: AgentRole, content: string, changedFiles: string[]): { artifact: StageArtifact; parseOk: boolean }
```

Gate:
- reviewer + any finding severity `block` → `retry_coder`
- tester + `testStatus === 'fail'` → `retry_coder`
- else `continue`

- [ ] **Step 1: Write tests** covering block, fail, pass, malformed → continue

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration/artifacts.ts tests/orchestration/artifacts.test.ts
git commit -m "feat(orchestration): stage artifacts and gate decisions"
```

---

### Task 6: Orchestrator state machine

**Files:**
- Create: `src/orchestration/orchestrator.ts`
- Create: `tests/orchestration/orchestrator.test.ts`

**Interfaces:**
- Consumes: `AgentLoop`, `ROLE_DEFINITIONS`, `filterToolsForRole`, `parseStageOutput`, `decideGate`, `Tool[]`, factories for building per-role loops
- Produces:
  ```ts
  export interface OrchestratorStatus {
    phase: string;
    roles: Record<AgentRole, 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error'>;
    retryCount: number;
    maxRetries: number;
    lastGate?: { from: string; reason: string };
  }

  export interface OrchestrationResult {
    status: 'completed' | 'failed' | 'cancelled';
    stages: StageArtifact[];
    retries: number;
    messages: Message[];
    progressEvents: RoundProgress[];
  }

  export class Orchestrator {
    constructor(private deps: {
      createLoop: (role: AgentRole, onProgress: ProgressCallback) => AgentLoop;
      maxRetries: number;
      onStatus?: (s: OrchestratorStatus) => void;
    }) {}
    run(task: string, options?: { priorMessages?: Message[] }): Promise<OrchestrationResult>;
    cancel(): void;
  }
  ```

Behavior sketch for `run`:
1. Emit status idle→coder running
2. `loop.run(coderTask, { priorMessages, agentRole:'coder' })` where coderTask includes user task + instruction to end with ARTIFACT JSON
3. Collect changedFiles from checkpoint diff helper passed in OR from artifact / empty array if unknown — for tests, pass `getChangedFiles: () => string[]` in deps defaulting to `() => []`
4. Parse artifact; gate; if retry and retryCount < maxRetries, increment and goto coder with prior = accumulated messages + gate reason user message
5. Same for reviewer then tester
6. On cancel flag, return cancelled

- [ ] **Step 1: Write mock-LLM orchestrator tests** for happy path, review block then success, test fail until retries exhausted

Use MockLLM queued responses that return stop with ARTIFACT JSON in content (no tools) to keep tests simple.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement orchestrator.ts**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration/orchestrator.ts tests/orchestration/orchestrator.test.ts
git commit -m "feat(orchestration): coder-reviewer-tester orchestrator with retries"
```

---

### Task 7: Wire HTTP/WS server

**Files:**
- Modify: `src/server/types.ts`
- Modify: `src/server/http-server.ts`
- Modify: `src/index.ts` only if tool list must be passed into server for orchestrator
- Test: extend or add `tests/server/orchestrate-ws.test.ts` (optional if heavy — prefer unit orchestrator already covered; add one integration with MockLLM + WS if time)

**Interfaces:**
- `WSMessage.type` includes `'orchestrate' | 'orchestrator_status'`
- `task` payload: `{ task: string; sessionId?: number }`
- `orchestrate` payload: `{ task: string; maxRetries?: number; sessionId?: number }`
- `saveSession` → if sessionId provided and `update` succeeds, use it; else `save`
- If `runningLoops.has(ws)` already when new task/orchestrate: send status error `busy` and return
- Default maxRetries: `Number(process.env.ORCHESTRATOR_MAX_RETRIES ?? 2)`

Implementation notes:
- Refactor `handleMessage` task branch to read `sessionId`, load prior messages from store
- Build orchestrator with `createLoop(role)` cloning `this.loop.config` but replacing `contextBuilder` system prompt from role + `dispatcher: new ToolDispatcher(filterToolsForRole(role, allTools))`
- Server needs access to full `Tool[]` — add constructor arg `tools: Tool[]` or read from `this.loop.config.dispatcher` by adding `ToolDispatcher.listTools(): Tool[]`

Add to dispatcher:

```ts
listTools(): Tool[] {
  return Array.from(this.tools.values());
}
```

- [ ] **Step 1: Add dispatcher.listTools + failing test in dispatcher.test.ts**

- [ ] **Step 2: Implement listTools**

- [ ] **Step 3: Wire http-server task resume + orchestrate + status broadcasts**

- [ ] **Step 4: Run** `npm test -- tests/tools/dispatcher.test.ts tests/orchestration/orchestrator.test.ts tests/agent/loop-resume.test.ts`

- [ ] **Step 5: Commit**

```powershell
git add src/tools/dispatcher.ts src/server/types.ts src/server/http-server.ts tests/tools/dispatcher.test.ts
git commit -m "feat(server): session resume and orchestrate WebSocket protocol"
```

---

### Task 8: Frontend — types, API, WebSocket hook

**Files:**
- Modify: `webui/src/types.ts`
- Modify: `webui/src/api/workspace.ts`
- Modify: `webui/src/hooks/useWebSocket.ts`

**Interfaces:**
- `getWorkspaceFile(path: string): Promise<{ path; content; size }>`
- `sendTask(task: string, opts?: { sessionId?: number })`
- `sendOrchestrate(task: string, opts?: { maxRetries?: number; sessionId?: number })`
- State: `orchestratorStatus`, `activeSessionId` can live in App; hook exposes status + clear
- Progress type includes `agentRole?: string`
- On progress, if agentRole present, include in chat item (extend ChatItem with `agentRole?: string`)

- [ ] **Step 1: Implement API + types**

- [ ] **Step 2: Update useWebSocket** for new message types and send signatures; seed chat when App passes history separately is OK

- [ ] **Step 3: `npm run build` in webui** — fix TS errors

- [ ] **Step 4: Commit**

```powershell
git add webui/src/types.ts webui/src/api/workspace.ts webui/src/hooks/useWebSocket.ts
git commit -m "feat(webui): APIs and WS for file read, resume, orchestrate"
```

---

### Task 9: Frontend — App UX (file viewer, resume, multi-agent)

**Files:**
- Modify: `webui/src/App.tsx`
- Modify: `webui/src/styles.css` (viewer + role badges + orchestrator cards)

**Behavior checklist (must all work):**
1. Click file in tree → load content → show readonly viewer with close button
2. Select recent session → show history, composer **enabled**, send with `sessionId`; remove review-only lock
3. New session clears `activeSessionId`
4. Multi-agent page: remove MOCK_AGENTS metrics; show role cards from `orchestratorStatus`; input + maxRetries + start orchestrate; navigate/show progress with role labels
5. Activity feed remains real sessions

- [ ] **Step 1: Implement file viewer state** `selectedFile: { path, content } | null`

- [ ] **Step 2: Replace review lock with `activeSessionId` + hydrate chat from session via new hook method `seedChat(items)` or setChat export

Add to useWebSocket:

```ts
const seedChat = useCallback((items: ChatItem[]) => {
  setChat(items);
  idRef.current = items.length;
}, []);
```

- [ ] **Step 3: Multi-agent page real wiring**

- [ ] **Step 4: Build** `cd webui; npm run build` Expected: success

- [ ] **Step 5: Commit**

```powershell
git add webui/src/App.tsx webui/src/styles.css webui/src/hooks/useWebSocket.ts
git commit -m "feat(webui): file viewer, session resume, live multi-agent page"
```

---

### Task 10: Verification sweep

- [ ] **Step 1: Run backend tests**

```powershell
npm test -- tests/workspace/read-file.test.ts tests/server/session-store.test.ts tests/agent/loop-resume.test.ts tests/orchestration/
```

Expected: all PASS

- [ ] **Step 2: Run webui build**

```powershell
Set-Location webui; npm run build
```

Expected: exit 0

- [ ] **Step 3: Manual smoke (if servers up)**
- Open file from tree
- Resume a session with a short follow-up (mock or real LLM)
- Start orchestrate from multi-agent page; watch role statuses

- [ ] **Step 4: Final commit only if leftover fixes**

---

## Spec coverage self-check

| Spec section | Task |
|--------------|------|
| §2 file read API + viewer | T1, T8, T9 |
| §3 resume priorMessages + update + UI | T2, T3, T7, T8, T9 |
| §4 roles / allowlist | T4 |
| §4 artifacts / gates | T5 |
| §4 orchestrator + maxRetries | T6, T7 |
| §4 WS orchestrate + status | T7, T8 |
| §4 multi-agent UI no mocks | T9 |
| mock tests matrix | T5–T6 |

## Placeholder scan

None intentional. Tool name lists in Task 4 must be verified against `src/index.ts` at implement time.
