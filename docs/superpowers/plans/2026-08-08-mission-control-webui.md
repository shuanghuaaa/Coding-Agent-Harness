# Mission Control WebUI Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 将 WebUI 重设计为三栏任务控制台（会话历史栏 + 对话时间线 + Agent 控制台面板组，深色科技 HUD 风格），并为后端新增会话持久化（SessionStore + `/api/sessions` REST API）。

**Architecture:** 后端新增 `SessionStore`（仿 `MemoryStore` 模式，better-sqlite3，独立文件 `data/sessions.db`），`HarnessServer` 在任务结束（含 error/cancel）时落库并暴露 REST API；前端按"叶子组件先行、App 最后接线"的顺序重写，WebSocket 协议不变。

**Tech Stack:** TypeScript, Express, better-sqlite3, vitest / React 18, Vite, lucide-react（唯一新依赖）, 纯 CSS。

## Global Constraints

- **Shell 是 PowerShell**：命令链用 `;` 而不是 `&&`；不支持 heredoc。
- 后端测试：仓库根目录运行 `npm test`（vitest run）。
- 前端验证：`cd webui; npm run build`（含 `tsc -b` 类型检查），验证后 `cd ..` 回到根目录。
- 提交风格：conventional commits（`feat:` / `fix:` / `docs:` / `chore:`），参考 `git log`。
- 每次提交只 `git add` 本任务相关文件；**不要**提交 `webui/tsconfig.tsbuildinfo`、`data/`、根目录的 `*.py` / `__pycache__/` 等无关文件。
- WebSocket 协议消息类型不变（`task` / `cancel` / `hitl_response` / `hitl_request` / `status` / `result` / `progress`）。
- 所有 UI 文案使用中文（沿用现有界面语言）。
- 唯一允许新增的前端依赖：`lucide-react`。

---
---

### Task 1: SessionStore（后端会话存储）

**Files:**
- Create: `src/server/session-store.ts`
- Test: `tests/server/session-store.test.ts`

**Interfaces:**
- Consumes: `RoundProgress`（`src/agent/loop.ts:26`）、`Message`（`src/agent/types.ts:2`）
- Produces（后续任务依赖）:
  - `class SessionStore` — `constructor(dbPath: string)`；`save(input: NewSession): number`（返回新 id）；`list(): SessionSummary[]`（按 `created_at DESC, id DESC`，**不含** data 字段）；`get(id: number): SessionRecord | undefined`（data 已 JSON.parse）；`delete(id: number): boolean`（不存在返回 false）；`close(): void`
  - `interface SessionData { progressEvents: RoundProgress[]; feedbackHistory: Array<{ round: number; status: string }>; messages: Message[] }`
  - `interface NewSession { task: string; status: string; rounds: number; data: SessionData }`
  - `interface SessionSummary { id: number; task: string; status: string; rounds: number; created_at: string }`
  - `interface SessionRecord extends SessionSummary { data: SessionData }`

- [ ] **Step 1: Write the failing test**

创建 `tests/server/session-store.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SessionStore, type SessionData } from '../../src/server/session-store';

const sampleData: SessionData = {
  progressEvents: [
    {
      round: 1,
      assistantContent: 'working',
      actions: [{ tool: 'write_file', result: 'File written: a.ts' }],
      feedbackStatus: 'fail',
    },
  ],
  feedbackHistory: [{ round: 1, status: 'fail' }],
  messages: [{ role: 'user', content: 'task' }],
};

describe('SessionStore', () => {
  let store: SessionStore;

  beforeEach(() => {
    store = new SessionStore(':memory:');
  });

  afterEach(() => {
    store.close();
  });

  it('saves and retrieves a session with data intact', () => {
    const id = store.save({ task: 'write code', status: 'completed', rounds: 2, data: sampleData });
    expect(id).toBeGreaterThan(0);
    const record = store.get(id);
    expect(record).toBeDefined();
    expect(record!.task).toBe('write code');
    expect(record!.status).toBe('completed');
    expect(record!.rounds).toBe(2);
    expect(record!.data).toEqual(sampleData);
    expect(record!.created_at).toBeTruthy();
  });

  it('returns undefined for missing id', () => {
    expect(store.get(999)).toBeUndefined();
  });

  it('lists sessions newest first without data payload', () => {
    store.save({ task: 'older', status: 'completed', rounds: 1, data: sampleData });
    store.save({ task: 'newer', status: 'error', rounds: 3, data: sampleData });
    const list = store.list();
    expect(list).toHaveLength(2);
    expect(list[0].task).toBe('newer');
    expect(list[0]).not.toHaveProperty('data');
  });

  it('deletes a session and reports whether it existed', () => {
    const id = store.save({ task: 'gone', status: 'completed', rounds: 1, data: sampleData });
    expect(store.delete(id)).toBe(true);
    expect(store.get(id)).toBeUndefined();
    expect(store.delete(id)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npm test -- tests/server/session-store.test.ts`
Expected: FAIL（`Cannot find module '../../src/server/session-store'`）

- [ ] **Step 3: Write minimal implementation**

创建 `src/server/session-store.ts`：

```ts
import Database from 'better-sqlite3';
import type { RoundProgress } from '../agent/loop';
import type { Message } from '../agent/types';

export interface SessionData {
  progressEvents: RoundProgress[];
  feedbackHistory: Array<{ round: number; status: string }>;
  messages: Message[];
}

export interface NewSession {
  task: string;
  status: string;
  rounds: number;
  data: SessionData;
}

export interface SessionSummary {
  id: number;
  task: string;
  status: string;
  rounds: number;
  created_at: string;
}

export interface SessionRecord extends SessionSummary {
  data: SessionData;
}

interface SessionRow extends SessionSummary {
  data: string;
}

export class SessionStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS sessions (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        rounds INTEGER NOT NULL,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        data TEXT NOT NULL
      )
    `);
  }

  save(input: NewSession): number {
    const info = this.db
      .prepare('INSERT INTO sessions (task, status, rounds, data) VALUES (?, ?, ?, ?)')
      .run(input.task, input.status, input.rounds, JSON.stringify(input.data));
    return Number(info.lastInsertRowid);
  }

  list(): SessionSummary[] {
    return this.db
      .prepare('SELECT id, task, status, rounds, created_at FROM sessions ORDER BY created_at DESC, id DESC')
      .all() as SessionSummary[];
  }

  get(id: number): SessionRecord | undefined {
    const row = this.db.prepare('SELECT * FROM sessions WHERE id = ?').get(id) as SessionRow | undefined;
    if (!row) return undefined;
    return {
      id: row.id,
      task: row.task,
      status: row.status,
      rounds: row.rounds,
      created_at: row.created_at,
      data: JSON.parse(row.data) as SessionData,
    };
  }

  delete(id: number): boolean {
    return this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npm test -- tests/server/session-store.test.ts`
Expected: PASS（4 个测试）

- [ ] **Step 5: Commit**

```powershell
git add src/server/session-store.ts tests/server/session-store.test.ts
git commit -m "feat: add SessionStore for task session persistence"
```

---

### Task 2: REST API + WebSocket 接线 + cancel 修复

**Files:**
- Modify: `src/server/http-server.ts`（整体重写，见 Step 2）
- Modify: `src/index.ts:66,99,101-111`
- Modify: `.gitignore`
- Test: `tests/server/sessions-api.test.ts`

**Interfaces:**
- Consumes: `SessionStore` / `SessionData`（Task 1）
- Produces:
  - `HarnessServer` 新签名：`constructor(loop: AgentLoop, port: number = 3000, sessionStore?: SessionStore)`；新增 `readonly ready: Promise<void>`、`get port(): number`、`close(): void`
  - REST：`GET /api/sessions` → `SessionSummary[]`；`GET /api/sessions/:id` → `SessionRecord`（404 = `{ error: 'session not found' }`）；`DELETE /api/sessions/:id` → `{ ok: true }` / 404
  - 行为约定：**先落库再发送 result**（前端收到 result 时会话必然已可查询）

**注意（有意的 bug 修复）：** 现有 `handleMessage` 的 cancel 分支调用 `this.loop.cancel()`，但实际运行的是每个任务新建的 `loopWithHITL` 实例（`http-server.ts:114`），导致取消按钮从未真正生效。本任务用 `runningLoops: Map<WebSocket, AgentLoop>` 跟踪运行中的 loop 并修复。这是会话落库（cancelled 状态）和前端取消按钮正确性的前提。

- [ ] **Step 1: Write the failing test**

创建 `tests/server/sessions-api.test.ts`：

```ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import WebSocket from 'ws';
import { HarnessServer } from '../../src/server/http-server';
import { SessionStore, type SessionData } from '../../src/server/session-store';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import type { Tool } from '../../src/tools/base';
import type { LLMResponse } from '../../src/agent/types';

const emptyData: SessionData = { progressEvents: [], feedbackHistory: [], messages: [] };

function makeLoop(responses: LLMResponse[], tools: Tool[] = []): AgentLoop {
  return new AgentLoop({
    llm: new MockLLM(responses),
    dispatcher: new ToolDispatcher(tools),
    contextBuilder: new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: [],
      memories: [],
    }),
    stopCondition: new StopCondition({ maxRounds: 5 }),
    validator: new FeedbackValidator(),
    injector: new FeedbackInjector(),
  });
}

function waitForResult(ws: WebSocket): Promise<{ status: string }> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error('timeout waiting for result')), 8000);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'result') {
        clearTimeout(timer);
        resolve(msg.payload);
      }
    });
    ws.on('error', reject);
  });
}

describe('Sessions REST API', () => {
  let store: SessionStore;
  let server: HarnessServer;
  let base: string;

  beforeEach(async () => {
    store = new SessionStore(':memory:');
    server = new HarnessServer(
      makeLoop([{ content: 'done', tool_calls: [], finish_reason: 'stop' }]),
      0,
      store,
    );
    await server.ready;
    base = `http://127.0.0.1:${server.port}`;
  });

  afterEach(() => {
    server.close();
    store.close();
  });

  it('GET /api/sessions returns empty list initially', async () => {
    const res = await fetch(`${base}/api/sessions`);
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual([]);
  });

  it('lists saved sessions (newest first), returns detail, deletes', async () => {
    const id1 = store.save({ task: 'first task', status: 'completed', rounds: 1, data: emptyData });
    const id2 = store.save({ task: 'second task', status: 'error', rounds: 3, data: emptyData });

    const list = await (await fetch(`${base}/api/sessions`)).json();
    expect(list).toHaveLength(2);
    expect(list[0].id).toBe(id2);
    expect(list[0].task).toBe('second task');
    expect(list[0]).not.toHaveProperty('data');

    const detailRes = await fetch(`${base}/api/sessions/${id1}`);
    expect(detailRes.status).toBe(200);
    const detail = await detailRes.json();
    expect(detail.task).toBe('first task');
    expect(detail.data).toEqual(emptyData);

    const del = await fetch(`${base}/api/sessions/${id1}`, { method: 'DELETE' });
    expect(del.status).toBe(200);
    expect(await (await fetch(`${base}/api/sessions`)).json()).toHaveLength(1);
  });

  it('returns 404 for missing session', async () => {
    expect((await fetch(`${base}/api/sessions/999`)).status).toBe(404);
    expect((await fetch(`${base}/api/sessions/999`, { method: 'DELETE' })).status).toBe(404);
  });
});

