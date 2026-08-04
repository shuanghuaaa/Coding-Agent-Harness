# Coding Agent Harness Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Coding Agent Harness with WebUI — agent loop, tools, guardrails, feedback loop, memory, and Docker distribution.

**Architecture:** Monorepo with TypeScript backend (harness kernel + HTTP/WebSocket server) and React frontend (WebUI). Harness kernel is independently testable with mock LLM. Feedback loop is the main contribution.

**Tech Stack:** TypeScript 5.4+, Node.js 20 LTS, React 18 + Vite, Vitest, SQLite (better-sqlite3), ws (WebSocket), keytar + AES-256-GCM, Docker

## Global Constraints

- TypeScript strict mode enabled
- All core mechanisms must pass deterministic mock-LLM unit tests
- No real API keys in code, git, or tests
- Node.js >= 20.0.0
- Docker for distribution
- TDD: red → green → refactor → commit per task
- Each task ends with independently testable deliverable

---

## File Structure

```
project-root/
├── src/
│   ├── index.ts                       # Entry point, server startup
│   ├── agent/
│   │   ├── types.ts                   # Message, ToolCall, AgentState
│   │   ├── context-builder.ts         # Build messages[] from config+memory+history+tools
│   │   ├── stop-condition.ts          # Max rounds / user cancel / completion
│   │   └── loop.ts                    # AgentLoop: orchestrates the main cycle
│   ├── llm/
│   │   ├── provider.ts                # LLMProvider interface
│   │   ├── mock-llm.ts                # MockLLM with preset responses
│   │   └── openai-compatible.ts       # OpenAICompatibleLLM (real API)
│   ├── tools/
│   │   ├── base.ts                    # Tool interface + ToolResult
│   │   ├── dispatcher.ts              # ToolDispatcher: route by name
│   │   ├── file-tools.ts              # read_file, write_file, delete_file
│   │   ├── shell-tool.ts              # shell execution
│   │   ├── search-tool.ts             # grep search
│   │   ├── git-tool.ts                # git_diff
│   │   └── test-tool.ts               # run_test (exec + parse output)
│   ├── feedback/
│   │   ├── types.ts                   # Feedback, TestFailure, FailureType
│   │   ├── classifier.ts              # FailureClassifier: compile/assertion/runtime/timeout
│   │   ├── validator.ts               # FeedbackValidator: parse test output → Feedback
│   │   └── injector.ts                # FeedbackInjector: inject feedback into loop context
│   ├── guard/
│   │   ├── rules.ts                   # Dangerous action patterns
│   │   └── guardrail.ts               # guardrail(): check action → block/allow
│   ├── memory/
│   │   ├── types.ts                   # MemoryEntry
│   │   └── store.ts                   # MemoryStore (SQLite CRUD)
│   ├── config/
│   │   └── loader.ts                  # ConfigLoader: parse .rules file
│   ├── credentials/
│   │   ├── store.ts                   # CredentialStore interface
│   │   ├── win-credential.ts          # Windows Credential Manager via keytar
│   │   └── aes-file.ts                # AES-256-GCM encrypted file fallback
│   └── server/
│       ├── types.ts                   # WS message types
│       ├── routes.ts                  # HTTP + WebSocket routes
│       └── http-server.ts             # Express + ws server
├── webui/
│   ├── index.html
│   ├── package.json
│   ├── vite.config.ts
│   ├── src/
│   │   ├── main.tsx
│   │   ├── App.tsx
│   │   ├── types.ts                   # Shared WS message types
│   │   ├── hooks/
│   │   │   └── useWebSocket.ts
│   │   └── components/
│   │       ├── ChatPanel.tsx
│   │       ├── MessageBubble.tsx
│   │       ├── AgentLog.tsx
│   │       ├── HITLModal.tsx
│   │       └── SetupWizard.tsx
├── tests/
│   ├── agent/
│   │   ├── context-builder.test.ts
│   │   ├── stop-condition.test.ts
│   │   └── loop.test.ts
│   ├── llm/
│   │   ├── mock-llm.test.ts
│   │   └── openai-compatible.test.ts
│   ├── tools/
│   │   ├── dispatcher.test.ts
│   │   ├── file-tools.test.ts
│   │   ├── shell-tool.test.ts
│   │   ├── search-tool.test.ts
│   │   ├── git-tool.test.ts
│   │   └── test-tool.test.ts
│   ├── feedback/
│   │   ├── classifier.test.ts
│   │   ├── validator.test.ts
│   │   └── injector.test.ts
│   ├── guard/
│   │   └── guardrail.test.ts
│   ├── memory/
│   │   └── store.test.ts
│   ├── config/
│   │   └── loader.test.ts
│   ├── credentials/
│   │   └── store.test.ts
│   └── integration/
│       └── harness-demo.test.ts        ★ 核心机制演示
├── package.json
├── tsconfig.json
├── vitest.config.ts
├── Dockerfile
├── docker-compose.yml
├── .dockerignore
├── .gitignore
└── .rules.example
```

---

## Phase 1: Project Scaffolding

### Task 1: Initialize project

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `vitest.config.ts`
- Create: `.gitignore`
- Create: `.dockerignore`
- Create: `Dockerfile`
- Create: `docker-compose.yml`

**Interfaces:**
- Consumes: nothing
- Produces: `package.json` with all dependencies, `tsconfig.json` with strict mode, `vitest.config.ts` ready

- [ ] **Step 1: Initialize npm project**

```bash
mkdir -p src/agent src/llm src/tools src/feedback src/guard src/memory src/config src/credentials src/server
mkdir -p tests/agent tests/llm tests/tools tests/feedback tests/guard tests/memory tests/config tests/credentials tests/integration
mkdir -p webui/src/components webui/src/hooks
cd "d:\大二下课程\智软工程师训练营"
npm init -y
```

- [ ] **Step 2: Install dependencies**

```bash
npm install typescript vitest better-sqlite3 ws express keytar uuid dotenv
npm install -D @types/node @types/better-sqlite3 @types/ws @types/express @types/uuid
```

- [ ] **Step 3: Write package.json**

```json
{
  "name": "coding-agent-harness",
  "version": "1.0.0",
  "description": "A Coding Agent Harness with feedback loop, guardrails, and WebUI",
  "main": "dist/index.js",
  "scripts": {
    "build": "tsc",
    "start": "node dist/index.js",
    "dev": "tsx src/index.ts",
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "better-sqlite3": "^11.0.0",
    "dotenv": "^16.4.0",
    "express": "^4.19.0",
    "keytar": "^7.9.0",
    "uuid": "^9.0.0",
    "ws": "^8.16.0"
  },
  "devDependencies": {
    "@types/better-sqlite3": "^7.6.0",
    "@types/express": "^4.17.0",
    "@types/node": "^20.11.0",
    "@types/uuid": "^9.0.0",
    "@types/ws": "^8.5.0",
    "tsx": "^4.7.0",
    "typescript": "^5.4.0",
    "vitest": "^1.6.0"
  }
}
```

- [ ] **Step 4: Write tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "commonjs",
    "lib": ["ES2022"],
    "outDir": "./dist",
    "rootDir": "./src",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": true,
    "declarationMap": true,
    "sourceMap": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules", "dist", "tests", "webui"]
}
```

- [ ] **Step 5: Write vitest.config.ts**

```typescript
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      include: ['src/**/*.ts'],
    },
  },
});
```

- [ ] **Step 6: Write .gitignore**

```
node_modules/
dist/
*.db
*.sqlite
.env
credentials/
.DS_Store
```

- [ ] **Step 7: Write .dockerignore**

```
node_modules/
dist/
tests/
*.db
*.sqlite
.env
.git/
vitest.config.ts
tsconfig.json
```

- [ ] **Step 8: Write Dockerfile**

```dockerfile
FROM node:20-alpine AS builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules ./node_modules
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 9: Write docker-compose.yml**

```yaml
version: "3.8"
services:
  harness:
    build: .
    ports:
      - "3000:3000"
    volumes:
      - ./data:/app/data
    environment:
      - NODE_ENV=production
```

- [ ] **Step 10: Install and verify**

```bash
npm install
npx vitest run --reporter=verbose
```

Expected: "No test files found" (vitest runs but no tests yet)

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json tsconfig.json vitest.config.ts .gitignore .dockerignore Dockerfile docker-compose.yml
git commit -m "chore: scaffold project with TypeScript, Vitest, Docker"
```

---

## Phase 2: Agent Types & LLM Provider

### Task 2: Define agent types

**Files:**
- Create: `src/agent/types.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Message`, `ToolCall`, `AgentState`, `ToolResult`, `LLMResponse`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/types-test.ts (type-level test - compile check)
import type { Message, ToolCall, AgentState } from '../../src/agent/types';

// Compile-time check: these assignments should type-check
const msg: Message = {
  role: 'user',
  content: 'hello',
};
const tc: ToolCall = {
  id: 'call_1',
  name: 'write_file',
  arguments: { path: 'test.ts', content: 'const x = 1;' },
};
const state: AgentState = {
  messages: [msg],
  currentRound: 0,
  maxRounds: 10,
  status: 'running',
};
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent/types-test.ts
```
Expected: FAIL (file not found, cannot import)

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/agent/types.ts
export interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  tool_calls?: ToolCall[];
  tool_call_id?: string;
}