describe('Session persistence on task run', () => {
  let store: SessionStore;
  let server: HarnessServer;

  afterEach(() => {
    server.close();
    store.close();
  });

  it('saves session with progress events when task completes', async () => {
    const testTool: Tool = {
      name: 'run_test',
      description: 'Run tests',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      execute: async () => ({ tool_call_id: '', content: 'Tests: 1 passed, 1 total' }),
    };
    store = new SessionStore(':memory:');
    server = new HarnessServer(
      makeLoop(
        [
          {
            content: null,
            tool_calls: [{ id: 'c1', name: 'run_test', arguments: { command: 'npm test' } }],
            finish_reason: 'tool_calls',
          },
          { content: 'all green', tool_calls: [], finish_reason: 'stop' },
        ],
        [testTool],
      ),
      0,
      store,
    );
    await server.ready;

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const resultPromise = waitForResult(ws);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'task', payload: { task: 'run the tests' } }));
    });
    const result = await resultPromise;
    ws.close();

    expect(result.status).toBe('completed');
    const sessions = store.list();
    expect(sessions).toHaveLength(1);
    expect(sessions[0].task).toBe('run the tests');
    const record = store.get(sessions[0].id)!;
    expect(record.status).toBe('completed');
    expect(record.data.progressEvents).toHaveLength(2);
    expect(record.data.feedbackHistory).toHaveLength(1);
    expect(record.data.feedbackHistory[0].status).toBe('pass');
  });

  it('cancel stops the running loop and saves a cancelled session', async () => {
    const slowTool: Tool = {
      name: 'slow_tool',
      description: 'A tool that takes 400ms',
      parameters: { type: 'object', properties: {}, required: [] },
      execute: () =>
        new Promise((resolve) =>
          setTimeout(() => resolve({ tool_call_id: '', content: 'slow done' }), 400),
        ),
    };
    store = new SessionStore(':memory:');
    server = new HarnessServer(
      makeLoop(
        [
          {
            content: null,
            tool_calls: [{ id: 'c1', name: 'slow_tool', arguments: {} }],
            finish_reason: 'tool_calls',
          },
          { content: 'should not reach', tool_calls: [], finish_reason: 'stop' },
        ],
        [slowTool],
      ),
      0,
      store,
    );
    await server.ready;

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const resultPromise = waitForResult(ws);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'task', payload: { task: 'slow task' } }));
      setTimeout(() => {
        ws.send(JSON.stringify({ type: 'cancel' }));
      }, 100);
    });
    const result = await resultPromise;
    ws.close();

    expect(result.status).toBe('cancelled');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].status).toBe('cancelled');
  });
});
```

- [ ] **Step 2: Rewrite `src/server/http-server.ts`**

整体替换为以下内容（新增：sessionStore 参数、REST 路由、`ready`/`port`/`close`、`runningLoops` 跟踪、落库逻辑；其余逻辑保持不变）：

```ts
import express from 'express';
import http from 'http';
import path from 'path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentLoop } from '../agent/loop';
import type { HITLRequest, HITLResponse, RoundProgress, RunResult } from '../agent/loop';
import type { SessionStore, SessionData } from './session-store';
import type { WSMessage } from './types';
import { logger } from '../utils/logger';

interface PendingHITL {
  request: HITLRequest;
  resolve: (response: HITLResponse) => void;
  ws: WebSocket;
}

export class HarnessServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private loop: AgentLoop;
  private sessionStore?: SessionStore;
  private token: string;
  private pendingHITL: Map<string, PendingHITL> = new Map();
  private runningLoops: Map<WebSocket, AgentLoop> = new Map();
  public readonly ready: Promise<void>;

  constructor(loop: AgentLoop, port: number = 3000, sessionStore?: SessionStore) {
    this.loop = loop;
    this.sessionStore = sessionStore;
    this.token = process.env.HARNESS_TOKEN || '';

    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({
      server: this.server,
      verifyClient: (info, cb) => {
        const clientToken = new URL(info.req.url ?? '', `http://${info.req.headers.host}`).searchParams.get('token');
        if (!this.token || clientToken === this.token) {
          cb(true);
        } else {
          logger.warn('WebSocket connection rejected: invalid token');
          cb(false, 401, 'Unauthorized');
        }
      },
    });

    this.app.use(express.json());

    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    if (this.sessionStore) {
      const store = this.sessionStore;
      this.app.get('/api/sessions', (_req, res) => {
        res.json(store.list());
      });
      this.app.get('/api/sessions/:id', (req, res) => {
        const id = Number(req.params.id);
        const record = Number.isInteger(id) ? store.get(id) : undefined;
        if (!record) {
          res.status(404).json({ error: 'session not found' });
          return;
        }
        res.json(record);
      });
      this.app.delete('/api/sessions/:id', (req, res) => {
        const id = Number(req.params.id);
        const ok = Number.isInteger(id) ? store.delete(id) : false;
        if (!ok) {
          res.status(404).json({ error: 'session not found' });
          return;
        }
        res.json({ ok: true });
      });
    }

    this.app.use(express.static(path.join(__dirname, '../../webui/dist')));
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../../webui/dist/index.html'));
    });

    this.wss.on('connection', (ws: WebSocket) => {
      logger.info('WebSocket client connected');
      ws.on('message', async (data: Buffer) => {
        try {
          const msg: WSMessage = JSON.parse(data.toString());
          await this.handleMessage(ws, msg);
        } catch (err) {
          logger.error('Failed to handle WebSocket message', { error: String(err) });
        }
      });
      ws.on('close', () => {
        this.runningLoops.get(ws)?.cancel();
        this.runningLoops.delete(ws);
        this.rejectHITLForClient(ws);
        logger.info('WebSocket client disconnected');
      });
    });

    this.ready = new Promise((resolve) => {
      this.server.listen(port, '0.0.0.0', () => {
        logger.info(`Harness server running on 0.0.0.0:${this.port}`);
        resolve();
      });
    });
  }

  get port(): number {
    const addr = this.server.address() as AddressInfo | null;
    return addr?.port ?? 0;
  }

  close(): void {
    this.wss.close();
    this.server.close();
  }

  private rejectHITLForClient(ws: WebSocket): void {
    for (const [id, pending] of this.pendingHITL) {
      if (pending.ws === ws) {
        pending.resolve({ toolCallId: id, approved: false });
        this.pendingHITL.delete(id);
      }
    }
  }

  private createHITLCallback(ws: WebSocket): (request: HITLRequest) => Promise<HITLResponse> {
    return (request: HITLRequest) => {
      return new Promise<HITLResponse>((resolve) => {
        this.pendingHITL.set(request.toolCallId, { request, resolve, ws });
        ws.send(JSON.stringify({
          type: 'hitl_request',
          payload: {
            toolCallId: request.toolCallId,
            toolName: request.toolName,
            arguments: request.arguments,
            reason: request.reason,
            severity: request.severity,
          },
        }));
        logger.info('HITL request sent to client', {
          toolCallId: request.toolCallId,
          toolName: request.toolName,
          severity: request.severity,
        });
      });
    };
  }

  private saveSession(task: string, result: RunResult, progressEvents: RoundProgress[]): void {
    if (!this.sessionStore) return;
    try {
      const data: SessionData = {
        progressEvents,
        feedbackHistory: result.feedbackHistory,
        messages: result.messages,
      };
      const id = this.sessionStore.save({ task, status: result.status, rounds: result.rounds, data });
      logger.info('Session saved', { id, status: result.status, rounds: result.rounds });
    } catch (err) {
      logger.error('Failed to save session', { error: String(err) });
    }
  }

  private async handleMessage(ws: WebSocket, msg: WSMessage): Promise<void> {
    if (msg.type === 'task') {
      const { task } = msg.payload as { task: string };
      logger.info('Agent task received', { task: task.substring(0, 100) });
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));

      const hitlCallback = this.createHITLCallback(ws);
      const progressEvents: RoundProgress[] = [];
      const loopWithHITL = new AgentLoop({
        ...this.loop.config,
        hitlCallback,
        onProgress: (event) => {
          progressEvents.push(event);
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'progress', payload: event }));
          }
        },
      });
      this.runningLoops.set(ws, loopWithHITL);

      try {
        const result = await loopWithHITL.run(task);
        logger.info('Agent task completed', { status: result.status, rounds: result.rounds });
        this.saveSession(task, result, progressEvents);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'result',
            payload: {
              status: result.status,
              rounds: result.rounds,
              messages: result.messages,
              feedbackHistory: result.feedbackHistory,
            },
          }));
        }
      } catch (err) {
        logger.error('Agent task failed', { error: String(err) });
        this.saveSession(
          task,
          { status: 'error', rounds: progressEvents.length, messages: [], feedbackHistory: [] },
          progressEvents,
        );
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'status',
            payload: { status: 'error', error: String(err) },
          }));
        }
      } finally {
        this.runningLoops.delete(ws);
      }
    } else if (msg.type === 'cancel') {
      logger.info('Agent task cancelled');
      this.runningLoops.get(ws)?.cancel();
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'cancelled' } }));
    } else if (msg.type === 'hitl_response') {
      const { toolCallId, approved, modifiedArgs } = (msg.payload as { toolCallId: string; approved: boolean; modifiedArgs?: Record<string, unknown> });
      const pending = this.pendingHITL.get(toolCallId);
      if (pending) {
        logger.info('HITL response received', { toolCallId, approved });
        pending.resolve({ toolCallId, approved, modifiedArgs });
        this.pendingHITL.delete(toolCallId);
      } else {
        logger.warn('HITL response for unknown tool call', { toolCallId });
      }
    }
  }
}
```

- [ ] **Step 3: Modify `src/index.ts`**

在 `src/index.ts:11` 后添加 import：

```ts
import { SessionStore } from './server/session-store';
```

在 `src/index.ts:68`（`logger.info('Memory store initialized', ...)` 之后）添加：

```ts
const sessionStore = new SessionStore('data/sessions.db');
logger.info('Session store initialized', { path: 'data/sessions.db' });
```

将 `src/index.ts:99` 的 `new HarnessServer(loop, port);` 改为：

```ts
new HarnessServer(loop, port, sessionStore);
```

两个 shutdown 处理器（`src/index.ts:101-111`）中 `memoryStore.close();` 之后各添加一行 `sessionStore.close();`。

- [ ] **Step 4: Update `.gitignore`**

在 `.gitignore` 的 `*.sqlite` 行后追加两行（WAL 模式的 SQLite 副产物）：

```
*.db-shm
*.db-wal
```

- [ ] **Step 5: Run tests to verify**

Run: `npm test -- tests/server/`
Expected: PASS（session-store 4 个 + sessions-api 5 个）

Run: `npm test`
Expected: 全部 PASS（原 84 个 + 新增 9 个 = 93 个）

- [ ] **Step 6: Commit**

```powershell
git add src/server/http-server.ts src/index.ts .gitignore tests/server/sessions-api.test.ts
git commit -m "feat: persist task sessions and expose /api/sessions REST API"
```

---

### Task 3: 前端基础设施（依赖、类型、API 封装、hooks）

**Files:**
- Modify: `webui/package.json`（通过 npm install）
- Modify: `webui/vite.config.ts`
- Modify: `webui/src/types.ts`（整体重写）
- Create: `webui/src/api/sessions.ts`
- Create: `webui/src/hooks/useSessions.ts`
- Modify: `webui/src/hooks/useWebSocket.ts`（整体重写）

**Interfaces:**
- Produces:
  - `listSessions(): Promise<SessionSummary[]>`、`getSession(id: number): Promise<SessionRecord>`、`deleteSession(id: number): Promise<{ ok: true }>`（`api/sessions.ts`）
  - `useSessions(): { sessions: SessionSummary[]; loading: boolean; error: string | null; refresh: () => Promise<void>; remove: (id: number) => Promise<void> }`
  - `useWebSocket(url)` 返回值新增 `reconnecting: boolean`，其余不变；**行为变化**：`sendTask` 现在将 chat 重置为仅含新用户消息（每个任务一个"任务视图"），并新增断线指数退避自动重连
  - `types.ts` 新增 `SessionSummary` / `SessionData` / `SessionRecord`

- [ ] **Step 1: 安装 lucide-react**

```powershell
cd webui; npm install lucide-react; cd ..
```

- [ ] **Step 2: 配置 vite 代理**

将 `webui/vite.config.ts` 整体替换为：

```ts
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3000',
    },
  },
});
```

- [ ] **Step 3: 重写 `webui/src/types.ts`**

```ts
export interface WSMessage {
  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress';
  payload: unknown;
}

export interface RoundProgress {
  round: number;
  assistantContent: string;
  actions: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
}

export interface ChatItem {
  id: string;
  kind: 'user' | 'agent';
  /** user text, or agent round card */
  text?: string;
  round?: number;
  actions?: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
}

export interface AgentResult {
  status: string;
  rounds: number;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
  feedbackHistory: Array<{ round: number; status: string }>;
}

export interface HITLRequestPayload {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  severity: 'high' | 'critical';
}

export interface SessionSummary {
  id: number;
  task: string;
  status: string;
  rounds: number;
  created_at: string;
}

export interface SessionData {
  progressEvents: RoundProgress[];
  feedbackHistory: Array<{ round: number; status: string }>;
  messages: Array<{ role: string; content: string }>;
}

export interface SessionRecord extends SessionSummary {
  data: SessionData;
}
```

- [ ] **Step 4: 创建 `webui/src/api/sessions.ts`**

```ts
import type { SessionRecord, SessionSummary } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions');
}

export function getSession(id: number): Promise<SessionRecord> {
  return request<SessionRecord>(`/api/sessions/${id}`);
}

export function deleteSession(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/sessions/${id}`, { method: 'DELETE' });
}
```

- [ ] **Step 5: 创建 `webui/src/hooks/useSessions.ts`**

```ts
import { useCallback, useEffect, useState } from 'react';
import { listSessions, deleteSession } from '../api/sessions';
import type { SessionSummary } from '../types';

export function useSessions() {
  const [sessions, setSessions] = useState<SessionSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    try {
      setSessions(await listSessions());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const remove = useCallback(
    async (id: number) => {
      await deleteSession(id);
      await refresh();
    },
    [refresh],
  );

  return { sessions, loading, error, refresh, remove };
}
```

- [ ] **Step 6: 重写 `webui/src/hooks/useWebSocket.ts`（自动重连 + 任务视图重置）**

```ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage, AgentResult, HITLRequestPayload, RoundProgress, ChatItem } from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [reconnecting, setReconnecting] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [status, setStatus] = useState<string>('idle');
  const [hitlRequest, setHitlRequest] = useState<HITLRequestPayload | null>(null);
  const [chat, setChat] = useState<ChatItem[]>([]);
  const idRef = useRef(0);
  const retryRef = useRef(0);
  const timerRef = useRef<number | null>(null);

  useEffect(() => {
    let unmounted = false;
    const token = new URLSearchParams(window.location.search).get('token') || '';
    const wsUrl = token ? `${url}?token=${encodeURIComponent(token)}` : url;

    const connect = () => {
      if (unmounted) return;
      const ws = new WebSocket(wsUrl);
      wsRef.current = ws;

      ws.onopen = () => {
        retryRef.current = 0;
        setConnected(true);
        setReconnecting(false);
      };
      ws.onclose = () => {
        setConnected(false);
        if (unmounted) return;
        setReconnecting(true);
        const delay = Math.min(1000 * 2 ** retryRef.current, 10000);
        retryRef.current += 1;
        timerRef.current = window.setTimeout(connect, delay);
      };
      ws.onmessage = (event) => {
        const msg: WSMessage = JSON.parse(event.data);
        if (msg.type === 'status') {
          setStatus((msg.payload as { status: string }).status);
        } else if (msg.type === 'progress') {
          const p = msg.payload as RoundProgress;
          setChat((prev) => [
            ...prev,
            {
              id: `agent-${++idRef.current}`,
              kind: 'agent',
              round: p.round,
              text: p.assistantContent,
              actions: p.actions,
              feedbackStatus: p.feedbackStatus,
            },
          ]);
        } else if (msg.type === 'result') {
          const payload = msg.payload as AgentResult;
          setResult(payload);
          setStatus(payload.status || 'idle');
          setHitlRequest(null);
        } else if (msg.type === 'hitl_request') {
          setHitlRequest(msg.payload as HITLRequestPayload);
        }
      };
    };

    connect();

    return () => {
      unmounted = true;
      if (timerRef.current !== null) window.clearTimeout(timerRef.current);
      wsRef.current?.close();
      wsRef.current = null;
    };
  }, [url]);

  const sendTask = useCallback((task: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task } }));
    setStatus('running');
    setResult(null);
    setHitlRequest(null);
    setChat([{ id: `user-${++idRef.current}`, kind: 'user', text: task }]);
  }, []);

  const cancel = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
  }, []);

  const respondHITL = useCallback(
    (approved: boolean, modifiedArgs?: Record<string, unknown>) => {
      if (!hitlRequest) return;
      wsRef.current?.send(
        JSON.stringify({
          type: 'hitl_response',
          payload: { toolCallId: hitlRequest.toolCallId, approved, modifiedArgs },
        }),
      );
      setHitlRequest(null);
    },
    [hitlRequest],
  );

  return { connected, reconnecting, status, result, hitlRequest, chat, sendTask, cancel, respondHITL };
}
```

- [ ] **Step 7: 验证构建**

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功（`tsc -b` 通过；新文件暂未被 App 引用，`noUnusedLocals: false` 不会报错；现有 `ChatPanel` 仍可使用新版 `useWebSocket`，返回值是原接口的超集）

- [ ] **Step 8: Commit**

```powershell
git add webui/package.json webui/package-lock.json webui/vite.config.ts webui/src/types.ts webui/src/api/sessions.ts webui/src/hooks/useSessions.ts webui/src/hooks/useWebSocket.ts
git commit -m "feat(webui): add sessions API client, session hooks and WS auto-reconnect"
```

---

### Task 4: HUD 设计系统 + 应用壳样式（styles.css 重写）

**Files:**
- Modify: `webui/src/styles.css`（整体重写）

**Interfaces:**
- Produces（后续任务的组件依赖这些类名）：
  - 布局：`.app-shell`、`.app-body`（含 `.no-sidebar` / `.no-deck` 变体）、`.main-col`
  - 通用：`.panel`（含角落刻度伪元素）、`.panel-label`、`.led`（`.on`/`.warn`/`.off`）、`.btn`（`.btn-primary`/`.btn-danger`/`.btn-sm`，含 `kbd`）、`.icon-btn`（`.on`）、`.fb-tag`（`.fail`/`.pass`/`.sm`）、`.badge`（`.ok`/`.bad`/`.dim`）
  - 顶栏：`.topbar`、`.brand`、`.topbar-metrics`、`.metric`、`.status-row`、`.status-item`
  - 动画：`led-pulse`、`fade-in`、`card-in`
- 说明：本任务后旧 `ChatPanel` 的 `.bubble`/`.hint-box`/`.log` 等类将失去样式（组件在 Task 9 删除），应用仍可用、构建仍为绿——这是重写期间的正常过渡状态。

- [ ] **Step 1: 整体重写 `webui/src/styles.css`**

```css
@import url('https://fonts.googleapis.com/css2?family=IBM+Plex+Mono:wght@400;500;600&display=swap');

:root {
  --bg: #070b12;
  --bg-panel: rgba(13, 20, 32, 0.72);
  --bg-elevated: #0d1420;
  --bg-inset: #05080e;
  --border: rgba(120, 160, 200, 0.14);
  --border-strong: rgba(120, 160, 200, 0.3);
  --text: #dbe4ee;
  --text-dim: #7d8fa3;
  --accent: #3dd68c;
  --info: #22d3ee;
  --warn: #e6a23c;
  --danger: #f07178;
  --ease-out: cubic-bezier(0.23, 1, 0.32, 1);
  --font: 'IBM Plex Mono', 'JetBrains Mono', ui-monospace, monospace;
  --radius: 6px;
}

*,
*::before,
*::after {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  height: 100%;
}

body {
  background:
    radial-gradient(ellipse 60% 40% at 75% -10%, rgba(34, 211, 238, 0.06), transparent),
    radial-gradient(ellipse 50% 45% at 15% 110%, rgba(61, 214, 140, 0.05), transparent),
    var(--bg);
  color: var(--text);
  font-family: var(--font);
  font-size: 13px;
  line-height: 1.55;
  overflow: hidden;
}

button,
input,
textarea {
  font-family: inherit;
}

/* ---------- app shell ---------- */

.app-shell {
  display: flex;
  flex-direction: column;
  height: 100vh;
  padding: 12px;
  gap: 12px;
  background-image:
    linear-gradient(rgba(120, 160, 200, 0.035) 1px, transparent 1px),
    linear-gradient(90deg, rgba(120, 160, 200, 0.035) 1px, transparent 1px);
  background-size: 36px 36px;
}

.app-body {
  flex: 1;
  display: grid;
  grid-template-columns: 240px minmax(0, 1fr) 320px;
  gap: 12px;
  min-height: 0;
}

.app-body.no-sidebar {
  grid-template-columns: minmax(0, 1fr) 320px;
}

.app-body.no-deck {
  grid-template-columns: 240px minmax(0, 1fr);
}

.app-body.no-sidebar.no-deck {
  grid-template-columns: minmax(0, 1fr);
}

.main-col {
  display: flex;
  flex-direction: column;
  min-height: 0;
  gap: 12px;
}

/* ---------- panel ---------- */

.panel {
  position: relative;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  backdrop-filter: blur(8px);
}

.panel::before,
.panel::after {
  content: '';
  position: absolute;
  width: 10px;
  height: 10px;
  pointer-events: none;
}

.panel::before {
  top: -1px;
  left: -1px;
  border-top: 1px solid var(--border-strong);
  border-left: 1px solid var(--border-strong);
  border-top-left-radius: var(--radius);
}

.panel::after {
  bottom: -1px;
  right: -1px;
  border-bottom: 1px solid var(--border-strong);
  border-right: 1px solid var(--border-strong);
  border-bottom-right-radius: var(--radius);
}

.panel-label {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-size: 10px;
  font-weight: 600;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--text-dim);
}

/* ---------- LED ---------- */

.led {
  width: 8px;
  height: 8px;
  border-radius: 2px;
  background: var(--text-dim);
  flex-shrink: 0;
}

.led.on {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(61, 214, 140, 0.8);
  animation: led-pulse 1.6s linear infinite;
}

.led.warn {
  background: var(--warn);
  box-shadow: 0 0 8px rgba(230, 162, 60, 0.8);
  animation: led-pulse 1s linear infinite;
}

.led.off {
  background: var(--danger);
  box-shadow: 0 0 8px rgba(240, 113, 120, 0.6);
}

/* ---------- topbar ---------- */

.topbar {
  display: flex;
  align-items: center;
  gap: 16px;
  padding: 8px 14px;
}

.brand {
  font-size: 13px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--text);
  white-space: nowrap;
}

.brand span {
  color: var(--accent);
  text-shadow: 0 0 12px rgba(61, 214, 140, 0.5);
}

.topbar-metrics {
  display: flex;
  gap: 16px;
}

.metric {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.06em;
}

.metric strong {
  color: var(--info);
  font-size: 14px;
  font-weight: 600;
}

.status-row {
  display: flex;
  align-items: center;
  gap: 14px;
  margin-left: auto;
  color: var(--text-dim);
  font-size: 12px;
}

.status-item {
  display: inline-flex;
  align-items: center;
  gap: 8px;
}

/* ---------- buttons ---------- */

.btn {
  border-radius: var(--radius);
  border: 1px solid var(--border);
  background: var(--bg-elevated);
  color: var(--text);
  padding: 0 16px;
  min-height: 36px;
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.05em;
  cursor: pointer;
  transition:
    transform 120ms var(--ease-out),
    border-color 120ms var(--ease-out),
    background 120ms var(--ease-out);
}

.btn:hover:not(:disabled) {
  border-color: var(--border-strong);
}

.btn:active:not(:disabled) {
  transform: scale(0.97);
}

.btn:disabled {
  opacity: 0.4;
  cursor: not-allowed;
}

.btn-primary {
  background: rgba(61, 214, 140, 0.1);
  border-color: rgba(61, 214, 140, 0.5);
  color: var(--accent);
}

.btn-danger {
  background: rgba(240, 113, 120, 0.1);
  border-color: rgba(240, 113, 120, 0.5);
  color: var(--danger);
}

.btn-sm {
  min-height: 26px;
  padding: 0 10px;
  font-size: 11px;
}

.btn kbd {
  font-family: inherit;
  font-size: 10px;
  opacity: 0.6;
  margin-left: 6px;
}

.icon-btn {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  width: 28px;
  height: 28px;
  background: transparent;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  cursor: pointer;
  transition:
    color 120ms var(--ease-out),
    border-color 120ms var(--ease-out);
}

.icon-btn:hover {
  color: var(--text);
  border-color: var(--border-strong);
}

.icon-btn.on {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.45);
}

/* ---------- tags & badges ---------- */

.fb-tag {
  font-size: 10px;
  padding: 1px 8px;
  border: 1px solid var(--border);
  border-radius: 999px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
}

.fb-tag.fail {
  color: var(--danger);
  border-color: rgba(240, 113, 120, 0.5);
}

.fb-tag.pass {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.5);
}

.fb-tag.sm {
  padding: 0 6px;
  font-size: 9px;
}

.badge {
  padding: 0 6px;
  border-radius: 3px;
  border: 1px solid var(--border);
  font-size: 9px;
  letter-spacing: 0.08em;
}

.badge.ok {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.45);
}

.badge.bad {
  color: var(--danger);
  border-color: rgba(240, 113, 120, 0.45);
}

.badge.dim {
  color: var(--text-dim);
}

/* ---------- scrollbars ---------- */

::-webkit-scrollbar {
  width: 8px;
  height: 8px;
}

::-webkit-scrollbar-track {
  background: transparent;
}

::-webkit-scrollbar-thumb {
  background: rgba(120, 160, 200, 0.2);
  border-radius: 4px;
}

::-webkit-scrollbar-thumb:hover {
  background: rgba(120, 160, 200, 0.35);
}

/* ---------- keyframes ---------- */

@keyframes led-pulse {
  0%,
  100% {
    opacity: 1;
  }
  50% {
    opacity: 0.4;
  }
}

@keyframes fade-in {
  from {
    opacity: 0;
  }
  to {
    opacity: 1;
  }
}

@keyframes card-in {
  from {
    opacity: 0;
    transform: translateY(8px);
  }
  to {
    opacity: 1;
    transform: translateY(0);
  }
}
```

- [ ] **Step 2: 验证构建**

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功（CSS 不参与类型检查；旧组件仍渲染，只是部分类暂无样式——预期中的过渡状态）

- [ ] **Step 3: Commit**

```powershell
git add webui/src/styles.css
git commit -m "feat(webui): rewrite design system as dark HUD tokens and shell"
```

---

### Task 5: SessionSidebar（会话历史栏组件）

**Files:**
- Create: `webui/src/components/SessionSidebar.tsx`
- Modify: `webui/src/styles.css`（追加 sidebar 区块）

**Interfaces:**
- Consumes: `SessionSummary`（types.ts，Task 3）、`.panel`/`.panel-label`/`.btn`/`.badge`（styles.css，Task 4）
- Produces: `SessionSidebar` 组件，props：`{ sessions: SessionSummary[]; loading: boolean; error: string | null; activeId: number | null; onRetry: () => void; onSelect: (id: number) => void; onNew: () => void; onDelete: (id: number) => void }`

- [ ] **Step 1: 创建 `webui/src/components/SessionSidebar.tsx`**

```tsx
import { History, Trash2 } from 'lucide-react';
import type { SessionSummary } from '../types';

interface SessionSidebarProps {
  sessions: SessionSummary[];
  loading: boolean;
  error: string | null;
  activeId: number | null;
  onRetry: () => void;
  onSelect: (id: number) => void;
  onNew: () => void;
  onDelete: (id: number) => void;
}

const STATUS_LABEL: Record<string, string> = {
  completed: '完成',
  error: '错误',
  cancelled: '取消',
  max_rounds: '超限',
};

function statusClass(status: string): string {
  if (status === 'completed') return 'ok';
  if (status === 'cancelled') return 'dim';
  return 'bad';
}

function relativeTime(iso: string): string {
  // SQLite CURRENT_TIMESTAMP 为 UTC 的 'YYYY-MM-DD HH:MM:SS'
  const then = new Date(iso.replace(' ', 'T') + 'Z').getTime();
  const diff = Date.now() - then;
  const minutes = Math.floor(diff / 60000);
  if (minutes < 1) return '刚刚';
  if (minutes < 60) return `${minutes} 分钟前`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} 小时前`;
  return `${Math.floor(hours / 24)} 天前`;
}