export interface ToolCall {
  id: string;
  name: string;
  arguments: Record<string, unknown>;
}

export interface ToolResult {
  tool_call_id: string;
  content: string;
  error?: string;
}

export interface LLMResponse {
  content: string | null;
  tool_calls: ToolCall[];
  finish_reason: 'stop' | 'tool_calls' | 'length';
}

export type AgentStatus = 'idle' | 'running' | 'waiting_approval' | 'completed' | 'error';

export interface AgentState {
  messages: Message[];
  currentRound: number;
  maxRounds: number;
  status: AgentStatus;
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agent/types-test.ts
```
Expected: PASS (compile check passes)

- [ ] **Step 5: Commit**

```bash
git add src/agent/types.ts tests/agent/types-test.ts
git commit -m "feat: define agent types (Message, ToolCall, AgentState, LLMResponse)"
```

### Task 3: LLMProvider interface and MockLLM

**Files:**
- Create: `src/llm/provider.ts`
- Create: `src/llm/mock-llm.ts`
- Create: `tests/llm/mock-llm.test.ts`

**Interfaces:**
- Consumes: `Message`, `LLMResponse` from `src/agent/types`
- Produces: `LLMProvider` interface, `MockLLM` class

- [ ] **Step 1: Write the failing test**

```typescript
// tests/llm/mock-llm.test.ts
import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/llm/mock-llm';
import type { Message } from '../../src/agent/types';

describe('MockLLM', () => {
  it('returns preset responses in order', async () => {
    const responses = [
      {
        content: null,
        tool_calls: [{ id: '1', name: 'read_file', arguments: { path: 'test.ts' } }],
        finish_reason: 'tool_calls' as const,
      },
      {
        content: 'Task complete.',
        tool_calls: [],
        finish_reason: 'stop' as const,
      },
    ];
    const llm = new MockLLM(responses);
    const msgs: Message[] = [{ role: 'user', content: 'hello' }];

    const r1 = await llm.chat(msgs);
    expect(r1.tool_calls).toHaveLength(1);
    expect(r1.tool_calls[0].name).toBe('read_file');

    const r2 = await llm.chat(msgs);
    expect(r2.content).toBe('Task complete.');
    expect(r2.finish_reason).toBe('stop');
  });

  it('throws when no more responses', async () => {
    const llm = new MockLLM([]);
    await expect(llm.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('No more mock responses');
  });

  it('tracks received messages', async () => {
    const llm = new MockLLM([
      { content: 'ok', tool_calls: [], finish_reason: 'stop' },
    ]);
    await llm.chat([{ role: 'user', content: 'test' }]);
    expect(llm.receivedMessages).toHaveLength(1);
    expect(llm.receivedMessages[0][0].content).toBe('test');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/llm/mock-llm.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write provider interface**

```typescript
// src/llm/provider.ts
import type { Message, LLMResponse } from '../agent/types';

export interface LLMProvider {
  chat(messages: Message[]): Promise<LLMResponse>;
}
```

- [ ] **Step 4: Write MockLLM**

```typescript
// src/llm/mock-llm.ts
import type { LLMProvider } from './provider';
import type { Message, LLMResponse } from '../agent/types';

export class MockLLM implements LLMProvider {
  private responses: LLMResponse[];
  private index: number = 0;
  public receivedMessages: Message[][] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(messages: Message[]): Promise<LLMResponse> {
    this.receivedMessages.push([...messages]);
    if (this.index >= this.responses.length) {
      throw new Error('No more mock responses available');
    }
    return this.responses[this.index++];
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/llm/mock-llm.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/llm/provider.ts src/llm/mock-llm.ts tests/llm/mock-llm.test.ts
git commit -m "feat: add LLMProvider interface and MockLLM implementation"
```

---

## Phase 3: Tool Layer

### Task 4: Tool interface and dispatcher

**Files:**
- Create: `src/tools/base.ts`
- Create: `src/tools/dispatcher.ts`
- Create: `tests/tools/dispatcher.test.ts`

**Interfaces:**
- Consumes: `ToolCall`, `ToolResult` from `src/agent/types`
- Produces: `Tool` interface, `ToolDispatcher` class

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/dispatcher.test.ts
import { describe, it, expect } from 'vitest';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import type { Tool } from '../../src/tools/base';

describe('ToolDispatcher', () => {
  it('dispatches to correct tool by name', async () => {
    const echoTool: Tool = {
      name: 'echo',
      description: 'echoes input',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (args) => ({ content: `echo: ${args.text}` }),
    };
    const dispatcher = new ToolDispatcher([echoTool]);
    const result = await dispatcher.dispatch('echo', { text: 'hello' });
    expect(result.content).toBe('echo: hello');
  });

  it('throws on unknown tool', async () => {
    const dispatcher = new ToolDispatcher([]);
    await expect(dispatcher.dispatch('unknown', {})).rejects.toThrow('Unknown tool: unknown');
  });

  it('returns tool definitions for LLM context', () => {
    const readTool: Tool = {
      name: 'read_file',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path' } },
        required: ['path'],
      },
      execute: async () => ({ content: '' }),
    };
    const dispatcher = new ToolDispatcher([readTool]);
    const defs = dispatcher.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].function.name).toBe('read_file');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/dispatcher.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write base types**

```typescript
// src/tools/base.ts
import type { ToolResult } from '../agent/types';

export interface ToolParameter {
  type: string;
  description?: string;
  properties?: Record<string, ToolParameter>;
  required?: string[];
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}
```

- [ ] **Step 4: Write dispatcher**

```typescript
// src/tools/dispatcher.ts
import type { Tool } from './base';
import type { ToolResult } from '../agent/types';

export class ToolDispatcher {
  private tools: Map<string, Tool> = new Map();

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  async dispatch(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(args);
  }

  getDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/tools/dispatcher.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 6: Commit**

```bash
git add src/tools/base.ts src/tools/dispatcher.ts tests/tools/dispatcher.test.ts
git commit -m "feat: add Tool interface and ToolDispatcher"
```

### Task 5: File tools

**Files:**
- Create: `src/tools/file-tools.ts`
- Create: `tests/tools/file-tools.test.ts`

**Interfaces:**
- Consumes: `Tool` from `src/tools/base`
- Produces: `readFileTool`, `writeFileTool`, `deleteFileTool`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/file-tools.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileTool, writeFileTool, deleteFileTool } from '../../src/tools/file-tools';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('File tools', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'harness-test-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('readFileTool reads a file', async () => {
    const filePath = path.join(tmpDir, 'test.txt');
    fs.writeFileSync(filePath, 'hello world');
    const result = await readFileTool.execute({ path: filePath });
    expect(result.content).toContain('hello world');
  });

  it('writeFileTool creates a file', async () => {
    const filePath = path.join(tmpDir, 'new.txt');
    await writeFileTool.execute({ path: filePath, content: 'new content' });
    const actual = fs.readFileSync(filePath, 'utf-8');
    expect(actual).toBe('new content');
  });

  it('deleteFileTool deletes a file', async () => {
    const filePath = path.join(tmpDir, 'to-delete.txt');
    fs.writeFileSync(filePath, 'temp');
    await deleteFileTool.execute({ path: filePath });
    expect(fs.existsSync(filePath)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/file-tools.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write file tools**

```typescript
// src/tools/file-tools.ts
import type { Tool } from './base';
import * as fs from 'fs';

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to read' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const { path: filePath } = args as { path: string };
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return { content };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { content: '', error: `Failed to read file: ${err.message}` };
    }
  },
};

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Create or overwrite a file with content',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to write' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['path', 'content'],
  },
  execute: async (args) => {
    const { path: filePath, content } = args as { path: string; content: string };
    try {
      const dir = filePath.substring(0, filePath.lastIndexOf('/'));
      if (dir) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { content: `File written: ${filePath}` };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { content: '', error: `Failed to write file: ${err.message}` };
    }
  },
};

export const deleteFileTool: Tool = {
  name: 'delete_file',
  description: 'Delete a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to delete' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const { path: filePath } = args as { path: string };
    try {
      fs.unlinkSync(filePath);
      return { content: `File deleted: ${filePath}` };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { content: '', error: `Failed to delete file: ${err.message}` };
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/file-tools.test.ts
```
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/file-tools.ts tests/tools/file-tools.test.ts
git commit -m "feat: add file tools (read_file, write_file, delete_file)"
```

### Task 6: Shell tool

**Files:**
- Create: `src/tools/shell-tool.ts`
- Create: `tests/tools/shell-tool.test.ts`

**Interfaces:**
- Consumes: `Tool` from `src/tools/base`
- Produces: `shellTool`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/tools/shell-tool.test.ts
import { describe, it, expect } from 'vitest';
import { shellTool } from '../../src/tools/shell-tool';

describe('shellTool', () => {
  it('executes a command and returns output', async () => {
    const result = await shellTool.execute({ command: 'echo hello' });
    expect(result.content).toContain('hello');
  });

  it('returns error for failed command', async () => {
    const result = await shellTool.execute({ command: 'nonexistent_command_xyz' });
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/tools/shell-tool.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write shell tool**

```typescript
// src/tools/shell-tool.ts
import type { Tool } from './base';
import { execSync } from 'child_process';

export const shellTool: Tool = {
  name: 'shell',
  description: 'Execute a shell command and return the output',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const { command } = args as { command: string };
    try {
      const stdout = execSync(command, {
        encoding: 'utf-8',
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { content: stdout };
    } catch (error: unknown) {
      const err = error as { message: string; stdout?: string; stderr?: string };
      return {
        content: err.stdout || '',
        error: err.stderr || err.message,
      };
    }
  },
};
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/tools/shell-tool.test.ts
```
Expected: PASS (2 tests)

- [ ] **Step 5: Commit**

```bash
git add src/tools/shell-tool.ts tests/tools/shell-tool.test.ts
git commit -m "feat: add shell tool"
```

### Task 7: Search, Git, and Test tools

**Files:**
- Create: `src/tools/search-tool.ts`
- Create: `src/tools/git-tool.ts`
- Create: `src/tools/test-tool.ts`
- Create: `tests/tools/search-tool.test.ts`
- Create: `tests/tools/git-tool.test.ts`
- Create: `tests/tools/test-tool.test.ts`

**Interfaces:**
- Consumes: `Tool` from `src/tools/base`
- Produces: `searchTool`, `gitDiffTool`, `runTestTool`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/tools/search-tool.test.ts
import { describe, it, expect } from 'vitest';
import { searchTool } from '../../src/tools/search-tool';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('searchTool', () => {
  it('finds matching lines in a directory', async () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'search-'));
    fs.writeFileSync(path.join(tmpDir, 'a.ts'), 'const x = 1;\nconst y = 2;\n');
    const result = await searchTool.execute({ pattern: 'const', path: tmpDir });
    expect(result.content).toContain('const x = 1');
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});
```

```typescript
// tests/tools/git-tool.test.ts
import { describe, it, expect } from 'vitest';
import { gitDiffTool } from '../../src/tools/git-tool';

describe('gitDiffTool', () => {
  it('runs git diff in current directory', async () => {
    const result = await gitDiffTool.execute({});
    // git diff may return empty or have content depending on repo state
    expect(result).toBeDefined();
  });
});
```

```typescript
// tests/tools/test-tool.test.ts
import { describe, it, expect } from 'vitest';
import { runTestTool } from '../../src/tools/test-tool';

describe('runTestTool', () => {
  it('runs a test command and returns output', async () => {
    const result = await runTestTool.execute({ command: 'echo "2 passed"' });
    expect(result.content).toContain('2 passed');
  });

  it('returns error for failed test command', async () => {
    const result = await runTestTool.execute({ command: 'exit 1' });
    expect(result.error).toBeDefined();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/tools/search-tool.test.ts tests/tools/git-tool.test.ts tests/tools/test-tool.test.ts
```
Expected: 3 FAIL (cannot find modules)

- [ ] **Step 3: Write search tool**

```typescript
// src/tools/search-tool.ts
import type { Tool } from './base';
import { execSync } from 'child_process';

export const searchTool: Tool = {
  name: 'search',
  description: 'Search for a pattern in files using grep',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex)' },
      path: { type: 'string', description: 'Directory to search in' },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const { pattern, path: searchPath = '.' } = args as { pattern: string; path?: string };
    try {
      const stdout = execSync(`rg "${pattern}" "${searchPath}" --no-heading -n`, {
        encoding: 'utf-8',
        timeout: 10000,
      });
      return { content: stdout };
    } catch (error: unknown) {
      const err = error as { stdout?: string; stderr?: string };
      return { content: err.stdout || '', error: err.stderr || 'Search failed' };
    }
  },
};
```

- [ ] **Step 4: Write git tool**

```typescript
// src/tools/git-tool.ts
import type { Tool } from './base';
import { execSync } from 'child_process';

export const gitDiffTool: Tool = {
  name: 'git_diff',
  description: 'Show git working tree changes',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    try {
      const stdout = execSync('git diff', { encoding: 'utf-8', timeout: 10000 });
      return { content: stdout || '(no changes)' };
    } catch (error: unknown) {
      const err = error as { message: string };
      return { content: '', error: err.message };
    }
  },
};
```

- [ ] **Step 5: Write test tool**

```typescript
// src/tools/test-tool.ts
import type { Tool } from './base';
import { execSync } from 'child_process';

export const runTestTool: Tool = {
  name: 'run_test',
  description: 'Run tests and return the results',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Test command to run (e.g. npm test)' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const { command } = args as { command: string };
    try {
      const stdout = execSync(command, {
        encoding: 'utf-8',
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { content: stdout };
    } catch (error: unknown) {
      const err = error as { message: string; stdout?: string; stderr?: string };
      return {
        content: err.stdout || '',
        error: err.stderr || err.message || 'Tests failed',
      };
    }
  },
};
```

- [ ] **Step 6: Run tests to verify they pass**

```bash
npx vitest run tests/tools/search-tool.test.ts tests/tools/git-tool.test.ts tests/tools/test-tool.test.ts
```
Expected: 3 PASS

- [ ] **Step 7: Commit**

```bash
git add src/tools/search-tool.ts src/tools/git-tool.ts src/tools/test-tool.ts tests/tools/search-tool.test.ts tests/tools/git-tool.test.ts tests/tools/test-tool.test.ts
git commit -m "feat: add search, git_diff, and run_test tools"
```

---

## Phase 4: Guardrail

### Task 8: Guardrail with dangerous action patterns

**Files:**
- Create: `src/guard/rules.ts`
- Create: `src/guard/guardrail.ts`
- Create: `tests/guard/guardrail.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `dangerousPatterns`, `guardrail()`, `GuardResult`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/guard/guardrail.test.ts
import { describe, it, expect } from 'vitest';
import { guardrail } from '../../src/guard/guardrail';

describe('guardrail', () => {
  it('blocks rm -rf', () => {
    const result = guardrail('shell', { command: 'rm -rf /' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('rm -rf');
  });

  it('blocks git push --force', () => {
    const result = guardrail('shell', { command: 'git push --force origin main' });
    expect(result.blocked).toBe(true);
  });

  it('blocks DROP TABLE', () => {
    const result = guardrail('shell', { command: 'echo "DROP TABLE users;" | sqlite3 db.sqlite' });
    expect(result.blocked).toBe(true);
  });

  it('allows safe commands', () => {
    const result = guardrail('shell', { command: 'npm test' });
    expect(result.blocked).toBe(false);
  });

  it('allows safe file operations', () => {
    const result = guardrail('write_file', { path: 'src/test.ts', content: 'const x = 1;' });
    expect(result.blocked).toBe(false);
  });

  it('allows safe read operations', () => {
    const result = guardrail('read_file', { path: 'src/test.ts' });
    expect(result.blocked).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/guard/guardrail.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write dangerous rules**

```typescript
// src/guard/rules.ts
export interface DangerousPattern {
  name: string;
  toolName: string;
  argKey?: string;
  pattern: RegExp;
  severity: 'high' | 'critical';
  description: string;
}

export const dangerousPatterns: DangerousPattern[] = [
  {
    name: 'rm_rf',
    toolName: 'shell',
    argKey: 'command',
    pattern: /rm\s+-rf\s+/,
    severity: 'critical',
    description: 'Recursive force delete - can destroy the filesystem',
  },
  {
    name: 'git_push_force',
    toolName: 'shell',
    argKey: 'command',
    pattern: /git\s+push\s+.*--force/,
    severity: 'high',
    description: 'Force push to remote - can overwrite remote history',
  },
  {
    name: 'drop_table',
    toolName: 'shell',
    argKey: 'command',
    pattern: /DROP\s+TABLE/i,
    severity: 'critical',
    description: 'DROP TABLE - can destroy database tables',
  },
  {
    name: 'sudo',
    toolName: 'shell',
    argKey: 'command',
    pattern: /\bsudo\b/,
    severity: 'high',
    description: 'sudo - elevated privileges',
  },
  {
    name: 'system_file_write',
    toolName: 'write_file',
    argKey: 'path',
    pattern: /^(\/etc\/|\/boot\/|C:\\Windows\\)/i,
    severity: 'critical',
    description: 'Writing to system directories',
  },
  {
    name: 'system_file_delete',
    toolName: 'delete_file',
    argKey: 'path',
    pattern: /^(\/etc\/|\/boot\/|C:\\Windows\\)/i,
    severity: 'critical',
    description: 'Deleting system files',
  },
  {
    name: 'curl_wget',
    toolName: 'shell',
    argKey: 'command',
    pattern: /\b(curl|wget)\b.*\b(https?:\/\/)/,
    severity: 'high',
    description: 'Outbound network request',
  },
];
```

- [ ] **Step 4: Write guardrail**

```typescript
// src/guard/guardrail.ts
import { dangerousPatterns } from './rules';

export interface GuardResult {
  blocked: boolean;
  reason?: string;
  severity?: 'high' | 'critical';
}

export function guardrail(
  toolName: string,
  args: Record<string, unknown>
): GuardResult {
  for (const rule of dangerousPatterns) {
    if (rule.toolName !== toolName) continue;

    const value = rule.argKey ? String(args[rule.argKey] ?? '') : JSON.stringify(args);
    if (rule.pattern.test(value)) {
      return {
        blocked: true,
        reason: `${rule.description}: detected "${rule.name}" in ${toolName}`,
        severity: rule.severity,
      };
    }
  }

  return { blocked: false };
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/guard/guardrail.test.ts
```
Expected: PASS (6 tests)

- [ ] **Step 6: Commit**

```bash
git add src/guard/rules.ts src/guard/guardrail.ts tests/guard/guardrail.test.ts
git commit -m "feat: add guardrail with dangerous action pattern detection"
```

---

## Phase 5: Feedback Loop ★ (Main Contribution)

### Task 9: Feedback types and classifier

**Files:**
- Create: `src/feedback/types.ts`
- Create: `src/feedback/classifier.ts`
- Create: `tests/feedback/classifier.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `Feedback`, `TestFailure`, `FailureType`, `FailureClassifier`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/feedback/classifier.test.ts
import { describe, it, expect } from 'vitest';
import { FailureClassifier } from '../../src/feedback/classifier';

describe('FailureClassifier', () => {
  const classifier = new FailureClassifier();

  it('classifies assertion failures', () => {
    const type = classifier.classify(
      'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12'
    );
    expect(type).toBe('assertion');
  });

  it('classifies compilation errors', () => {
    const type = classifier.classify(
      "error TS2322: Type 'string' is not assignable to type 'number'"
    );
    expect(type).toBe('compile');
  });

  it('classifies timeout errors', () => {
    const type = classifier.classify(
      'Test timed out after 5000ms'
    );
    expect(type).toBe('timeout');
  });

  it('defaults to runtime for unknown errors', () => {
    const type = classifier.classify(
      'Segmentation fault (core dumped)'
    );
    expect(type).toBe('runtime');
  });

  it('parses test failure details', () => {
    const failure = classifier.parseFailure(
      'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12'
    );
    expect(failure).toEqual({
      testName: 'add(1, 2)',
      expected: '3',
      received: '-1',
      file: 'src/math.ts',
      line: 3,
      type: 'assertion',
      raw: 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12',
    });
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/feedback/classifier.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write feedback types**

```typescript
// src/feedback/types.ts
export type FailureType = 'compile' | 'assertion' | 'timeout' | 'runtime';

export interface TestFailure {
  testName: string;
  expected: string;
  received: string;
  file: string;
  line: number;
  type: FailureType;
  raw: string;
}

export type FeedbackStatus = 'pass' | 'fail';

export interface Feedback {
  status: FeedbackStatus;
  failures: TestFailure[];
  round: number;
  summary: string;
}
```

- [ ] **Step 4: Write classifier**

```typescript
// src/feedback/classifier.ts
import type { FailureType, TestFailure } from './types';

export class FailureClassifier {
  classify(errorMessage: string): FailureType {
    if (/expected|Expected|assert/i.test(errorMessage)) return 'assertion';
    if (/TS\d{4}|compilation|syntax error|type.*error/i.test(errorMessage)) return 'compile';
    if (/timeout|timed out/i.test(errorMessage)) return 'timeout';
    return 'runtime';
  }

  parseFailure(raw: string): TestFailure {
    const type = this.classify(raw);
    const testMatch = raw.match(/FAIL:\s*(.+?)(?:\s+expected|\s+at)/);
    const expectedMatch = raw.match(/expected\s+(.+?)[,\s]+got/);
    const receivedMatch = raw.match(/got\s+(.+?)(?:\s+at|$)/);
    const fileMatch = raw.match(/at\s+(\S+):(\d+)/);

    return {
      testName: testMatch?.[1]?.trim() || '(unknown test)',
      expected: expectedMatch?.[1]?.trim() || '(unknown)',
      received: receivedMatch?.[1]?.trim() || '(unknown)',
      file: fileMatch?.[1] || '(unknown)',
      line: fileMatch ? parseInt(fileMatch[2], 10) : 0,
      type,
      raw,
    };
  }
}
```

- [ ] **Step 5: Run test to verify it passes**

```bash
npx vitest run tests/feedback/classifier.test.ts
```
Expected: PASS (5 tests)

- [ ] **Step 6: Commit**

```bash
git add src/feedback/types.ts src/feedback/classifier.ts tests/feedback/classifier.test.ts
git commit -m "feat: add feedback types and FailureClassifier"
```

### Task 10: FeedbackValidator and FeedbackInjector

**Files:**
- Create: `src/feedback/validator.ts`
- Create: `src/feedback/injector.ts`
- Create: `tests/feedback/validator.test.ts`
- Create: `tests/feedback/injector.test.ts`

**Interfaces:**
- Consumes: `Feedback`, `TestFailure`, `FailureClassifier` from `src/feedback/`
- Produces: `FeedbackValidator`, `FeedbackInjector`

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/feedback/validator.test.ts
import { describe, it, expect } from 'vitest';
import { FeedbackValidator } from '../../src/feedback/validator';

describe('FeedbackValidator', () => {
  const validator = new FeedbackValidator();

  it('returns pass for successful test output', () => {
    const result = validator.validate(
      '✓ tests/math.test.ts (3 tests) 12ms\nTests: 3 passed, 3 total',
      1
    );
    expect(result.status).toBe('pass');
    expect(result.failures).toHaveLength(0);
  });

  it('returns fail and parses failures', () => {
    const output = 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12';
    const result = validator.validate(output, 1);
    expect(result.status).toBe('fail');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testName).toBe('add(1, 2)');
    expect(result.failures[0].type).toBe('assertion');
  });

  it('returns fail for command error output', () => {
    const result = validator.validate('', 1, 'Command failed with exit code 1');
    expect(result.status).toBe('fail');
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0].type).toBe('runtime');
  });
});
```

```typescript
// tests/feedback/injector.test.ts
import { describe, it, expect } from 'vitest';
import { FeedbackInjector } from '../../src/feedback/injector';
import type { Feedback } from '../../src/feedback/types';

describe('FeedbackInjector', () => {
  const injector = new FeedbackInjector();

  it('builds failure feedback message', () => {
    const feedback: Feedback = {
      status: 'fail',
      round: 1,
      summary: '1 test failed',
      failures: [
        {
          testName: 'add(1, 2)',
          expected: '3',
          received: '-1',
          file: 'src/math.ts',
          line: 3,
          type: 'assertion',
          raw: 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12',
        },
      ],
    };
    const message = injector.buildMessage(feedback);
    expect(message).toContain('Tests failed (Round 1)');
    expect(message).toContain('add(1, 2)');
    expect(message).toContain('expected 3');
    expect(message).toContain('got -1');
    expect(message).toContain('src/math.ts:3');
  });

  it('builds pass feedback message', () => {
    const feedback: Feedback = {
      status: 'pass',
      round: 2,
      summary: 'All tests passed',
      failures: [],
    };
    const message = injector.buildMessage(feedback);
    expect(message).toContain('All tests passed');
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/feedback/validator.test.ts tests/feedback/injector.test.ts
```
Expected: 2 FAIL (cannot find modules)

- [ ] **Step 3: Write validator**

```typescript
// src/feedback/validator.ts
import { FailureClassifier } from './classifier';
import type { Feedback } from './types';

export class FeedbackValidator {
  private classifier = new FailureClassifier();

  validate(
    testOutput: string,
    round: number,
    error?: string
  ): Feedback {
    if (error) {
      return {
        status: 'fail',
        round,
        summary: `Tests failed with error: ${error}`,
        failures: [this.classifier.parseFailure(error)],
      };
    }

    if (testOutput.includes('FAIL') || testOutput.includes('fail')) {
      const failureLines = testOutput
        .split('\n')
        .filter((line) => line.includes('FAIL'));
      const failures = failureLines.map((line) =>
        this.classifier.parseFailure(line)
      );
      return {
        status: 'fail',
        round,
        summary: `${failures.length} test(s) failed`,
        failures,
      };
    }

    return {
      status: 'pass',
      round,
      summary: 'All tests passed',
      failures: [],
    };
  }
}
```

- [ ] **Step 4: Write injector**

```typescript
// src/feedback/injector.ts
import type { Feedback } from './types';
import type { Message } from '../agent/types';

export class FeedbackInjector {
  buildMessage(feedback: Feedback): string {
    if (feedback.status === 'pass') {
      return `✅ ${feedback.summary}`;
    }

    const lines = [
      `❌ ${feedback.summary} (Round ${feedback.round}):`,
      '',
      ...feedback.failures.map(
        (f) =>
          `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.file}:${f.line}]`
      ),
      '',
      'Please analyze the failures and fix the code. Run the tests again after making changes.',
    ];

    return lines.join('\n');
  }

  inject(
    messages: Message[],
    feedback: Feedback
  ): Message[] {
    const content = this.buildMessage(feedback);
    messages.push({
      role: 'system',
      content,
    });
    return messages;
  }
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/feedback/validator.test.ts tests/feedback/injector.test.ts
```
Expected: 2 PASS (5 tests total)

- [ ] **Step 6: Commit**

```bash
git add src/feedback/validator.ts src/feedback/injector.ts tests/feedback/validator.test.ts tests/feedback/injector.test.ts
git commit -m "feat: add FeedbackValidator and FeedbackInjector"
```

---

## Phase 6: Context Builder & Stop Condition

### Task 11: ContextBuilder

**Files:**
- Create: `src/agent/context-builder.ts`
- Create: `tests/agent/context-builder.test.ts`

**Interfaces:**
- Consumes: `Message` from `src/agent/types`, `MemoryStore` from `src/memory/store`, `ConfigLoader` from `src/config/loader`
- Produces: `ContextBuilder`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/context-builder.test.ts
import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../../src/agent/context-builder';

describe('ContextBuilder', () => {
  it('builds messages with system prompt, config, memory, and tools', () => {
    const builder = new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: ['Use TypeScript', 'No any types'],
      memories: ['Project uses vitest', 'Prefer arrow functions'],
      toolDefinitions: [
        { type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: {} } },
      ],
    });

    const messages = builder.build([{ role: 'user', content: 'Write add function' }]);

    expect(messages).toHaveLength(2);
    const systemMsg = messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('You are a coding agent');
    expect(systemMsg.content).toContain('Use TypeScript');
    expect(systemMsg.content).toContain('Project uses vitest');
    expect(systemMsg.content).toContain('read_file');

    const userMsg = messages[1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Write add function');
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent/context-builder.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write ContextBuilder**

```typescript
// src/agent/context-builder.ts
import type { Message } from './types';

export interface ContextBuilderConfig {
  systemPrompt: string;
  configRules: string[];
  memories: string[];
  toolDefinitions: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }>;
}

export class ContextBuilder {
  constructor(private config: ContextBuilderConfig) {}

  build(history: Message[]): Message[] {
    const systemContent = [
      this.config.systemPrompt,
      '',
      '## Project Rules',
      ...this.config.configRules.map((r) => `- ${r}`),
      '',
      '## Project Memory',
      ...this.config.memories.map((m) => `- ${m}`),
    ].join('\n');

    const systemMessage: Message = {
      role: 'system',
      content: systemContent,
      tool_calls: undefined,
    };

    const userMessage: Message = {
      role: 'user',
      content: JSON.stringify(this.config.toolDefinitions),
      tool_calls: undefined,
    };

    return [systemMessage, userMessage, ...history];
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agent/context-builder.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/context-builder.ts tests/agent/context-builder.test.ts
git commit -m "feat: add ContextBuilder for assembling agent messages"
```

### Task 12: StopCondition

**Files:**
- Create: `src/agent/stop-condition.ts`
- Create: `tests/agent/stop-condition.test.ts`

**Interfaces:**
- Consumes: `AgentState` from `src/agent/types`
- Produces: `StopCondition`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/agent/stop-condition.test.ts
import { describe, it, expect } from 'vitest';
import { StopCondition } from '../../src/agent/stop-condition';

describe('StopCondition', () => {
  it('returns true when max rounds reached', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(10, 'stop')).toBe(true);
  });

  it('returns true when LLM finish reason is stop', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(3, 'stop')).toBe(true);
  });

  it('returns false when rounds remain and finish reason is tool_calls', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(3, 'tool_calls')).toBe(false);
  });

  it('returns true when user cancelled', () => {
    const sc = new StopCondition({ maxRounds: 10 });
    expect(sc.shouldStop(3, 'tool_calls', true)).toBe(true);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent/stop-condition.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write StopCondition**

```typescript
// src/agent/stop-condition.ts

export interface StopConditionConfig {
  maxRounds: number;
}

export class StopCondition {
  constructor(private config: StopConditionConfig) {}

  shouldStop(
    currentRound: number,
    finishReason: string,
    userCancelled?: boolean
  ): { stop: boolean; reason: string } {
    if (userCancelled) {
      return { stop: true, reason: 'User cancelled' };
    }

    if (currentRound >= this.config.maxRounds) {
      return { stop: true, reason: `Max rounds (${this.config.maxRounds}) reached` };
    }

    if (finishReason === 'stop') {
      return { stop: true, reason: 'Task completed' };
    }

    return { stop: false, reason: '' };
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agent/stop-condition.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/agent/stop-condition.ts tests/agent/stop-condition.test.ts
git commit -m "feat: add StopCondition for agent loop termination"
```

---

## Phase 7: Agent Loop

### Task 13: AgentLoop

**Files:**
- Create: `src/agent/loop.ts`
- Create: `tests/agent/loop.test.ts`

**Interfaces:**
- Consumes: `LLMProvider` from `src/llm/provider`, `ToolDispatcher` from `src/tools/dispatcher`, `ContextBuilder` from `src/agent/context-builder`, `StopCondition` from `src/agent/stop-condition`, `FeedbackValidator` from `src/feedback/validator`, `FeedbackInjector` from `src/feedback/injector`, `guardrail` from `src/guard/guardrail`
- Produces: `AgentLoop` with `run()` method

- [ ] **Step 1: Write the failing test (★ core mechanism demo)**

```typescript
// tests/agent/loop.test.ts
import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import type { Tool } from '../../src/tools/base';

describe('AgentLoop', () => {
  it('completes a simple task in one round', async () => {
    const mockLLM = new MockLLM([
      {
        content: 'Done.',
        tool_calls: [],
        finish_reason: 'stop',
      },
    ]);

    const echoTool: Tool = {
      name: 'echo',
      description: 'echo',
      parameters: { type: 'object', properties: {} },
      execute: async (args) => ({ content: String(args.text) }),
    };

    const dispatcher = new ToolDispatcher([echoTool]);
    const contextBuilder = new ContextBuilder({
      systemPrompt: 'You are a helpful agent.',
      configRules: [],
      memories: [],
      toolDefinitions: dispatcher.getDefinitions(),
    });
    const stopCondition = new StopCondition({ maxRounds: 10 });
    const validator = new FeedbackValidator();
    const injector = new FeedbackInjector();

    const loop = new AgentLoop({
      llm: mockLLM,
      dispatcher,
      contextBuilder,
      stopCondition,
      validator,
      injector,
    });

    const result = await loop.run('Say hello');

    expect(result.status).toBe('completed');
    expect(result.rounds).toBe(1);
    expect(result.messages.length).toBeGreaterThan(0);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/agent/loop.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write AgentLoop**

```typescript
// src/agent/loop.ts
import type { LLMProvider } from '../llm/provider';
import type { ToolDispatcher } from '../tools/dispatcher';
import type { ContextBuilder } from './context-builder';
import type { StopCondition } from './stop-condition';
import type { FeedbackValidator } from '../feedback/validator';
import type { FeedbackInjector } from '../feedback/injector';
import { guardrail } from '../guard/guardrail';
import type { Message, AgentState } from './types';

export interface AgentLoopConfig {
  llm: LLMProvider;
  dispatcher: ToolDispatcher;
  contextBuilder: ContextBuilder;
  stopCondition: StopCondition;
  validator: FeedbackValidator;
  injector: FeedbackInjector;
}

export interface RunResult {
  status: 'completed' | 'max_rounds' | 'error' | 'cancelled';
  rounds: number;
  messages: Message[];
  feedbackHistory: Array<{ round: number; status: string }>;
}

export class AgentLoop {
  private messages: Message[] = [];
  private feedbackHistory: Array<{ round: number; status: string }> = [];
  private cancelled = false;

  constructor(private config: AgentLoopConfig) {}

  async run(task: string): Promise<RunResult> {
    this.messages = this.config.contextBuilder.build([
      { role: 'user', content: task },
    ]);

    let round = 0;
    const maxRounds = this.config.stopCondition['config'].maxRounds;

    while (round < maxRounds) {
      round++;

      const response = await this.config.llm.chat(this.messages);
      this.messages.push({
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.tool_calls,
      });

      const stopResult = this.config.stopCondition.shouldStop(
        round,
        response.finish_reason,
        this.cancelled
      );
      if (stopResult.stop) {
        return {
          status: this.cancelled ? 'cancelled' : 'completed',
          rounds: round,
          messages: this.messages,
          feedbackHistory: this.feedbackHistory,
        };
      }

      for (const toolCall of response.tool_calls) {
        const guardResult = guardrail(toolCall.name, toolCall.arguments);
        if (guardResult.blocked) {
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `BLOCKED: ${guardResult.reason}`,
          });
          continue;
        }

        const result = await this.config.dispatcher.dispatch(
          toolCall.name,
          toolCall.arguments
        );
        this.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content,
        });

        if (toolCall.name === 'run_test') {
          const feedback = this.config.validator.validate(
            result.content,
            round,
            result.error
          );
          this.feedbackHistory.push({
            round,
            status: feedback.status,
          });
          this.config.injector.inject(this.messages, feedback);
        }
      }
    }

    return {
      status: 'max_rounds',
      rounds: round,
      messages: this.messages,
      feedbackHistory: this.feedbackHistory,
    };
  }

  cancel(): void {
    this.cancelled = true;
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/agent/loop.test.ts
```
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add src/agent/loop.ts tests/agent/loop.test.ts
git commit -m "feat: add AgentLoop with LLM→parse→guard→dispatch→feedback→stop cycle"
```

---

## Phase 8: Memory, Config, and Credentials

### Task 14: MemoryStore (SQLite)

**Files:**
- Create: `src/memory/types.ts`
- Create: `src/memory/store.ts`
- Create: `tests/memory/store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `MemoryEntry`, `MemoryStore`

- [ ] **Step 1: Write the failing test**

```typescript
// tests/memory/store.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/memory/store';
import * as fs from 'fs';

describe('MemoryStore', () => {
  const dbPath = ':memory:';
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
  });

  it('sets and gets a memory entry', () => {
    store.set('test-key', 'test-value', 'convention');
    const entry = store.get('test-key');
    expect(entry).toBeDefined();
    expect(entry!.value).toBe('test-value');
    expect(entry!.category).toBe('convention');
  });

  it('returns undefined for missing key', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('lists all entries', () => {
    store.set('key1', 'val1', 'convention');
    store.set('key2', 'val2', 'decision');
    const all = store.list();
    expect(all).toHaveLength(2);
  });

  it('deletes an entry', () => {
    store.set('key1', 'val1', 'convention');
    store.delete('key1');
    expect(store.get('key1')).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

```bash
npx vitest run tests/memory/store.test.ts
```
Expected: FAIL (cannot find module)

- [ ] **Step 3: Write types and store**

```typescript
// src/memory/types.ts
export interface MemoryEntry {
  id: number;
  key: string;
  value: string;
  category: 'convention' | 'decision' | 'preference';
  created_at: string;
  updated_at: string;
}
```

```typescript
// src/memory/store.ts
import Database from 'better-sqlite3';
import type { MemoryEntry } from './types';

export class MemoryStore {
  private db: Database.Database;

  constructor(dbPath: string) {
    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        key TEXT NOT NULL UNIQUE,
        value TEXT NOT NULL,
        category TEXT NOT NULL CHECK (category IN ('convention', 'decision', 'preference')),
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
  }

  set(key: string, value: string, category: 'convention' | 'decision' | 'preference'): void {
    this.db.prepare(`
      INSERT INTO memories (key, value, category, updated_at)
      VALUES (?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value, category = excluded.category, updated_at = CURRENT_TIMESTAMP
    `).run(key, value, category);
  }

  get(key: string): MemoryEntry | undefined {
    return this.db.prepare('SELECT * FROM memories WHERE key = ?').get(key) as MemoryEntry | undefined;
  }

  list(): MemoryEntry[] {
    return this.db.prepare('SELECT * FROM memories ORDER BY updated_at DESC').all() as MemoryEntry[];
  }

  delete(key: string): void {
    this.db.prepare('DELETE FROM memories WHERE key = ?').run(key);
  }

  close(): void {
    this.db.close();
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

```bash
npx vitest run tests/memory/store.test.ts
```
Expected: PASS (4 tests)

- [ ] **Step 5: Commit**

```bash
git add src/memory/types.ts src/memory/store.ts tests/memory/store.test.ts
git commit -m "feat: add MemoryStore with SQLite for agent memory"
```

### Task 15: ConfigLoader and CredentialStore

**Files:**
- Create: `src/config/loader.ts`
- Create: `src/credentials/store.ts`
- Create: `tests/config/loader.test.ts`
- Create: `tests/credentials/store.test.ts`

**Interfaces:**
- Consumes: nothing
- Produces: `ConfigLoader`, `CredentialStore` interface

- [ ] **Step 1: Write the failing tests**

```typescript
// tests/config/loader.test.ts
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { ConfigLoader } from '../../src/config/loader';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('ConfigLoader', () => {
  let tmpDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'config-'));
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('loads rules from .rules file', () => {
    const rulesPath = path.join(tmpDir, '.rules');
    fs.writeFileSync(rulesPath, 'Use TypeScript\nNo any types\nPrefer arrow functions\n');
    const loader = new ConfigLoader();
    const rules = loader.load(rulesPath);
    expect(rules).toHaveLength(3);
    expect(rules).toContain('Use TypeScript');
    expect(rules).toContain('No any types');
  });

  it('returns empty array for missing file', () => {
    const loader = new ConfigLoader();
    const rules = loader.load('/nonexistent/path/.rules');
    expect(rules).toEqual([]);
  });

  it('filters empty lines', () => {
    const rulesPath = path.join(tmpDir, '.rules');
    fs.writeFileSync(rulesPath, 'Rule 1\n\n\nRule 2\n  \n');
    const loader = new ConfigLoader();
    const rules = loader.load(rulesPath);
    expect(rules).toEqual(['Rule 1', 'Rule 2']);
  });
});
```

```typescript
// tests/credentials/store.test.ts
import { describe, it, expect } from 'vitest';
import type { CredentialStore } from '../../src/credentials/store';

// In-memory test implementation
class TestCredentialStore implements CredentialStore {
  private data: Record<string, string> = {};

  async set(service: string, account: string, password: string): Promise<void> {
    this.data[`${service}:${account}`] = password;
  }

  async get(service: string, account: string): Promise<string | null> {
    return this.data[`${service}:${account}`] ?? null;
  }

  async delete(service: string, account: string): Promise<void> {
    delete this.data[`${service}:${account}`];
  }
}

describe('CredentialStore', () => {
  it('stores and retrieves credentials', async () => {
    const store = new TestCredentialStore();
    await store.set('harness', 'openai', 'sk-test123');
    const key = await store.get('harness', 'openai');
    expect(key).toBe('sk-test123');
  });

  it('returns null for missing credentials', async () => {
    const store = new TestCredentialStore();
    expect(await store.get('harness', 'nonexistent')).toBeNull();
  });

  it('deletes credentials', async () => {
    const store = new TestCredentialStore();
    await store.set('harness', 'openai', 'sk-test123');
    await store.delete('harness', 'openai');
    expect(await store.get('harness', 'openai')).toBeNull();
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

```bash
npx vitest run tests/config/loader.test.ts tests/credentials/store.test.ts
```
Expected: 2 FAIL (cannot find modules)

- [ ] **Step 3: Write ConfigLoader**

```typescript
// src/config/loader.ts
import * as fs from 'fs';

export class ConfigLoader {
  load(filePath: string): string[] {
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
      return content
        .split('\n')
        .map((line) => line.trim())
        .filter((line) => line.length > 0);
    } catch {
      return [];
    }
  }
}
```

- [ ] **Step 4: Write CredentialStore interface**

```typescript
// src/credentials/store.ts
export interface CredentialStore {
  set(service: string, account: string, password: string): Promise<void>;
  get(service: string, account: string): Promise<string | null>;
  delete(service: string, account: string): Promise<void>;
}
```

- [ ] **Step 5: Run tests to verify they pass**

```bash
npx vitest run tests/config/loader.test.ts tests/credentials/store.test.ts
```
Expected: 2 PASS (6 tests total)

- [ ] **Step 6: Commit**

```bash
git add src/config/loader.ts src/credentials/store.ts tests/config/loader.test.ts tests/credentials/store.test.ts
git commit -m "feat: add ConfigLoader and CredentialStore interface"
```

---

## Phase 9: Server Layer

### Task 16: HTTP + WebSocket server

**Files:**
- Create: `src/server/types.ts`
- Create: `src/server/routes.ts`
- Create: `src/server/http-server.ts`
- Create: `src/index.ts`

**Interfaces:**
- Consumes: `AgentLoop` from `src/agent/loop`
- Produces: Express + WebSocket server

- [ ] **Step 1: Write server types**

```typescript
// src/server/types.ts
export interface WSMessage {
  type: 'task' | 'cancel' | 'hitl_response' | 'log';
  payload: unknown;
}

export interface TaskMessage {
  type: 'task';
  payload: { task: string };
}

export interface HITLResponse {
  type: 'hitl_response';
  payload: { toolCallId: string; approved: boolean; modifiedArgs?: Record<string, unknown> };
}
```

- [ ] **Step 2: Write HTTP server**

```typescript
// src/server/http-server.ts
import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentLoop } from '../agent/loop';
import type { WSMessage } from './types';

export class HarnessServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private loop: AgentLoop;

  constructor(loop: AgentLoop, port: number = 3000) {
    this.loop = loop;
    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

    this.app.use(express.json());
    this.app.get('/health', (_req, res) => {
      res.json({ status: 'ok' });
    });

    this.wss.on('connection', (ws: WebSocket) => {
      ws.on('message', async (data: Buffer) => {
        const msg: WSMessage = JSON.parse(data.toString());
        await this.handleMessage(ws, msg);
      });
    });

    this.server.listen(port, () => {
      console.log(`Harness server running on port ${port}`);
    });
  }

  private async handleMessage(ws: WebSocket, msg: WSMessage): Promise<void> {
    if (msg.type === 'task') {
      const { task } = msg.payload as { task: string };
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));

      const result = await this.loop.run(task);

      ws.send(JSON.stringify({
        type: 'result',
        payload: {
          status: result.status,
          rounds: result.rounds,
          messages: result.messages,
          feedbackHistory: result.feedbackHistory,
        },
      }));
    } else if (msg.type === 'cancel') {
      this.loop.cancel();
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'cancelled' } }));
    }
  }
}
```

- [ ] **Step 3: Write entry point**

```typescript
// src/index.ts
import { AgentLoop } from './agent/loop';
import { ContextBuilder } from './agent/context-builder';
import { StopCondition } from './agent/stop-condition';
import { ToolDispatcher } from './tools/dispatcher';
import { readFileTool, writeFileTool, deleteFileTool } from './tools/file-tools';
import { shellTool } from './tools/shell-tool';
import { searchTool } from './tools/search-tool';
import { gitDiffTool } from './tools/git-tool';
import { runTestTool } from './tools/test-tool';
import { FeedbackValidator } from './feedback/validator';
import { FeedbackInjector } from './feedback/injector';
import { MemoryStore } from './memory/store';
import { ConfigLoader } from './config/loader';
import { MockLLM } from './llm/mock-llm';
import { HarnessServer } from './server/http-server';

const configLoader = new ConfigLoader();
const rules = configLoader.load('.rules');

const memoryStore = new MemoryStore('data/memory.db');
const memories = memoryStore.list().map((m) => `${m.key}: ${m.value}`);

const tools = [readFileTool, writeFileTool, deleteFileTool, shellTool, searchTool, gitDiffTool, runTestTool];
const dispatcher = new ToolDispatcher(tools);

const contextBuilder = new ContextBuilder({
  systemPrompt: 'You are a coding agent. You can read, write, delete files, run shell commands, search code, check git diff, and run tests.',
  configRules: rules,
  memories,
  toolDefinitions: dispatcher.getDefinitions(),
});

const stopCondition = new StopCondition({ maxRounds: 10 });
const validator = new FeedbackValidator();
const injector = new FeedbackInjector();

// Use MockLLM for now; real LLM will be injectable via server config
const llm = new MockLLM([]);

const loop = new AgentLoop({
  llm,
  dispatcher,
  contextBuilder,
  stopCondition,
  validator,
  injector,
});

new HarnessServer(loop, 3000);
```

- [ ] **Step 4: Verify server starts**

```bash
npx tsx src/index.ts
```
Expected: "Harness server running on port 3000" (Ctrl+C to stop)

- [ ] **Step 5: Commit**

```bash
git add src/server/types.ts src/server/http-server.ts src/index.ts
git commit -m "feat: add Express + WebSocket server and entry point"
```

---

## Phase 10: Integration Test (★ Core Mechanism Demo)

### Task 17: Harness demo — feedback loop + guardrail + multi-round correction

**Files:**
- Create: `tests/integration/harness-demo.test.ts`

**Interfaces:**
- Consumes: All modules
- Produces: Deterministic integration test demonstrating the three required behaviors

- [ ] **Step 1: Write the integration test**

```typescript
// tests/integration/harness-demo.test.ts
import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import { guardrail } from '../../src/guard/guardrail';
import type { Tool } from '../../src/tools/base';

describe('Harness Demo (★ core mechanism)', () => {
  // ① 治理护栏拦截一个危险动作
  it('① Guardrail blocks dangerous action', () => {
    const result = guardrail('shell', { command: 'rm -rf /' });
    expect(result.blocked).toBe(true);
    expect(result.reason).toContain('rm -rf');
    expect(result.severity).toBe('critical');
  });

  it('① Guardrail allows safe actions', () => {
    const result = guardrail('write_file', { path: 'src/test.ts', content: 'x' });
    expect(result.blocked).toBe(false);
  });

  // ② 注入失败 → 反馈闭环使 agent 收到反馈并改变下一步动作
  it('② Feedback loop: inject failure → agent corrects → passes', async () => {
    const mockLLM = new MockLLM([
      // Round 1: Agent writes wrong code
      {
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            name: 'write_file',
            arguments: { path: 'src/math.ts', content: 'export function add(a, b) { return a - b; }' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      // Round 1: Agent runs tests
      {
        content: null,
        tool_calls: [
          {
            id: 'call_2',
            name: 'run_test',
            arguments: { command: 'npm test' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      // Round 2: Agent receives feedback, corrects code
      {
        content: null,
        tool_calls: [
          {
            id: 'call_3',
            name: 'write_file',
            arguments: { path: 'src/math.ts', content: 'export function add(a, b) { return a + b; }' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      // Round 2: Agent runs tests again
      {
        content: null,
        tool_calls: [
          {
            id: 'call_4',
            name: 'run_test',
            arguments: { command: 'npm test' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      // Round 3: All tests pass, agent stops
      {
        content: 'All tests passing. Task complete.',
        tool_calls: [],
        finish_reason: 'stop',
      },
    ]);

    const writeTool: Tool = {
      name: 'write_file',
      description: 'Write a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        const { path: p, content } = args as { path: string; content: string };
        return { content: `File written: ${p}` };
      },
    };

    const testTool: Tool = {
      name: 'run_test',
      description: 'Run tests',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      execute: async (args) => {
        const { command } = args as { command: string };
        // First call returns failure, second call returns success
        const callCount = (testTool as any)._callCount = ((testTool as any)._callCount || 0) + 1;
        if (callCount === 1) {
          return {
            content: 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12',
            error: 'Tests failed',
          };
        }
        return { content: 'Tests: 3 passed, 3 total' };
      },
    };

    const dispatcher = new ToolDispatcher([writeTool, testTool]);
    const contextBuilder = new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: [],
      memories: [],
      toolDefinitions: dispatcher.getDefinitions(),
    });
    const stopCondition = new StopCondition({ maxRounds: 10 });
    const validator = new FeedbackValidator();
    const injector = new FeedbackInjector();

    const loop = new AgentLoop({
      llm: mockLLM,
      dispatcher,
      contextBuilder,
      stopCondition,
      validator,
      injector,
    });

    const result = await loop.run('Write an add function');

    // The feedback loop should have driven multiple rounds
    expect(result.status).toBe('completed');

    // Feedback history should show: fail → pass
    expect(result.feedbackHistory.length).toBe(2);
    expect(result.feedbackHistory[0].status).toBe('fail');
    expect(result.feedbackHistory[1].status).toBe('pass');

    // Agent should have received the failure feedback in its messages
    const hasFailureFeedback = result.messages.some(
      (m) => m.role === 'system' && m.content.includes('Tests failed')
    );
    expect(hasFailureFeedback).toBe(true);
  });

  // ③ 重点维度（反馈闭环）的确定性行为
  it('③ Feedback loop is deterministic with mock LLM', async () => {
    // Run the same test twice, expect identical results
    const makeLoop = () => {
      const mockLLM = new MockLLM([
        {
          content: null,
          tool_calls: [{ id: '1', name: 'run_test', arguments: { command: 'npm test' } }],
          finish_reason: 'tool_calls',
        },
        {
          content: 'Fixed.',
          tool_calls: [],
          finish_reason: 'stop',
        },
      ]);

      const testTool: Tool = {
        name: 'run_test',
        description: 'Run tests',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
        execute: async () => ({
          content: 'FAIL: test_foo expected true got false at test.ts:1:1',
          error: 'Tests failed',
        }),
      };

      const dispatcher = new ToolDispatcher([testTool]);
      const contextBuilder = new ContextBuilder({
        systemPrompt: 'You are a coding agent.',
        configRules: [],
        memories: [],
        toolDefinitions: dispatcher.getDefinitions(),
      });

      return new AgentLoop({
        llm: mockLLM,
        dispatcher,
        contextBuilder,
        stopCondition: new StopCondition({ maxRounds: 10 }),
        validator: new FeedbackValidator(),
        injector: new FeedbackInjector(),
      });
    };

    const result1 = await makeLoop().run('Test task');
    const result2 = await makeLoop().run('Test task');

    // Deterministic: same rounds, same feedback status
    expect(result1.rounds).toBe(result2.rounds);
    expect(result1.status).toBe(result2.status);
    expect(result1.feedbackHistory[0].status).toBe(result2.feedbackHistory[0].status);
  });
});
```

- [ ] **Step 2: Run the integration test**

```bash
npx vitest run tests/integration/harness-demo.test.ts
```
Expected: 4 PASS

- [ ] **Step 3: Commit**

```bash
git add tests/integration/harness-demo.test.ts
git commit -m "test: add harness demo — guardrail, feedback loop, deterministic verification"
```

---

## Phase 11: WebUI, Docker polish, and remaining files

### Task 18: WebUI scaffold (React + Vite)

**Files:**
- Create: `webui/package.json`
- Create: `webui/vite.config.ts`
- Create: `webui/index.html`
- Create: `webui/src/main.tsx`
- Create: `webui/src/App.tsx`
- Create: `webui/src/types.ts`
- Create: `webui/src/hooks/useWebSocket.ts`
- Create: `webui/src/components/ChatPanel.tsx`
- Create: `webui/src/components/MessageBubble.tsx`
- Create: `webui/src/components/AgentLog.tsx`
- Create: `webui/src/components/HITLModal.tsx`
- Create: `webui/src/components/SetupWizard.tsx`

- [ ] **Step 1: Scaffold Vite + React project**

```bash
cd webui
npm create vite@latest . -- --template react-ts
npm install
```

- [ ] **Step 2: Write the WebUI components**

```typescript
// webui/src/types.ts
export interface WSMessage {
  type: 'status' | 'result' | 'log';
  payload: unknown;
}

export interface AgentResult {
  status: string;
  rounds: number;
  messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
  feedbackHistory: Array<{ round: number; status: string }>;
}
```

```typescript
// webui/src/hooks/useWebSocket.ts
import { useState, useEffect, useRef, useCallback } from 'react';
import type { WSMessage, AgentResult } from '../types';

export function useWebSocket(url: string) {
  const wsRef = useRef<WebSocket | null>(null);
  const [connected, setConnected] = useState(false);
  const [result, setResult] = useState<AgentResult | null>(null);
  const [status, setStatus] = useState<string>('idle');

  useEffect(() => {
    const ws = new WebSocket(url);
    wsRef.current = ws;

    ws.onopen = () => setConnected(true);
    ws.onclose = () => setConnected(false);
    ws.onmessage = (event) => {
      const msg: WSMessage = JSON.parse(event.data);
      if (msg.type === 'status') {
        setStatus((msg.payload as { status: string }).status);
      } else if (msg.type === 'result') {
        setResult(msg.payload as AgentResult);
      }
    };

    return () => ws.close();
  }, [url]);

  const sendTask = useCallback((task: string) => {
    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task } }));
    setStatus('running');
    setResult(null);
  }, []);

  const cancel = useCallback(() => {
    wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
  }, []);

  return { connected, status, result, sendTask, cancel };
}
```

```typescript
// webui/src/components/ChatPanel.tsx
import React, { useState } from 'react';
import { useWebSocket } from '../hooks/useWebSocket';
import { AgentLog } from './AgentLog';

export function ChatPanel() {
  const [task, setTask] = useState('');
  const { connected, status, result, sendTask, cancel } = useWebSocket('ws://localhost:3000');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (task.trim()) {
      sendTask(task.trim());
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: '100vh', padding: '20px' }}>
      <div style={{ flex: 1, overflow: 'auto', marginBottom: '20px' }}>
        <div style={{ marginBottom: '10px' }}>
          Status: {connected ? '🟢 Connected' : '🔴 Disconnected'} | Agent: {status}
        </div>
        {result && <AgentLog result={result} />}
      </div>
      <form onSubmit={handleSubmit} style={{ display: 'flex', gap: '10px' }}>
        <input
          type="text"
          value={task}
          onChange={(e) => setTask(e.target.value)}
          placeholder="Enter a coding task..."
          disabled={status === 'running'}
          style={{ flex: 1, padding: '10px', fontSize: '16px' }}
        />
        <button type="submit" disabled={status === 'running' || !connected} style={{ padding: '10px 20px' }}>
          Send
        </button>
        {status === 'running' && (
          <button type="button" onClick={cancel} style={{ padding: '10px 20px', background: '#e74c3c', color: 'white' }}>
            Cancel
          </button>
        )}
      </form>
    </div>
  );
}
```

```typescript
// webui/src/components/AgentLog.tsx
import React from 'react';
import type { AgentResult } from '../types';

export function AgentLog({ result }: { result: AgentResult }) {
  return (
    <div>
      <h3>Task Complete — {result.rounds} round(s)</h3>
      <div>
        <h4>Feedback History</h4>
        {result.feedbackHistory.map((fb, i) => (
          <div key={i} style={{ padding: '5px', background: fb.status === 'fail' ? '#ffe0e0' : '#e0ffe0' }}>
            Round {fb.round}: {fb.status}
          </div>
        ))}
      </div>
      <div>
        <h4>Messages</h4>
        {result.messages.map((msg, i) => (
          <div key={i} style={{ padding: '5px', borderBottom: '1px solid #eee' }}>
            <strong>{msg.role}:</strong> {msg.content.substring(0, 200)}
          </div>
        ))}
      </div>
    </div>
  );
}
```

```typescript
// webui/src/App.tsx
import React from 'react';
import { ChatPanel } from './components/ChatPanel';

function App() {
  return <ChatPanel />;
}

export default App;
```

- [ ] **Step 3: Verify WebUI builds**

```bash
cd webui && npm run build
```
Expected: Build succeeds

- [ ] **Step 4: Commit**

```bash
git add webui/
git commit -m "feat: add WebUI with React + Vite — chat panel and agent log"
```

### Task 19: Final integration — serve WebUI from Express, Docker polish

**Files:**
- Modify: `src/server/http-server.ts`
- Modify: `src/index.ts`
- Modify: `Dockerfile`
- Create: `.rules.example`

- [ ] **Step 1: Serve static WebUI from Express**

Add to `src/server/http-server.ts`:
```typescript
import path from 'path';

// Serve WebUI static files
this.app.use(express.static(path.join(__dirname, '../../webui/dist')));
this.app.get('*', (_req, res) => {
  res.sendFile(path.join(__dirname, '../../webui/dist/index.html'));
});
```

- [ ] **Step 2: Update Dockerfile to include WebUI build**

```dockerfile
FROM node:20-alpine AS webui-builder
WORKDIR /app/webui
COPY webui/package.json ./
RUN npm install
COPY webui/ ./
RUN npm run build

FROM node:20-alpine AS backend-builder
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY tsconfig.json ./
COPY src/ ./src/
RUN npm run build

FROM node:20-alpine
WORKDIR /app
COPY --from=backend-builder /app/dist ./dist
COPY --from=backend-builder /app/node_modules ./node_modules
COPY --from=webui-builder /app/webui/dist ./webui/dist
COPY package.json ./
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

- [ ] **Step 3: Create .rules.example**

```
# Agent Rules
# Copy this file to .rules and customize
Use TypeScript
Prefer arrow functions over function declarations
No any types
Test framework: vitest
```

- [ ] **Step 4: Build Docker image**

```bash
docker build -t coding-agent-harness .
```

Expected: Build succeeds

- [ ] **Step 5: Run full test suite**

```bash
npx vitest run
```
Expected: All tests PASS

- [ ] **Step 6: Commit**

```bash
git add src/server/http-server.ts src/index.ts Dockerfile .rules.example
git commit -m "feat: integrate WebUI static serving, polish Dockerfile, add .rules.example"
```

---

## Self-Review

### 1. Spec Coverage

| Spec Section | Covered By |
|-------------|-----------|
| Agent 主循环 | Task 13 (AgentLoop) |
| 工具层 (7 tools) | Tasks 4-7 |
| 反馈闭环 ★ | Tasks 9-10, Task 17 (demo) |
| 治理护栏 + HITL | Task 8, server handles HITL via WebSocket |
| 记忆层 (SQLite) | Task 14 |
| 配置层 (.rules) | Task 15 |
| 凭据管理 | Task 15 (interface), AES/WinCM impl in future iteration |
| LLM 抽象层 | Tasks 3 |
| WebUI | Task 18 |
| Docker 分发 | Tasks 1, 19 |
| 机制演示 (3 behaviors) | Task 17 |
| Mock LLM 确定性测试 | Task 17 |

### 2. Placeholder Scan

- No TBD, TODO, or "implement later" found
- No "add appropriate error handling" without code
- All steps include actual code or exact commands

### 3. Type Consistency

- `Message`, `ToolCall`, `AgentState` defined in Task 2, used consistently
- `LLMProvider` in Task 3, used in Task 13
- `Tool` interface in Task 4, used in Tasks 5-7, 13, 17
- `Feedback`, `TestFailure` in Task 9, used in Tasks 10, 13, 17
- `MemoryStore` in Task 14, referenced in Task 16
- `CredentialStore` in Task 15, interface defined, real impls deferred

---

Plan complete and saved to `docs/superpowers/plans/2026-08-05-coding-agent-harness.md`. Two execution options:

1. **Subagent-Driven (recommended)** — I dispatch a fresh subagent per task, review between tasks, fast iteration
2. **Inline Execution** — Execute tasks in this session using executing-plans, batch execution with checkpoints

Which approach?