export function SessionSidebar({
  sessions,
  loading,
  error,
  activeId,
  onRetry,
  onSelect,
  onNew,
  onDelete,
}: SessionSidebarProps) {
  return (
    <aside className="sidebar panel">
      <div className="sidebar-head">
        <span className="panel-label">
          <History size={12} aria-hidden />
          会话历史
        </span>
        <button type="button" className="btn btn-primary btn-sm" onClick={onNew}>
          ＋ 新任务
        </button>
      </div>

      {loading && <div className="sidebar-note">加载中…</div>}

      {error && (
        <div className="sidebar-note error">
          <span>加载失败：{error}</span>
          <button type="button" className="btn btn-sm" onClick={onRetry}>
            重试
          </button>
        </div>
      )}

      {!loading && !error && sessions.length === 0 && (
        <div className="sidebar-note">暂无历史会话。完成的任务会自动保存在这里。</div>
      )}

      <ul className="session-list">
        {sessions.map((s) => (
          <li key={s.id}>
            <button
              type="button"
              className={`session-item ${activeId === s.id ? 'active' : ''}`}
              onClick={() => onSelect(s.id)}
            >
              <span className="session-task">{s.task}</span>
              <span className="session-meta">
                <span className={`badge ${statusClass(s.status)}`}>
                  {STATUS_LABEL[s.status] ?? s.status}
                </span>
                <span>{s.rounds} 轮</span>
                <span>{relativeTime(s.created_at)}</span>
              </span>
            </button>
            <button
              type="button"
              className="session-delete"
              aria-label="删除会话"
              onClick={() => onDelete(s.id)}
            >
              <Trash2 size={12} aria-hidden />
            </button>
          </li>
        ))}
      </ul>
    </aside>
  );
}
```

- [ ] **Step 2: 追加 sidebar 样式到 `webui/src/styles.css` 末尾**

```css
/* ---------- session sidebar ---------- */

.sidebar {
  display: flex;
  flex-direction: column;
  min-height: 0;
  padding: 12px;
}

.sidebar-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.sidebar-note {
  color: var(--text-dim);
  font-size: 12px;
  padding: 8px 2px;
}

.sidebar-note.error {
  color: var(--danger);
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
}

.session-list {
  list-style: none;
  margin: 0;
  padding: 0;
  overflow-y: auto;
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.session-list li {
  position: relative;
}

.session-item {
  width: 100%;
  text-align: left;
  background: transparent;
  border: 1px solid transparent;
  border-radius: var(--radius);
  padding: 8px 10px;
  cursor: pointer;
  color: var(--text);
  display: flex;
  flex-direction: column;
  gap: 6px;
  transition:
    background 120ms var(--ease-out),
    border-color 120ms var(--ease-out);
}

.session-item:hover {
  background: rgba(120, 160, 200, 0.06);
}

.session-item.active {
  background: rgba(34, 211, 238, 0.07);
  border-color: rgba(34, 211, 238, 0.35);
}

.session-task {
  font-size: 12px;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.session-meta {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--text-dim);
}

.session-delete {
  position: absolute;
  top: 6px;
  right: 6px;
  display: none;
  align-items: center;
  justify-content: center;
  width: 22px;
  height: 22px;
  background: var(--bg-elevated);
  border: 1px solid var(--border);
  border-radius: 4px;
  color: var(--text-dim);
  cursor: pointer;
}

.session-list li:hover .session-delete {
  display: inline-flex;
}

.session-delete:hover {
  color: var(--danger);
  border-color: rgba(240, 113, 120, 0.5);
}
```

- [ ] **Step 3: 验证构建**

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功

- [ ] **Step 4: Commit**

```powershell
git add webui/src/components/SessionSidebar.tsx webui/src/styles.css
git commit -m "feat(webui): add session history sidebar component"
```

---

### Task 6: 对话时间线（ChatTimeline + RoundCard + FeedbackTrail）

**Files:**
- Create: `webui/src/components/RoundCard.tsx`
- Create: `webui/src/components/FeedbackTrail.tsx`
- Create: `webui/src/components/ChatTimeline.tsx`
- Modify: `webui/src/styles.css`（追加 timeline 区块）

**Interfaces:**
- Consumes: `ChatItem`（types.ts）、`.panel`/`.fb-tag`（styles.css）
- Produces:
  - `RoundCard`：props `{ item: ChatItem }`；卡片根元素 id 格式为 `round-<轮次号>`（供轮次时间线点击定位）
  - `FeedbackTrail`：props `{ history: Array<{ round: number; status: string }>; compact?: boolean }`
  - `ChatTimeline`：props `{ items: ChatItem[]; end: EndSummary | null; connected: boolean; review: boolean }`；导出 `interface EndSummary { status: string; rounds: number; feedbackHistory: Array<{ round: number; status: string }> }`

- [ ] **Step 1: 创建 `webui/src/components/RoundCard.tsx`**

```tsx
import { useState } from 'react';
import {
  FileText,
  FilePenLine,
  Trash2,
  Terminal,
  Search,
  GitBranch,
  FlaskConical,
  Wrench,
  ChevronDown,
  ChevronRight,
} from 'lucide-react';
import type { ChatItem } from '../types';

const TOOL_ICON: Record<string, typeof Wrench> = {
  read_file: FileText,
  write_file: FilePenLine,
  delete_file: Trash2,
  shell: Terminal,
  search: Search,
  git_diff: GitBranch,
  run_test: FlaskConical,
};

function ToolBlock({ tool, result }: { tool: string; result: string }) {
  const [open, setOpen] = useState(false);
  const Icon = TOOL_ICON[tool] ?? Wrench;
  const blocked = result.startsWith('BLOCKED');

  return (
    <div className={`tool-block ${blocked ? 'blocked' : ''}`}>
      <button type="button" className="tool-head" onClick={() => setOpen((v) => !v)}>
        {open ? <ChevronDown size={12} aria-hidden /> : <ChevronRight size={12} aria-hidden />}
        <Icon size={12} aria-hidden />
        <span className="tool-name">{tool}</span>
        <span className="tool-preview">{result.split('\n')[0].slice(0, 60)}</span>
      </button>
      {open && (
        <pre className="tool-result">
          {result.slice(0, 2000)}
          {result.length > 2000 ? '\n…（截断）' : ''}
        </pre>
      )}
    </div>
  );
}

export function RoundCard({ item }: { item: ChatItem }) {
  const hasText = Boolean(item.text?.trim());
  const hasActions = Boolean(item.actions && item.actions.length > 0);

  return (
    <article className="round-card panel" id={`round-${item.round}`}>
      <header className="round-head">
        <span className="round-no">ROUND {String(item.round).padStart(2, '0')}</span>
        {item.feedbackStatus && (
          <span className={`fb-tag ${item.feedbackStatus}`}>
            {item.feedbackStatus === 'fail' ? '✕ 测试未通过' : '✓ 测试通过'}
          </span>
        )}
      </header>
      {hasText && <p className="round-text">{item.text}</p>}
      {hasActions && (
        <div className="tool-list">
          {item.actions!.map((a, i) => (
            <ToolBlock key={i} tool={a.tool} result={a.result} />
          ))}
        </div>
      )}
      {!hasText && !hasActions && <p className="round-text dim">（本轮无文字输出）</p>}
    </article>
  );
}
```

- [ ] **Step 2: 创建 `webui/src/components/FeedbackTrail.tsx`**

```tsx
interface FeedbackTrailProps {
  history: Array<{ round: number; status: string }>;
  compact?: boolean;
}

export function FeedbackTrail({ history, compact }: FeedbackTrailProps) {
  if (history.length === 0) {
    return (
      <div className="trail-empty">
        {compact ? '无反馈记录（未运行测试或一次通过）' : '待机 — 暂无反馈'}
      </div>
    );
  }

  return (
    <div className="trail">
      {history.map((fb, i) => (
        <span key={i} className="trail-step">
          {i > 0 && <span className="trail-arrow">→</span>}
          <span className={`trail-node ${fb.status === 'fail' ? 'fail' : 'pass'}`}>
            R{fb.round} {fb.status === 'fail' ? 'FAIL' : 'PASS'}
          </span>
        </span>
      ))}
    </div>
  );
}
```

- [ ] **Step 3: 创建 `webui/src/components/ChatTimeline.tsx`**

```tsx
import { useEffect, useRef } from 'react';
import type { ChatItem } from '../types';
import { RoundCard } from './RoundCard';
import { FeedbackTrail } from './FeedbackTrail';

export interface EndSummary {
  status: string;
  rounds: number;
  feedbackHistory: Array<{ round: number; status: string }>;
}

interface ChatTimelineProps {
  items: ChatItem[];
  end: EndSummary | null;
  connected: boolean;
  review: boolean;
}

const STATUS_LABEL: Record<string, string> = {
  completed: '任务完成',
  error: '任务出错',
  cancelled: '任务已取消',
  max_rounds: '达到轮次上限',
};

export function ChatTimeline({ items, end, connected, review }: ChatTimelineProps) {
  const scrollerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = scrollerRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [items, end]);

  return (
    <div className="timeline" ref={scrollerRef}>
      {items.length === 0 && (
        <div className="hint panel">
          <div className="panel-label">系统就绪 // SYSTEM READY</div>
          <ul className="hint-list">
            <li>
              <span className="hint-key">01</span>在下方输入编码任务，Agent 将逐轮执行
            </li>
            <li>
              <span className="hint-key">02</span>右侧面板实时显示循环阶段、反馈闭环与工具活动
            </li>
            <li>
              <span className="hint-key">03</span>危险操作会触发人工审批（HITL）
            </li>
            <li>
              <span className="hint-key">04</span>完成的任务自动保存到左侧会话历史
            </li>
          </ul>
          {!connected && (
            <p className="hint-warn">
              未连接后端。若设置了 HARNESS_TOKEN，请用 ?token=… 打开页面。
            </p>
          )}
        </div>
      )}

      {items.map((item) =>
        item.kind === 'user' ? (
          <div key={item.id} className="task-card">
            <div className="task-tag">你的任务</div>
            <div className="task-text">{item.text}</div>
          </div>
        ) : (
          <RoundCard key={item.id} item={item} />
        ),
      )}

      {end && (
        <div className={`end-card panel ${end.status}`}>
          <div className="end-title">
            {STATUS_LABEL[end.status] ?? end.status} · 共 {end.rounds} 轮
          </div>
          <FeedbackTrail history={end.feedbackHistory} compact />
          {review && <div className="end-note">回顾模式 — 点击左侧"＋ 新任务"返回实时模式</div>}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 4: 追加 timeline 样式到 `webui/src/styles.css` 末尾**

```css
/* ---------- chat timeline ---------- */

.timeline {
  flex: 1;
  overflow-y: auto;
  min-height: 0;
  display: flex;
  flex-direction: column;
  gap: 12px;
  padding: 2px;
  scroll-behavior: smooth;
}

.hint {
  padding: 20px 22px;
}

.hint-list {
  list-style: none;
  margin: 12px 0 0;
  padding: 0;
  display: flex;
  flex-direction: column;
  gap: 8px;
  color: var(--text-dim);
}

.hint-key {
  color: var(--info);
  margin-right: 10px;
  font-size: 11px;
}

.hint-warn {
  margin: 14px 0 0;
  color: var(--warn);
}

.task-card {
  align-self: flex-end;
  max-width: min(75%, 620px);
  background: rgba(61, 214, 140, 0.06);
  border: 1px solid rgba(61, 214, 140, 0.35);
  border-radius: var(--radius);
  padding: 10px 14px;
  animation: card-in 200ms var(--ease-out);
}

.task-tag {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: var(--accent);
  margin-bottom: 4px;
}

.task-text {
  white-space: pre-wrap;
  word-break: break-word;
}

.round-card {
  padding: 12px 14px;
  animation: card-in 200ms var(--ease-out);
  scroll-margin-top: 8px;
}

.round-head {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-bottom: 8px;
}

.round-no {
  font-size: 11px;
  font-weight: 600;
  letter-spacing: 0.14em;
  color: var(--info);
}

.round-text {
  margin: 0 0 4px;
  white-space: pre-wrap;
  word-break: break-word;
}

.round-text.dim {
  color: var(--text-dim);
}

.tool-list {
  display: flex;
  flex-direction: column;
  gap: 6px;
  margin-top: 8px;
}

.tool-block {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  background: var(--bg-inset);
}

.tool-block.blocked {
  border-color: rgba(240, 113, 120, 0.4);
}

.tool-head {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  padding: 6px 10px;
  background: transparent;
  border: none;
  cursor: pointer;
  color: var(--warn);
  font-size: 11px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  text-align: left;
}

.tool-head svg {
  flex-shrink: 0;
}

.tool-name {
  flex-shrink: 0;
}

.tool-preview {
  color: var(--text-dim);
  text-transform: none;
  letter-spacing: 0;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-result {
  margin: 0;
  padding: 8px 10px;
  border-top: 1px solid var(--border);
  font-size: 11px;
  color: var(--text-dim);
  white-space: pre-wrap;
  word-break: break-word;
  max-height: 220px;
  overflow: auto;
}

.end-card {
  padding: 12px 14px;
  animation: card-in 200ms var(--ease-out);
}

.end-card.error {
  border-color: rgba(240, 113, 120, 0.4);
}

.end-title {
  font-size: 12px;
  font-weight: 600;
  letter-spacing: 0.08em;
  margin-bottom: 8px;
}

.end-note {
  margin-top: 8px;
  color: var(--info);
  font-size: 11px;
}

/* ---------- composer ---------- */

.composer {
  display: flex;
  gap: 10px;
}

.prompt-wrap {
  flex: 1;
  display: flex;
  align-items: center;
  gap: 10px;
  background: var(--bg-panel);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 0 14px;
  backdrop-filter: blur(8px);
}

.prompt-wrap:focus-within {
  border-color: rgba(61, 214, 140, 0.55);
  box-shadow:
    0 0 0 1px rgba(61, 214, 140, 0.2),
    0 0 16px rgba(61, 214, 140, 0.08);
}

.prompt-prefix {
  color: var(--accent);
  font-weight: 600;
  user-select: none;
}

.prompt-wrap input {
  flex: 1;
  border: none;
  outline: none;
  background: transparent;
  color: var(--text);
  padding: 12px 0;
  font-size: 13px;
}

.prompt-wrap input::placeholder {
  color: var(--text-dim);
}

.prompt-wrap input:disabled {
  opacity: 0.5;
}
```

- [ ] **Step 5: 验证构建**

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功

- [ ] **Step 6: Commit**

```powershell
git add webui/src/components/RoundCard.tsx webui/src/components/FeedbackTrail.tsx webui/src/components/ChatTimeline.tsx webui/src/styles.css
git commit -m "feat(webui): add chat timeline with round cards and feedback trail"
```

---

### Task 7: 控制台面板组（ControlDeck 及四个子面板）

**Files:**
- Create: `webui/src/components/LoopIndicator.tsx`
- Create: `webui/src/components/RoundTimeline.tsx`
- Create: `webui/src/components/ToolStats.tsx`
- Create: `webui/src/components/ControlDeck.tsx`
- Modify: `webui/src/styles.css`（追加 deck 区块）

**Interfaces:**
- Consumes: `ChatItem`（types.ts）、`FeedbackTrail`（Task 6）
- Produces:
  - `LoopIndicator`：props `{ status: string; awaitingHITL: boolean; currentRound: number; lastRoundHadActions: boolean; lastFeedback?: string }`
  - `RoundTimeline`：props `{ rounds: Array<{ round: number; feedbackStatus?: string }>; activeRound: number; onSelect: (round: number) => void }`
  - `ToolStats`：props `{ counts: Array<{ tool: string; count: number }> }`
  - `ControlDeck`：props `{ status: string; awaitingHITL: boolean; agentItems: ChatItem[]; feedbackHistory: Array<{ round: number; status: string }>; currentRound: number; onJumpToRound: (round: number) => void }`

- [ ] **Step 1: 创建 `webui/src/components/LoopIndicator.tsx`**

```tsx
import { Database, Brain, Wrench, RefreshCcw } from 'lucide-react';

interface LoopIndicatorProps {
  status: string;
  awaitingHITL: boolean;
  currentRound: number;
  lastRoundHadActions: boolean;
  lastFeedback?: string;
}

export function LoopIndicator({
  status,
  awaitingHITL,
  currentRound,
  lastRoundHadActions,
  lastFeedback,
}: LoopIndicatorProps) {
  const running = status === 'running';
  const contextActive = running && currentRound === 0;
  const llmActive = running && !awaitingHITL && !contextActive;
  const toolState = awaitingHITL ? 'awaiting' : lastRoundHadActions ? 'done' : '';
  const feedbackState = lastFeedback === 'fail' ? 'fail' : lastFeedback === 'pass' ? 'pass' : '';

  return (
    <div className="loop-flow">
      <div className={`loop-node ${contextActive ? 'active' : ''} ${currentRound > 0 ? 'done' : ''}`}>
        <Database size={14} aria-hidden />
        <span>上下文</span>
      </div>
      <span className="loop-link" aria-hidden />
      <div className={`loop-node ${llmActive ? 'active' : ''}`}>
        <Brain size={14} aria-hidden />
        <span>LLM</span>
      </div>
      <span className="loop-link" aria-hidden />
      <div className={`loop-node ${toolState}`}>
        <Wrench size={14} aria-hidden />
        <span>工具</span>
      </div>
      <span className="loop-link" aria-hidden />
      <div className={`loop-node ${feedbackState}`}>
        <RefreshCcw size={14} aria-hidden />
        <span>反馈</span>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 创建 `webui/src/components/RoundTimeline.tsx`**

```tsx
interface RoundTimelineProps {
  rounds: Array<{ round: number; feedbackStatus?: string }>;
  activeRound: number;
  onSelect: (round: number) => void;
}

export function RoundTimeline({ rounds, activeRound, onSelect }: RoundTimelineProps) {
  if (rounds.length === 0) {
    return <div className="deck-empty">待机 — 暂无轮次</div>;
  }

  return (
    <ol className="round-tl">
      {rounds.map((r) => (
        <li key={r.round}>
          <button
            type="button"
            className={`round-tl-node ${r.round === activeRound ? 'active' : ''} ${r.feedbackStatus ?? ''}`}
            onClick={() => onSelect(r.round)}
          >
            <span className="round-tl-dot" aria-hidden />
            <span>第 {r.round} 轮</span>
            {r.feedbackStatus && (
              <span className={`fb-tag sm ${r.feedbackStatus}`}>{r.feedbackStatus}</span>
            )}
          </button>
        </li>
      ))}
    </ol>
  );
}
```

- [ ] **Step 3: 创建 `webui/src/components/ToolStats.tsx`**

```tsx
interface ToolStatsProps {
  counts: Array<{ tool: string; count: number }>;
}

export function ToolStats({ counts }: ToolStatsProps) {
  if (counts.length === 0) {
    return <div className="deck-empty">待机 — 暂无工具调用</div>;
  }

  const max = Math.max(...counts.map((c) => c.count));

  return (
    <div className="tool-stats">
      {counts.map((c) => (
        <div key={c.tool} className="tool-stat-row">
          <span className="tool-stat-name">{c.tool}</span>
          <span className="tool-stat-bar">
            <span className="tool-stat-fill" style={{ width: `${(c.count / max) * 100}%` }} />
          </span>
          <span className="tool-stat-count">{c.count}</span>
        </div>
      ))}
    </div>
  );
}
```

- [ ] **Step 4: 创建 `webui/src/components/ControlDeck.tsx`**

```tsx
import type { ChatItem } from '../types';
import { LoopIndicator } from './LoopIndicator';
import { RoundTimeline } from './RoundTimeline';
import { FeedbackTrail } from './FeedbackTrail';
import { ToolStats } from './ToolStats';

interface ControlDeckProps {
  status: string;
  awaitingHITL: boolean;
  agentItems: ChatItem[];
  feedbackHistory: Array<{ round: number; status: string }>;
  currentRound: number;
  onJumpToRound: (round: number) => void;
}

export function ControlDeck({
  status,
  awaitingHITL,
  agentItems,
  feedbackHistory,
  currentRound,
  onJumpToRound,
}: ControlDeckProps) {
  const rounds = agentItems.map((it) => ({ round: it.round!, feedbackStatus: it.feedbackStatus }));

  const toolCounts = new Map<string, number>();
  agentItems.forEach((it) =>
    it.actions?.forEach((a) => toolCounts.set(a.tool, (toolCounts.get(a.tool) ?? 0) + 1)),
  );
  const counts = [...toolCounts.entries()]
    .map(([tool, count]) => ({ tool, count }))
    .sort((a, b) => b.count - a.count);

  const last = agentItems[agentItems.length - 1];

  return (
    <aside className="deck">
      <section className="deck-panel panel">
        <div className="panel-label">AGENT 循环</div>
        <LoopIndicator
          status={status}
          awaitingHITL={awaitingHITL}
          currentRound={currentRound}
          lastRoundHadActions={Boolean(last?.actions?.length)}
          lastFeedback={last?.feedbackStatus}
        />
      </section>

      <section className="deck-panel panel">
        <div className="panel-label">轮次时间线</div>
        <RoundTimeline rounds={rounds} activeRound={currentRound} onSelect={onJumpToRound} />
      </section>

      <section className="deck-panel panel">
        <div className="panel-label">反馈闭环</div>
        <FeedbackTrail history={feedbackHistory} />
      </section>

      <section className="deck-panel panel">
        <div className="panel-label">工具活动</div>
        <ToolStats counts={counts} />
      </section>
    </aside>
  );
}
```

- [ ] **Step 5: 追加 deck 样式到 `webui/src/styles.css` 末尾**

```css
/* ---------- control deck ---------- */

.deck {
  display: flex;
  flex-direction: column;
  gap: 12px;
  min-height: 0;
  overflow-y: auto;
  padding: 2px;
}

.deck-panel {
  padding: 12px;
}

.deck-panel .panel-label {
  margin-bottom: 10px;
}

.deck-empty,
.trail-empty {
  color: var(--text-dim);
  font-size: 11px;
  letter-spacing: 0.04em;
}

/* loop indicator */

.loop-flow {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 4px;
}

.loop-node {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 4px;
  min-width: 56px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text-dim);
  font-size: 10px;
  letter-spacing: 0.08em;
  transition:
    border-color 300ms var(--ease-out),
    color 300ms var(--ease-out),
    box-shadow 300ms var(--ease-out);
}

.loop-node.active {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.6);
  box-shadow: 0 0 12px rgba(61, 214, 140, 0.25);
}

.loop-node.awaiting {
  color: var(--warn);
  border-color: rgba(230, 162, 60, 0.6);
  box-shadow: 0 0 12px rgba(230, 162, 60, 0.25);
  animation: led-pulse 1s linear infinite;
}

.loop-node.done {
  color: var(--info);
  border-color: rgba(34, 211, 238, 0.35);
}

.loop-node.fail {
  color: var(--danger);
  border-color: rgba(240, 113, 120, 0.55);
}

.loop-node.pass {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.55);
}

.loop-link {
  flex: 1;
  height: 1px;
  background: var(--border-strong);
  min-width: 6px;
}

/* round timeline */

.round-tl {
  list-style: none;
  margin: 0;
  padding: 0 0 0 4px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  max-height: 180px;
  overflow-y: auto;
}

.round-tl-node {
  display: flex;
  align-items: center;
  gap: 8px;
  width: 100%;
  background: transparent;
  border: none;
  border-left: 2px solid var(--border);
  padding: 5px 8px;
  color: var(--text-dim);
  font-size: 11px;
  cursor: pointer;
  text-align: left;
  transition:
    color 120ms var(--ease-out),
    border-color 120ms var(--ease-out);
}

.round-tl-node:hover {
  color: var(--text);
}

.round-tl-node.active {
  color: var(--accent);
  border-left-color: var(--accent);
}

.round-tl-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--text-dim);
  flex-shrink: 0;
}

.round-tl-node.active .round-tl-dot {
  background: var(--accent);
  box-shadow: 0 0 8px rgba(61, 214, 140, 0.8);
  animation: led-pulse 1.6s linear infinite;
}

.round-tl-node.fail .round-tl-dot {
  background: var(--danger);
}

.round-tl-node.pass .round-tl-dot {
  background: var(--accent);
}

/* feedback trail */

.trail {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 6px;
}

.trail-step {
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.trail-arrow {
  color: var(--text-dim);
  font-size: 10px;
}

.trail-node {
  font-size: 10px;
  padding: 2px 8px;
  border-radius: 3px;
  border: 1px solid;
  letter-spacing: 0.06em;
}

.trail-node.fail {
  color: var(--danger);
  border-color: rgba(240, 113, 120, 0.5);
  background: rgba(240, 113, 120, 0.08);
}

.trail-node.pass {
  color: var(--accent);
  border-color: rgba(61, 214, 140, 0.5);
  background: rgba(61, 214, 140, 0.08);
}

/* tool stats */

.tool-stats {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.tool-stat-row {
  display: grid;
  grid-template-columns: 76px 1fr 20px;
  align-items: center;
  gap: 8px;
  font-size: 10px;
  color: var(--text-dim);
}

.tool-stat-name {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.tool-stat-bar {
  height: 6px;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: 3px;
  overflow: hidden;
}

.tool-stat-fill {
  display: block;
  height: 100%;
  background: linear-gradient(90deg, var(--info), var(--accent));
  transition: width 300ms var(--ease-out);
}

.tool-stat-count {
  text-align: right;
  color: var(--text);
}
```

- [ ] **Step 6: 验证构建**

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功

- [ ] **Step 7: Commit**

```powershell
git add webui/src/components/LoopIndicator.tsx webui/src/components/RoundTimeline.tsx webui/src/components/ToolStats.tsx webui/src/components/ControlDeck.tsx webui/src/styles.css
git commit -m "feat(webui): add control deck with loop indicator, round timeline, tool stats"
```

---

### Task 8: HITL 弹窗重设计（含参数编辑）

**Files:**
- Modify: `webui/src/components/HITLModal.tsx`（整体重写）
- Modify: `webui/src/styles.css`（追加 hitl 区块，同时**删除**旧 `.hitl-*` 相关样式——注意：旧 styles.css 已在 Task 4 整体重写，旧 hitl 类已不存在，本任务只需追加）

**Interfaces:**
- Consumes: `HITLRequestPayload`（types.ts）、`.panel`/`.btn`/`.led`（styles.css）
- Produces: `HITLModal` 组件签名不变：`{ request: HITLRequestPayload; onApprove: (modifiedArgs?: Record<string, unknown>) => void; onReject: () => void }`；新增行为：参数可编辑（非法 JSON 禁用批准）、`A`/`R` 键盘快捷键（INPUT/TEXTAREA 聚焦时不触发）

- [ ] **Step 1: 整体重写 `webui/src/components/HITLModal.tsx`**

```tsx
import { useEffect, useMemo, useState } from 'react';
import { ShieldAlert, OctagonAlert } from 'lucide-react';
import type { HITLRequestPayload } from '../types';

interface HITLModalProps {
  request: HITLRequestPayload;
  onApprove: (modifiedArgs?: Record<string, unknown>) => void;
  onReject: () => void;
}

export function HITLModal({ request, onApprove, onReject }: HITLModalProps) {
  const isCritical = request.severity === 'critical';
  const original = useMemo(() => JSON.stringify(request.arguments, null, 2), [request]);
  const [argsText, setArgsText] = useState(original);

  const parsed = useMemo(() => {
    try {
      return { value: JSON.parse(argsText) as Record<string, unknown>, ok: true };
    } catch {
      return { value: undefined, ok: false };
    }
  }, [argsText]);

  const modified = parsed.ok && argsText.trim() !== original.trim();

  const approve = () => {
    if (!parsed.ok) return;
    onApprove(modified ? parsed.value : undefined);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement).tagName;
      if (tag === 'TEXTAREA' || tag === 'INPUT') return;
      if (e.key.toLowerCase() === 'a') approve();
      if (e.key.toLowerCase() === 'r') onReject();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return (
    <div className="hitl-overlay" role="dialog" aria-modal="true" aria-labelledby="hitl-title">
      <div className={`hitl-dialog panel ${request.severity}`}>
        <div className="hitl-band" aria-hidden />
        <div className="hitl-head">
          {isCritical ? (
            <OctagonAlert size={16} aria-hidden />
          ) : (
            <ShieldAlert size={16} aria-hidden />
          )}
          <h2 id="hitl-title">[{request.severity}] 危险操作待审批</h2>
        </div>

        <div className="hitl-body">
          <div className="row">
            <strong>工具</strong>
            <span>{request.toolName}</span>
          </div>
          <div className="row">
            <strong>原因</strong>
            <span>{request.reason}</span>
          </div>
          <label className="row col">
            <strong>参数（可直接编辑，批准时以当前内容为准）</strong>
            <textarea
              className={`hitl-args ${parsed.ok ? '' : 'invalid'}`}
              value={argsText}
              onChange={(e) => setArgsText(e.target.value)}
              rows={6}
              spellCheck={false}
            />
          </label>
          {!parsed.ok && <div className="hitl-parse-error">JSON 格式错误，修正后才能批准</div>}
        </div>

        <div className="hitl-actions">
          <button type="button" className="btn" onClick={onReject}>
            拒绝 <kbd>R</kbd>
          </button>
          <button
            type="button"
            className={isCritical ? 'btn btn-danger' : 'btn btn-primary'}
            disabled={!parsed.ok}
            onClick={approve}
          >
            {modified ? '按修改批准' : '批准'} <kbd>A</kbd>
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 2: 追加 hitl 样式到 `webui/src/styles.css` 末尾**

```css
/* ---------- HITL modal ---------- */

.hitl-overlay {
  position: fixed;
  inset: 0;
  background: rgba(3, 6, 10, 0.8);
  backdrop-filter: blur(3px);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 1000;
  padding: 20px;
  animation: fade-in 200ms var(--ease-out);
}

.hitl-dialog {
  width: min(560px, 100%);
  padding: 0;
  overflow: hidden;
  animation: card-in 200ms var(--ease-out);
}

.hitl-band {
  height: 3px;
  background: var(--warn);
  box-shadow: 0 0 12px rgba(230, 162, 60, 0.6);
}

.hitl-dialog.critical .hitl-band {
  background: var(--danger);
  box-shadow: 0 0 12px rgba(240, 113, 120, 0.6);
  animation: led-pulse 0.8s linear infinite;
}

.hitl-head {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 14px 18px 0;
  color: var(--warn);
}

.hitl-dialog.critical .hitl-head {
  color: var(--danger);
}

.hitl-head h2 {
  margin: 0;
  font-size: 13px;
  letter-spacing: 0.1em;
  text-transform: uppercase;
}

.hitl-body {
  padding: 12px 18px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.hitl-body .row {
  display: flex;
  gap: 10px;
  align-items: baseline;
  color: var(--text-dim);
  font-size: 12px;
}

.hitl-body .row strong {
  color: var(--text);
  min-width: 32px;
  flex-shrink: 0;
}

.hitl-body .row.col {
  flex-direction: column;
  align-items: stretch;
  gap: 6px;
}

.hitl-args {
  width: 100%;
  background: var(--bg-inset);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  color: var(--text);
  font-family: var(--font);
  font-size: 11px;
  line-height: 1.5;
  padding: 8px 10px;
  resize: vertical;
  outline: none;
}

.hitl-args:focus {
  border-color: var(--border-strong);
}

.hitl-args.invalid {
  border-color: rgba(240, 113, 120, 0.6);
}

.hitl-parse-error {
  color: var(--danger);
  font-size: 11px;
}

.hitl-actions {
  display: flex;
  gap: 10px;
  justify-content: flex-end;
  padding: 0 18px 16px;
}
```

- [ ] **Step 3: 验证构建**

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功

- [ ] **Step 4: Commit**

```powershell
git add webui/src/components/HITLModal.tsx webui/src/styles.css
git commit -m "feat(webui): redesign HITL modal with editable args and shortcuts"
```

---

### Task 9: App 集成 + 回顾模式 + 收尾

**Files:**
- Create: `webui/src/components/TopBar.tsx`
- Modify: `webui/src/App.tsx`（整体重写）
- Delete: `webui/src/components/ChatPanel.tsx`、`webui/src/components/AgentLog.tsx`
- Modify: `webui/src/styles.css`（追加响应式区块）
- Modify: `webui/DESIGN.md`（整体重写）
- Modify: `README.md`（目录结构 webui 部分 + 测试数量）

**Interfaces:**
- Consumes: Task 3-8 的全部组件与 hooks
- Produces: `TopBar`：props `{ connected: boolean; reconnecting: boolean; status: string; awaitingHITL: boolean; currentRound: number; toolCallCount: number; sidebarOpen: boolean; deckOpen: boolean; onToggleSidebar: () => void; onToggleDeck: () => void }`；完成的三栏应用

- [ ] **Step 1: 创建 `webui/src/components/TopBar.tsx`**

```tsx
import { Activity, PanelLeft, PanelRight, Wrench } from 'lucide-react';

interface TopBarProps {
  connected: boolean;
  reconnecting: boolean;
  status: string;
  awaitingHITL: boolean;
  currentRound: number;
  toolCallCount: number;
  sidebarOpen: boolean;
  deckOpen: boolean;
  onToggleSidebar: () => void;
  onToggleDeck: () => void;
}

const STATUS_LABEL: Record<string, string> = {
  idle: '空闲',
  running: '执行中',
  completed: '已完成',
  max_rounds: '轮次上限',
  error: '错误',
  cancelled: '已取消',
  review: '回顾中',
};

export function TopBar({
  connected,
  reconnecting,
  status,
  awaitingHITL,
  currentRound,
  toolCallCount,
  sidebarOpen,
  deckOpen,
  onToggleSidebar,
  onToggleDeck,
}: TopBarProps) {
  const connLed = connected ? 'led on' : reconnecting ? 'led warn' : 'led off';
  const agentLed =
    awaitingHITL || status === 'running'
      ? 'led warn'
      : status === 'error'
        ? 'led off'
        : connected
          ? 'led on'
          : 'led off';

  return (
    <header className="topbar panel">
      <button
        type="button"
        className={`icon-btn ${sidebarOpen ? 'on' : ''}`}
        onClick={onToggleSidebar}
        aria-label="切换会话历史栏"
      >
        <PanelLeft size={14} aria-hidden />
      </button>
      <div className="brand">
        CODING AGENT <span>HARNESS</span>
      </div>
      <div className="topbar-metrics">
        <span className="metric">
          <Activity size={12} aria-hidden />
          轮次 <strong>{currentRound}</strong>
        </span>
        <span className="metric">
          <Wrench size={12} aria-hidden />
          工具 <strong>{toolCallCount}</strong>
        </span>
      </div>
      <div className="status-row">
        <span className="status-item">
          <span className={connLed} aria-hidden />
          {connected ? '已连接' : reconnecting ? '重连中…' : '未连接'}
        </span>
        <span className="status-item">
          <span className={agentLed} aria-hidden />
          {awaitingHITL ? '等待审批' : (STATUS_LABEL[status] ?? status)}
        </span>
        <button
          type="button"
          className={`icon-btn ${deckOpen ? 'on' : ''}`}
          onClick={onToggleDeck}
          aria-label="切换控制台面板"
        >
          <PanelRight size={14} aria-hidden />
        </button>
      </div>
    </header>
  );
}
```

- [ ] **Step 2: 整体重写 `webui/src/App.tsx`**

```tsx
import { useEffect, useState, type FormEvent } from 'react';
import { useWebSocket } from './hooks/useWebSocket';
import { useSessions } from './hooks/useSessions';
import { getSession } from './api/sessions';
import { TopBar } from './components/TopBar';
import { SessionSidebar } from './components/SessionSidebar';
import { ChatTimeline, type EndSummary } from './components/ChatTimeline';
import { ControlDeck } from './components/ControlDeck';
import { HITLModal } from './components/HITLModal';
import type { ChatItem, SessionRecord } from './types';

const BUSY = new Set(['running']);

function chatFromSession(s: SessionRecord): ChatItem[] {
  const items: ChatItem[] = [{ id: 'user-0', kind: 'user', text: s.task }];
  s.data.progressEvents.forEach((p, i) => {
    items.push({
      id: `agent-${i}`,
      kind: 'agent',
      round: p.round,
      text: p.assistantContent,
      actions: p.actions,
      feedbackStatus: p.feedbackStatus,
    });
  });
  return items;
}

export default function App() {
  const [task, setTask] = useState('');
  const [review, setReview] = useState<SessionRecord | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [deckOpen, setDeckOpen] = useState(true);

  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsHost = import.meta.env.DEV ? 'localhost:3000' : window.location.host;
  const { connected, reconnecting, status, result, hitlRequest, chat, sendTask, cancel, respondHITL } =
    useWebSocket(`${protocol}//${wsHost}`);
  const { sessions, loading, error, refresh, remove } = useSessions();

  const busy = BUSY.has(status);

  useEffect(() => {
    if (result) void refresh();
  }, [result, refresh]);

  const items = review ? chatFromSession(review) : chat;
  const agentItems = items.filter((it) => it.kind === 'agent');
  const feedbackHistory = agentItems
    .filter((it) => it.feedbackStatus)
    .map((it) => ({ round: it.round!, status: it.feedbackStatus! }));
  const currentRound = agentItems.length;
  const toolCallCount = agentItems.reduce((n, it) => n + (it.actions?.length ?? 0), 0);

  const end: EndSummary | null = review
    ? { status: review.status, rounds: review.rounds, feedbackHistory: review.data.feedbackHistory }
    : result
      ? { status: result.status, rounds: result.rounds, feedbackHistory: result.feedbackHistory }
      : null;

  const handleSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (task.trim() && !busy && !review) {
      sendTask(task.trim());
      setTask('');
    }
  };

  const handleSelectSession = async (id: number) => {
    try {
      setReview(await getSession(id));
      setDetailError(null);
    } catch {
      setDetailError('会话详情加载失败');
    }
  };

  const handleDeleteSession = async (id: number) => {
    await remove(id);
    if (review?.id === id) setReview(null);
  };

  const jumpToRound = (round: number) => {
    document.getElementById(`round-${round}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  return (
    <div className="app-shell">
      {hitlRequest && (
        <HITLModal
          request={hitlRequest}
          onApprove={(modifiedArgs) => respondHITL(true, modifiedArgs)}
          onReject={() => respondHITL(false)}
        />
      )}

      <TopBar
        connected={connected}
        reconnecting={reconnecting}
        status={review ? 'review' : status}
        awaitingHITL={Boolean(hitlRequest)}
        currentRound={currentRound}
        toolCallCount={toolCallCount}
        sidebarOpen={sidebarOpen}
        deckOpen={deckOpen}
        onToggleSidebar={() => setSidebarOpen((v) => !v)}
        onToggleDeck={() => setDeckOpen((v) => !v)}
      />

      <div className={`app-body ${sidebarOpen ? '' : 'no-sidebar'} ${deckOpen ? '' : 'no-deck'}`}>
        {sidebarOpen && (
          <SessionSidebar
            sessions={sessions}
            loading={loading}
            error={error ?? detailError}
            activeId={review?.id ?? null}
            onRetry={() => {
              setDetailError(null);
              void refresh();
            }}
            onSelect={handleSelectSession}
            onNew={() => setReview(null)}
            onDelete={handleDeleteSession}
          />
        )}

        <main className="main-col">
          <ChatTimeline items={items} end={end} connected={connected} review={Boolean(review)} />
          <form className="composer" onSubmit={handleSubmit}>
            <div className="prompt-wrap">
              <span className="prompt-prefix" aria-hidden>
                &gt;
              </span>
              <input
                type="text"
                value={task}
                onChange={(e) => setTask(e.target.value)}
                placeholder={review ? '回顾模式中 — 点击左侧"＋ 新任务"返回实时模式' : '输入编码任务…'}
                disabled={busy || Boolean(review)}
                aria-label="Coding task"
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={busy || !connected || Boolean(review)}
            >
              发送
            </button>
            {busy && (
              <button type="button" className="btn btn-danger" onClick={cancel}>
                取消
              </button>
            )}
          </form>
        </main>

        {deckOpen && (
          <ControlDeck
            status={review ? 'review' : status}
            awaitingHITL={Boolean(hitlRequest)}
            agentItems={agentItems}
            feedbackHistory={feedbackHistory}
            currentRound={currentRound}
            onJumpToRound={jumpToRound}
          />
        )}
      </div>
    </div>
  );
}
```

- [ ] **Step 3: 删除旧组件**

```powershell
git rm webui/src/components/ChatPanel.tsx webui/src/components/AgentLog.tsx
```

- [ ] **Step 4: 追加响应式样式到 `webui/src/styles.css` 末尾**

```css
/* ---------- responsive ---------- */

@media (max-width: 1100px) {
  .app-body,
  .app-body.no-deck {
    grid-template-columns: 200px minmax(0, 1fr);
  }

  .app-body.no-sidebar,
  .app-body.no-sidebar.no-deck {
    grid-template-columns: minmax(0, 1fr);
  }

  .app-body .deck {
    position: fixed;
    right: 12px;
    top: 64px;
    bottom: 12px;
    width: 320px;
    z-index: 100;
  }
}
```

- [ ] **Step 5: 整体重写 `webui/DESIGN.md`**

```markdown
# DESIGN.md — Harness Mission Control

Brand contract for the Coding Agent Harness WebUI (v2, 2026-08).

## Identity

| Field | Value |
|-------|--------|
| System name | **Harness Mission Control** |
| Product | Coding Agent Harness |
| Mood | Dark-tech HUD / space-station operator console |
| Density | Tool-first, medium-high information density |

## Color tokens

| Token | Value | Usage |
|-------|--------|--------|
| `--bg` | `#070b12` | Page background (deep space blue-black) |
| `--bg-panel` | `rgba(13, 20, 32, 0.72)` | Panels (with backdrop blur) |
| `--bg-elevated` | `#0d1420` | Buttons, inputs |
| `--bg-inset` | `#05080e` | Code blocks, tool results, stat bars |
| `--border` | `rgba(120, 160, 200, 0.14)` | Hairline rules |
| `--border-strong` | `rgba(120, 160, 200, 0.3)` | Corner ticks, hover states |
| `--text` | `#dbe4ee` | Primary text |
| `--text-dim` | `#7d8fa3` | Secondary / labels |
| `--accent` | `#3dd68c` | Signal green: connected, success, primary |
| `--info` | `#22d3ee` | Cyan: numbers, round numbers, done states |
| `--warn` | `#e6a23c` | high severity, awaiting, tool names |
| `--danger` | `#f07178` | critical, reject, fail |

Glow (`box-shadow` with accent color) is reserved for status LEDs and the
active loop stage only — never for decoration.

## Typography

- **UI + log:** `IBM Plex Mono`, `JetBrains Mono`, `ui-monospace`, monospace
- Body: 13px; panel labels: 10px uppercase with 0.12em tracking; dashboard
  numbers: 14px semibold
- No serif; no Inter / Roboto / system-ui as primary

## Layout

Three-zone app shell, full viewport height, page never scrolls (each zone
scrolls internally):

1. **Top bar** — brand, round/tool metrics, connection + agent status LEDs, panel toggles
2. **Left** — session history sidebar (240px, collapsible)
3. **Center** — chat timeline + bottom composer
4. **Right** — control deck (320px): loop indicator, round timeline, feedback trail, tool stats

Below 1100px the deck becomes a fixed overlay (toggled from the top bar).
Radius ≤ 6px; 1px translucent borders; grid backdrop (`36px` cells); panels
carry corner ticks via `.panel` pseudo-elements. No soft shadows, no card stacks.

## Components

- **Panel:** `.panel` + corner ticks; `.panel-label` for section titles
- **LED:** square, glowing when `.on` (green pulse) / `.warn` (amber pulse) / `.off` (red)
- **Round card:** `ROUND NN` header, collapsible tool blocks with per-tool lucide icons
- **Loop indicator:** 上下文 → LLM → 工具 → 反馈 nodes; active glows green,
  awaiting HITL pulses amber, done turns cyan, feedback node carries fail/pass color
- **Feedback trail:** `R1 FAIL → R2 PASS` node chain
- **HITL modal:** severity band on top (amber / pulsing red), editable JSON
  args, `A` approve / `R` reject shortcuts

## Motion

| Interaction | Motion |
|-------------|--------|
| Button press | `transform: scale(0.97)` ~120ms `--ease-out` |
| Card / modal appear | opacity + translateY(8px), ~200ms `--ease-out` |
| Connected LED | opacity pulse ~1.6s linear (ambient only) |
| Loop stage change | border/color/box-shadow 300ms transition |
| Tool stat bars | width 300ms transition |

`--ease-out: cubic-bezier(0.23, 1, 0.32, 1)`

## Toolchain

| Layer | Choice |
|-------|--------|
| Icons | lucide-react (only UI dependency) |
| Animation | Pure CSS (no animation library) |
| Data | WebSocket (unchanged protocol) + `/api/sessions` REST |
| Implementation | React 18 + Vite in `webui/` |
```

- [ ] **Step 6: 更新 `README.md`**

将 README 目录结构中 webui 部分（约 154-157 行）：

```
│   └── src/
│       ├── components/ # ChatPanel, AgentLog, HITLModal
│       └── hooks/      # WebSocket 钩子
```

替换为：

```
│   └── src/
│       ├── api/        # sessions REST 封装
│       ├── components/ # TopBar, SessionSidebar, ChatTimeline, ControlDeck, HITLModal 等
│       └── hooks/      # WebSocket（自动重连）与会话列表钩子
```

同时更新"测试"小节中的数量表述为实际数字（Step 7 跑完后确认；应为 24 个文件、93 个测试）。

- [ ] **Step 7: 全量验证**

Run: `npm test`
Expected: 全部 PASS（93 个测试）

Run: `cd webui; npm run build; cd ..`
Expected: 构建成功

手动验证清单（启动 `npm run dev` + `cd webui; npm run dev`，访问 http://localhost:5173）：

- [ ] 空状态显示 HUD 欢迎屏（4 条系统就绪指引）
- [ ] 发送任务后：轮次卡片实时出现；右侧循环指示器/轮次时间线/工具统计同步更新；任务结束后出现结束卡
- [ ] 左侧栏自动出现新会话（状态徽章 + 轮次 + 相对时间）
- [ ] 点击历史会话进入回顾模式：时间线与右侧面板渲染历史数据，输入条禁用并提示
- [ ] 点击"＋ 新任务"返回实时模式
- [ ] 删除会话后列表消失该项
- [ ] 停掉后端：顶栏显示"重连中…"；重启后端后自动恢复"已连接"
- [ ] 顶栏两个面板开关可收起/展开侧栏与控制台
- [ ] HITL 弹窗（需真实 LLM 触发危险操作，或由评审者检查代码路径）：参数可编辑、非法 JSON 禁用批准、A/R 快捷键生效

- [ ] **Step 8: Commit**

```powershell
git add webui/src/components/TopBar.tsx webui/src/App.tsx webui/src/styles.css webui/DESIGN.md README.md
git commit -m "feat(webui): integrate mission control layout with session review mode"
```

---

## 附：交付完成标准

- `npm test`：93 个测试全部通过
- `cd webui; npm run build`：构建成功
- 手动验证清单全部打勾
- 旧组件 `ChatPanel.tsx` / `AgentLog.tsx` 已删除
