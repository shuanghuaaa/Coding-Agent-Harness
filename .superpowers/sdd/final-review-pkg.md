MERGE_BASE (feature start) 91c678c0f6635bad7d692ab77705ea363d9f9115
HEAD 9b197ac2dac723ec1d0ded547d1388cdc78b5bd1
## Commits
9b197ac fix(webui): clear result when switching sessions
8797f84 feat(webui): file viewer, session resume, live multi-agent page
126ba41 feat(webui): APIs and WS for file read, resume, orchestrate
f307f9f feat(server): session resume and orchestrate WebSocket protocol
992efac fix(orchestration): fail on loop errors and test cancel
2271966 feat(orchestration): coder-reviewer-tester orchestrator with retries
0e7d565 feat(orchestration): stage artifacts and gate decisions
70158ba feat(orchestration): role registry with tool allowlists
4bd846b fix(agent): reset cancelled flag at start of each run
8596f4d feat(agent): resume runs with priorMessages
0e5ece5 feat(sessions): support update for resume writes
6fda8ae fix(workspace): map directory reads to 400 and test size/binary gates
ce0bd01 feat(workspace): add safe read-file API for WebUI

## Stat
 .superpowers/sdd/task-6-report.md        |  14 +
 .superpowers/sdd/task-9-report.md        |  23 +
 src/agent/loop.ts                        |  15 +-
 src/orchestration/artifacts.ts           | 139 ++++++
 src/orchestration/orchestrator.ts        | 178 ++++++++
 src/orchestration/roles.ts               |  52 +++
 src/server/http-server.ts                | 347 +++++++++++++--
 src/server/session-store.ts              |   7 +
 src/server/types.ts                      |  19 +-
 src/tools/dispatcher.ts                  |   6 +-
 src/tools/file-tools.ts                  |  10 +-
 src/workspace/read-file.ts               |  26 ++
 tests/agent/loop-resume.test.ts          |  54 +++
 tests/agent/loop.test.ts                 |   6 +-
 tests/orchestration/artifacts.test.ts    |  94 ++++
 tests/orchestration/orchestrator.test.ts | 141 ++++++
 tests/orchestration/roles.test.ts        |  34 ++
 tests/server/session-store.test.ts       |  24 +
 tests/tools/dispatcher.test.ts           |  19 +
 tests/workspace/read-file.test.ts        |  40 ++
 webui/src/App.tsx                        | 732 +++++++++++++++++++++----------
 webui/src/api/workspace.ts               |  19 +
 webui/src/hooks/useWebSocket.ts          |  82 +++-
 webui/src/styles.css                     | 632 +++++++++++++++++++++++++-
 webui/src/types.ts                       |  36 +-
 25 files changed, 2481 insertions(+), 268 deletions(-)

## Diff (core)
diff --git a/src/agent/loop.ts b/src/agent/loop.ts
index 0e5ad89..cc3dfde 100644
--- a/src/agent/loop.ts
+++ b/src/agent/loop.ts
@@ -28,6 +28,12 @@ export interface RoundProgress {
   assistantContent: string;
   actions: Array<{ tool: string; result: string }>;
   feedbackStatus?: string;
+  agentRole?: string;
+}
+
+export interface RunOptions {
+  priorMessages?: Message[];
+  agentRole?: string;
 }
 
 export type ProgressCallback = (event: RoundProgress) => void;
@@ -55,6 +61,7 @@ export class AgentLoop {
   private messages: Message[] = [];
   private feedbackHistory: Array<{ round: number; status: string }> = [];
   private cancelled = false;
+  private currentAgentRole?: string;
   private feedbackToolNames: string[];
 
   /** Exposed for HITL-aware server to rebuild with a hitlCallback */
@@ -65,8 +72,13 @@ export class AgentLoop {
     this.feedbackToolNames = config.feedbackToolNames ?? ['run_test'];
   }
 
-  async run(task: string): Promise<RunResult> {
+  async run(task: string, options?: RunOptions): Promise<RunResult> {
+    this.cancelled = false;
+    this.feedbackHistory = [];
+    this.currentAgentRole = options?.agentRole;
+    const prior = (options?.priorMessages ?? []).filter((m) => m.role !== 'system');
     this.messages = this.config.contextBuilder.build([
+      ...prior,
       { role: 'user', content: task },
     ]);
 
@@ -189,6 +201,7 @@ export class AgentLoop {
       assistantContent,
       actions,
       feedbackStatus,
+      agentRole: this.currentAgentRole,
     });
   }
 
diff --git a/src/orchestration/artifacts.ts b/src/orchestration/artifacts.ts
new file mode 100644
index 0000000..c62b17c
--- /dev/null
+++ b/src/orchestration/artifacts.ts
@@ -0,0 +1,139 @@
+import type { AgentRole } from './roles';
+
+export interface StageArtifact {
+  role: AgentRole;
+  summary: string;
+  changedFiles: string[];
+  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
+  testStatus?: 'pass' | 'fail' | 'skipped';
+  rawExcerpt?: string;
+}
+
+export type GateDecision =
+  | { action: 'continue' }
+  | { action: 'retry_coder'; reason: string }
+  | { action: 'warn'; reason: string };
+
+const SUMMARY_MAX = 500;
+
+interface ParsedPayload {
+  summary?: string;
+  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
+  testStatus?: 'pass' | 'fail' | 'skipped';
+}
+
+function truncate(text: string, max = SUMMARY_MAX): string {
+  return text.length <= max ? text : text.slice(0, max);
+}
+
+function extractJsonSource(content: string): { json: string; excerpt: string } | null {
+  const fenceMatch = content.match(/```json\s*([\s\S]*?)```/i);
+  if (fenceMatch) {
+    return { json: fenceMatch[1].trim(), excerpt: fenceMatch[0] };
+  }
+
+  const lineMatch = content.match(/^ARTIFACT:\s*(.+)$/m);
+  if (lineMatch) {
+    return { json: lineMatch[1].trim(), excerpt: lineMatch[0] };
+  }
+
+  return null;
+}
+
+function parsePayload(json: string): ParsedPayload | null {
+  try {
+    const data = JSON.parse(json) as Record<string, unknown>;
+    if (typeof data !== 'object' || data === null) {
+      return null;
+    }
+
+    const payload: ParsedPayload = {};
+
+    if (typeof data.summary === 'string') {
+      payload.summary = data.summary;
+    }
+
+    if (Array.isArray(data.findings)) {
+      payload.findings = data.findings.filter(
+        (f): f is { severity: 'info' | 'warn' | 'block'; message: string } =>
+          typeof f === 'object' &&
+          f !== null &&
+          (f.severity === 'info' || f.severity === 'warn' || f.severity === 'block') &&
+          typeof f.message === 'string',
+      );
+    }
+
+    if (data.testStatus === 'pass' || data.testStatus === 'fail' || data.testStatus === 'skipped') {
+      payload.testStatus = data.testStatus;
+    }
+
+    return payload;
+  } catch {
+    return null;
+  }
+}
+
+function fallbackArtifact(role: AgentRole, content: string, changedFiles: string[]): StageArtifact {
+  return {
+    role,
+    summary: truncate(content),
+    changedFiles,
+    findings: [],
+    testStatus: 'skipped',
+  };
+}
+
+export function parseStageOutput(
+  role: AgentRole,
+  content: string,
+  changedFiles: string[],
+): { artifact: StageArtifact; parseOk: boolean } {
+  const source = extractJsonSource(content);
+  if (!source) {
+    return { artifact: fallbackArtifact(role, content, changedFiles), parseOk: false };
+  }
+
+  const payload = parsePayload(source.json);
+  if (!payload) {
+    return { artifact: fallbackArtifact(role, content, changedFiles), parseOk: false };
+  }
+
+  const artifact: StageArtifact = {
+    role,
+    summary: payload.summary ?? truncate(content),
+    changedFiles,
+    rawExcerpt: source.excerpt,
+  };
+
+  if (payload.findings !== undefined) {
+    artifact.findings = payload.findings;
+  }
+  if (payload.testStatus !== undefined) {
+    artifact.testStatus = payload.testStatus;
+  }
+
+  return { artifact, parseOk: true };
+}
+
+export function parseArtifactFromAssistant(
+  role: AgentRole,
+  content: string,
+  changedFiles: string[],
+): StageArtifact {
+  return parseStageOutput(role, content, changedFiles).artifact;
+}
+
+export function decideGate(artifact: StageArtifact): GateDecision {
+  if (artifact.role === 'reviewer') {
+    const block = artifact.findings?.find((f) => f.severity === 'block');
+    if (block) {
+      return { action: 'retry_coder', reason: block.message };
+    }
+  }
+
+  if (artifact.role === 'tester' && artifact.testStatus === 'fail') {
+    return { action: 'retry_coder', reason: artifact.summary };
+  }
+
+  return { action: 'continue' };
+}
diff --git a/src/orchestration/orchestrator.ts b/src/orchestration/orchestrator.ts
new file mode 100644
index 0000000..2d3dc0f
--- /dev/null
+++ b/src/orchestration/orchestrator.ts
@@ -0,0 +1,178 @@
+import type { AgentLoop, ProgressCallback, RoundProgress } from '../agent/loop';
+import type { Message } from '../agent/types';
+import { parseStageOutput, decideGate } from './artifacts';
+import type { StageArtifact } from './artifacts';
+import type { AgentRole } from './roles';
+
+export interface OrchestratorStatus {
+  phase: string;
+  roles: Record<AgentRole, 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error'>;
+  retryCount: number;
+  maxRetries: number;
+  lastGate?: { from: string; reason: string };
+}
+
+export interface OrchestrationResult {
+  status: 'completed' | 'failed' | 'cancelled';
+  stages: StageArtifact[];
+  retries: number;
+  messages: Message[];
+  progressEvents: RoundProgress[];
+}
+
+const ROLE_ORDER: AgentRole[] = ['coder', 'reviewer', 'tester'];
+
+const ARTIFACT_INSTRUCTION =
+  'When finished, end your reply with a line: ARTIFACT: {"summary":"...","findings":[...],"testStatus":"pass"|"fail"|"skipped"} as appropriate for your role.';
+
+function idleRoles(): OrchestratorStatus['roles'] {
+  return { coder: 'idle', reviewer: 'idle', tester: 'idle' };
+}
+
+function lastAssistantContent(messages: Message[]): string {
+  for (let i = messages.length - 1; i >= 0; i--) {
+    if (messages[i].role === 'assistant') {
+      return messages[i].content;
+    }
+  }
+  return '';
+}
+
+function phaseForRole(role: AgentRole): string {
+  return role === 'reviewer' ? 'review_running' : role === 'tester' ? 'test_running' : 'coder_running';
+}
+
+export class Orchestrator {
+  private cancelled = false;
+  private currentLoop: AgentLoop | null = null;
+
+  constructor(
+    private deps: {
+      createLoop: (role: AgentRole, onProgress: ProgressCallback) => AgentLoop;
+      maxRetries: number;
+      onStatus?: (s: OrchestratorStatus) => void;
+      getChangedFiles?: () => string[];
+    },
+  ) {}
+
+  cancel(): void {
+    this.cancelled = true;
+    this.currentLoop?.cancel();
+  }
+
+  async run(
+    task: string,
+    options?: { priorMessages?: Message[] },
+  ): Promise<OrchestrationResult> {
+    this.cancelled = false;
+    const stages: StageArtifact[] = [];
+    const progressEvents: RoundProgress[] = [];
+    let messages: Message[] = [...(options?.priorMessages ?? [])];
+    let retries = 0;
+    let retryCount = 0;
+    const getChangedFiles = this.deps.getChangedFiles ?? (() => []);
+
+    const emitStatus = (partial: Partial<OrchestratorStatus> & { phase: string }) => {
+      this.deps.onStatus?.({
+        roles: idleRoles(),
+        retryCount,
+        maxRetries: this.deps.maxRetries,
+        ...partial,
+      });
+    };
+
+    emitStatus({ phase: 'idle' });
+
+    while (true) {
+      if (this.cancelled) {
+        return { status: 'cancelled', stages, retries, messages, progressEvents };
+      }
+
+      let pipelineComplete = true;
+
+      for (const role of ROLE_ORDER) {
+        if (this.cancelled) {
+          return { status: 'cancelled', stages, retries, messages, progressEvents };
+        }
+
+        const roles = idleRoles();
+        roles[role] = 'running';
+        emitStatus({ phase: phaseForRole(role), roles });
+
+        const onProgress: ProgressCallback = (event) => {
+          progressEvents.push({ ...event, agentRole: role });
+        };
+
+        this.currentLoop = this.deps.createLoop(role, onProgress);
+        const coderTask =
+          role === 'coder'
+            ? `${task}\n\n${ARTIFACT_INSTRUCTION}`
+            : `Continue the pipeline for: ${task}\n\n${ARTIFACT_INSTRUCTION}`;
+
+        const loopResult = await this.currentLoop.run(coderTask, {
+          priorMessages: messages,
+          agentRole: role,
+        });
+        this.currentLoop = null;
+
+        if (loopResult.status === 'cancelled' || this.cancelled) {
+          messages = loopResult.messages;
+          return { status: 'cancelled', stages, retries, messages, progressEvents };
+        }
+
+        if (loopResult.status !== 'completed') {
+          messages = loopResult.messages;
+          const rolesFailed = idleRoles();
+          rolesFailed[role] = 'error';
+          emitStatus({ phase: 'failed', roles: rolesFailed });
+          return { status: 'failed', stages, retries, messages, progressEvents };
+        }
+
+        messages = loopResult.messages;
+        const changedFiles = getChangedFiles();
+        const content = lastAssistantContent(loopResult.messages);
+        const { artifact } = parseStageOutput(role, content, changedFiles);
+        stages.push(artifact);
+
+        const gate = decideGate(artifact);
+        if (gate.action === 'retry_coder') {
+          const rolesAfter = idleRoles();
+          rolesAfter[role] = 'blocked';
+
+          if (retryCount >= this.deps.maxRetries) {
+            emitStatus({ phase: 'failed', roles: rolesAfter, lastGate: { from: role, reason: gate.reason } });
+            return { status: 'failed', stages, retries, messages, progressEvents };
+          }
+
+          retryCount++;
+          retries++;
+          emitStatus({
+            phase: 'retry',
+            roles: rolesAfter,
+            lastGate: { from: role, reason: gate.reason },
+          });
+          messages = [
+            ...messages,
+            { role: 'user', content: `Gate rejected (${role}): ${gate.reason}. Please fix and resubmit.` },
+          ];
+          pipelineComplete = false;
+          break;
+        }
+
+        const rolesDone = idleRoles();
+        for (const r of ROLE_ORDER) {
+          rolesDone[r] = stages.some((s) => s.role === r) ? 'done' : r === role ? 'done' : 'idle';
+        }
+        emitStatus({ phase: phaseForRole(role), roles: rolesDone });
+      }
+
+      if (pipelineComplete) {
+        emitStatus({
+          phase: 'completed',
+          roles: { coder: 'done', reviewer: 'done', tester: 'done' },
+        });
+        return { status: 'completed', stages, retries, messages, progressEvents };
+      }
+    }
+  }
+}
diff --git a/src/orchestration/roles.ts b/src/orchestration/roles.ts
new file mode 100644
index 0000000..5d13df1
--- /dev/null
+++ b/src/orchestration/roles.ts
@@ -0,0 +1,52 @@
+import type { Tool } from '../tools/base';
+
+export type AgentRole = 'coder' | 'reviewer' | 'tester';
+
+export interface RoleDefinition {
+  role: AgentRole;
+  systemPrompt: string;
+  allowedTools: string[];
+}
+
+const CODER_TOOLS = [
+  'read_file',
+  'write_file',
+  'delete_file',
+  'shell',
+  'search',
+  'git_diff',
+  'run_test',
+] as const;
+
+const REVIEWER_TOOLS = ['read_file', 'search', 'git_diff'] as const;
+
+const TESTER_TOOLS = ['read_file', 'run_test', 'search', 'git_diff'] as const;
+
+export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition> = {
+  coder: {
+    role: 'coder',
+    systemPrompt:
+      'You are a coding agent (编码代理). You implement features, fix bugs, and modify the codebase. ' +
+      'You may read, write, and delete files, run shell commands, search code, inspect git diffs, and run tests.',
+    allowedTools: [...CODER_TOOLS],
+  },
+  reviewer: {
+    role: 'reviewer',
+    systemPrompt:
+      'You are a code reviewer (代码审查员). Your job is to review changes for correctness, style, and risks. ' +
+      'You must NOT modify code — use read-only tools to inspect files, search the codebase, and view git diffs.',
+    allowedTools: [...REVIEWER_TOOLS],
+  },
+  tester: {
+    role: 'tester',
+    systemPrompt:
+      'You are a test engineer (测试工程师). Your job is to verify behavior by running tests and inspecting results. ' +
+      'You must NOT modify code — use read_file, run_test, search, and git_diff to validate changes without writing files.',
+    allowedTools: [...TESTER_TOOLS],
+  },
+};
+
+export function filterToolsForRole(role: AgentRole, tools: Tool[]): Tool[] {
+  const allowed = new Set(ROLE_DEFINITIONS[role].allowedTools);
+  return tools.filter((tool) => allowed.has(tool.name));
+}
diff --git a/src/server/http-server.ts b/src/server/http-server.ts
index aaf7879..d43bcad 100644
--- a/src/server/http-server.ts
+++ b/src/server/http-server.ts
@@ -4,9 +4,19 @@ import path from 'path';
 import type { AddressInfo } from 'node:net';
 import { WebSocketServer, WebSocket } from 'ws';
 import { AgentLoop } from '../agent/loop';
-import type { HITLRequest, HITLResponse, RoundProgress, RunResult } from '../agent/loop';
+import type { HITLRequest, HITLResponse, ProgressCallback, RoundProgress, RunResult } from '../agent/loop';
 import type { SessionStore, SessionData } from './session-store';
 import type { WSMessage } from './types';
+import { WorkspaceCheckpoint, type Checkpoint, type CheckpointDiff } from '../workspace/checkpoint';
+import { buildFileTree } from '../workspace/file-tree';
+import { readWorkspaceFile } from '../workspace/read-file';
+import { Orchestrator } from '../orchestration/orchestrator';
+import type { OrchestrationResult } from '../orchestration/orchestrator';
+import { filterToolsForRole, ROLE_DEFINITIONS } from '../orchestration/roles';
+import type { AgentRole } from '../orchestration/roles';
+import { ToolDispatcher } from '../tools/dispatcher';
+import { ContextBuilder } from '../agent/context-builder';
+import type { Message } from '../agent/types';
 import { logger } from '../utils/logger';
 
 interface PendingHITL {
@@ -15,20 +25,34 @@ interface PendingHITL {
   ws: WebSocket;
 }
 
+interface Cancellable {
+  cancel(): void;
+}
+
 export class HarnessServer {
   private app: express.Application;
   private server: http.Server;
   private wss: WebSocketServer;
   private loop: AgentLoop;
   private sessionStore?: SessionStore;
+  private checkpoint: WorkspaceCheckpoint;
+  private workspaceRoot: string;
   private token: string;
   private pendingHITL: Map<string, PendingHITL> = new Map();
-  private runningLoops: Map<WebSocket, AgentLoop> = new Map();
+  private runningLoops: Map<WebSocket, Cancellable> = new Map();
+  private checkpoints: Map<string, Checkpoint> = new Map();
   public readonly ready: Promise<void>;
 
-  constructor(loop: AgentLoop, port: number = 3000, sessionStore?: SessionStore) {
+  constructor(
+    loop: AgentLoop,
+    port: number = 3000,
+    sessionStore?: SessionStore,
+    workspaceRoot: string = process.cwd(),
+  ) {
     this.loop = loop;
     this.sessionStore = sessionStore;
+    this.workspaceRoot = workspaceRoot;
+    this.checkpoint = new WorkspaceCheckpoint(workspaceRoot);
     this.token = process.env.HARNESS_TOKEN || '';
 
     this.app = express();
@@ -52,23 +76,23 @@ export class HarnessServer {
       res.json({ status: 'ok' });
     });
 
+    const requireToken: express.RequestHandler = (req, res, next) => {
+      if (!this.token) {
+        next();
+        return;
+      }
+      const auth = req.headers.authorization;
+      const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
+      const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
+      if (bearer === this.token || queryToken === this.token) {
+        next();
+        return;
+      }
+      res.status(401).json({ error: 'unauthorized' });
+    };
+
     if (this.sessionStore) {
       const store = this.sessionStore;
-      const requireToken: express.RequestHandler = (req, res, next) => {
-        if (!this.token) {
-          next();
-          return;
-        }
-        const auth = req.headers.authorization;
-        const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
-        const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
-        if (bearer === this.token || queryToken === this.token) {
-          next();
-          return;
-        }
-        res.status(401).json({ error: 'unauthorized' });
-      };
-
       this.app.get('/api/sessions', requireToken, (_req, res) => {
         res.json(store.list());
       });
@@ -92,6 +116,52 @@ export class HarnessServer {
       });
     }
 
+    this.app.get('/api/workspace/files', requireToken, (_req, res) => {
+      try {
+        res.json(buildFileTree(this.workspaceRoot));
+      } catch (err) {
+        res.status(500).json({ error: String(err) });
+      }
+    });
+
+    this.app.get('/api/workspace/file', requireToken, (req, res) => {
+      const p = typeof req.query.path === 'string' ? req.query.path : '';
+      if (!p) {
+        res.status(400).json({ error: 'missing path' });
+        return;
+      }
+      try {
+        res.json(readWorkspaceFile(this.workspaceRoot, p));
+      } catch (err) {
+        const msg = String(err);
+        const status = /traversal|blocked|not a file/i.test(msg) ? 400
+          : /not found/i.test(msg) ? 404
+          : /too large|binary/i.test(msg) ? 415
+          : 500;
+        res.status(status).json({ error: msg });
+      }
+    });
+
+    this.app.post('/api/checkpoint/rollback', requireToken, (req, res) => {
+      const id = req.body?.id as string | undefined;
+      if (!id) {
+        res.status(400).json({ error: 'missing checkpoint id' });
+        return;
+      }
+      const cp = this.checkpoints.get(id);
+      if (!cp) {
+        res.status(404).json({ error: 'checkpoint not found' });
+        return;
+      }
+      try {
+        this.checkpoint.rollback(cp);
+        this.checkpoints.delete(id);
+        res.json({ ok: true });
+      } catch (err) {
+        res.status(500).json({ error: String(err) });
+      }
+    });
+
     this.app.use(express.static(path.join(__dirname, '../../webui/dist')));
     this.app.get('*', (_req, res) => {
       res.sendFile(path.join(__dirname, '../../webui/dist/index.html'));
@@ -133,6 +203,26 @@ export class HarnessServer {
     this.server.close();
   }
 
+  private tryCreateCheckpoint(): Checkpoint | null {
+    try {
+      return this.checkpoint.create();
+    } catch (err) {
+      logger.warn('Failed to create checkpoint', { error: String(err) });
+      return null;
+    }
+  }
+
+  private buildDiff(cp: Checkpoint | null): (CheckpointDiff & { id: string }) | null {
+    if (!cp) return null;
+    try {
+      const diff = this.checkpoint.diff(cp);
+      return { id: cp.id, ...diff };
+    } catch (err) {
+      logger.warn('Failed to build checkpoint diff', { error: String(err) });
+      return null;
+    }
+  }
+
   private rejectHITLForClient(ws: WebSocket): void {
     for (const [id, pending] of this.pendingHITL) {
       if (pending.ws === ws) {
@@ -165,27 +255,109 @@ export class HarnessServer {
     };
   }
 
-  private saveSession(task: string, result: RunResult, progressEvents: RoundProgress[]): void {
+  private loadPriorMessages(sessionId?: number): Message[] {
+    if (sessionId === undefined || !this.sessionStore) return [];
+    const record = this.sessionStore.get(sessionId);
+    return record?.data.messages ?? [];
+  }
+
+  private persistSession(
+    task: string,
+    status: string,
+    rounds: number,
+    data: SessionData,
+    sessionId?: number,
+  ): void {
     if (!this.sessionStore) return;
     try {
-      const data: SessionData = {
+      if (sessionId !== undefined && this.sessionStore.update(sessionId, { task, status, rounds, data })) {
+        logger.info('Session updated', { id: sessionId, status, rounds });
+        return;
+      }
+      const id = this.sessionStore.save({ task, status, rounds, data });
+      logger.info('Session saved', { id, status, rounds });
+    } catch (err) {
+      logger.error('Failed to save session', { error: String(err) });
+    }
+  }
+
+  private saveSession(
+    task: string,
+    result: RunResult,
+    progressEvents: RoundProgress[],
+    sessionId?: number,
+  ): void {
+    this.persistSession(
+      task,
+      result.status,
+      result.rounds,
+      {
         progressEvents,
         feedbackHistory: result.feedbackHistory,
         messages: result.messages,
-      };
-      const id = this.sessionStore.save({ task, status: result.status, rounds: result.rounds, data });
-      logger.info('Session saved', { id, status: result.status, rounds: result.rounds });
-    } catch (err) {
-      logger.error('Failed to save session', { error: String(err) });
+      },
+      sessionId,
+    );
+  }
+
+  private saveOrchestrationSession(
+    task: string,
+    result: OrchestrationResult,
+    sessionId?: number,
+  ): void {
+    this.persistSession(
+      task,
+      result.status,
+      result.progressEvents.length,
+      {
+        progressEvents: result.progressEvents,
+        feedbackHistory: [],
+        messages: result.messages,
+      },
+      sessionId,
+    );
+  }
+
+  private rejectIfBusy(ws: WebSocket): boolean {
+    if (!this.runningLoops.has(ws)) return false;
+    if (ws.readyState === WebSocket.OPEN) {
+      ws.send(JSON.stringify({ type: 'status', payload: { status: 'error', error: 'busy' } }));
     }
+    return true;
+  }
+
+  private createRoleLoop(
+    ws: WebSocket,
+    role: AgentRole,
+    allTools: ReturnType<ToolDispatcher['listTools']>,
+    hitlCallback: (request: HITLRequest) => Promise<HITLResponse>,
+    onProgress: ProgressCallback,
+  ): AgentLoop {
+    return new AgentLoop({
+      ...this.loop.config,
+      contextBuilder: new ContextBuilder({
+        systemPrompt: ROLE_DEFINITIONS[role].systemPrompt,
+        configRules: [],
+        memories: [],
+      }),
+      dispatcher: new ToolDispatcher(filterToolsForRole(role, allTools)),
+      hitlCallback,
+      onProgress,
+    });
   }
 
   private async handleMessage(ws: WebSocket, msg: WSMessage): Promise<void> {
     if (msg.type === 'task') {
-      const { task } = msg.payload as { task: string };
-      logger.info('Agent task received', { task: task.substring(0, 100) });
+      if (this.rejectIfBusy(ws)) return;
+
+      const { task, sessionId } = msg.payload as { task: string; sessionId?: number };
+      const priorMessages = this.loadPriorMessages(sessionId);
+      logger.info('Agent task received', { task: task.substring(0, 100), sessionId });
       ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));
 
+      const cp = this.tryCreateCheckpoint();
+      if (cp) this.checkpoints.set(cp.id, cp);
+
       const hitlCallback = this.createHITLCallback(ws);
       const progressEvents: RoundProgress[] = [];
       const loopWithHITL = new AgentLoop({
@@ -201,9 +373,10 @@ export class HarnessServer {
       this.runningLoops.set(ws, loopWithHITL);
 
       try {
-        const result = await loopWithHITL.run(task);
+        const result = await loopWithHITL.run(task, { priorMessages });
         logger.info('Agent task completed', { status: result.status, rounds: result.rounds });
-        this.saveSession(task, result, progressEvents);
+        this.saveSession(task, result, progressEvents, sessionId);
+        const checkpoint = this.buildDiff(cp);
 
         if (ws.readyState === WebSocket.OPEN) {
           ws.send(JSON.stringify({
@@ -213,6 +386,7 @@ export class HarnessServer {
               rounds: result.rounds,
               messages: result.messages,
               feedbackHistory: result.feedbackHistory,
+              checkpoint,
             },
           }));
         }
@@ -220,14 +394,127 @@ export class HarnessServer {
         logger.error('Agent task failed', { error: String(err) });
         this.saveSession(
           task,
-          { status: 'error', rounds: progressEvents.length, messages: [], feedbackHistory: [] },
+          { status: 'error', rounds: progressEvents.length, messages: priorMessages, feedbackHistory: [] },
           progressEvents,
+          sessionId,
         );
+        const checkpoint = this.buildDiff(cp);
         if (ws.readyState === WebSocket.OPEN) {
           ws.send(JSON.stringify({
             type: 'status',
             payload: { status: 'error', error: String(err) },
           }));
+          if (checkpoint) {
+            ws.send(JSON.stringify({
+              type: 'result',
+              payload: {
+                status: 'error',
+                rounds: progressEvents.length,
+                messages: priorMessages,
+                feedbackHistory: [],
+                checkpoint,
+              },
+            }));
+          }
+        }
+      } finally {
+        this.runningLoops.delete(ws);
+      }
+    } else if (msg.type === 'orchestrate') {
+      if (this.rejectIfBusy(ws)) return;
+
+      const { task, maxRetries, sessionId } = msg.payload as {
+        task: string;
+        maxRetries?: number;
+        sessionId?: number;
+      };
+      const resolvedMaxRetries = maxRetries ?? Number(process.env.ORCHESTRATOR_MAX_RETRIES ?? 2);
+      const priorMessages = this.loadPriorMessages(sessionId);
+      logger.info('Orchestration task received', {
+        task: task.substring(0, 100),
+        sessionId,
+        maxRetries: resolvedMaxRetries,
+      });
+      ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));
+
+      const cp = this.tryCreateCheckpoint();
+      if (cp) this.checkpoints.set(cp.id, cp);
+
+      const hitlCallback = this.createHITLCallback(ws);
+      const allTools = this.loop.config.dispatcher.listTools();
+      const orchestrator = new Orchestrator({
+        maxRetries: resolvedMaxRetries,
+        onStatus: (status) => {
+          if (ws.readyState === WebSocket.OPEN) {
+            ws.send(JSON.stringify({ type: 'orchestrator_status', payload: status }));
+          }
+        },
+        createLoop: (role, onProgress) => {
+          const roleProgress: ProgressCallback = (event) => {
+            onProgress(event);
+            if (ws.readyState === WebSocket.OPEN) {
+              ws.send(JSON.stringify({ type: 'progress', payload: event }));
+            }
+          };
+          return this.createRoleLoop(ws, role, allTools, hitlCallback, roleProgress);
+        },
+      });
+      this.runningLoops.set(ws, orchestrator);
+
+      try {
+        const result = await orchestrator.run(task, { priorMessages });
+        logger.info('Orchestration completed', { status: result.status, retries: result.retries });
+        this.saveOrchestrationSession(task, result, sessionId);
+        const checkpoint = this.buildDiff(cp);
+
+        if (ws.readyState === WebSocket.OPEN) {
+          ws.send(JSON.stringify({
+            type: 'result',
+            payload: {
+              status: result.status,
+              rounds: result.progressEvents.length,
+              messages: result.messages,
+              feedbackHistory: [],
+              checkpoint,
+              orchestration: {
+                stages: result.stages,
+                retries: result.retries,
+                status: result.status,
+              },
+            },
+          }));
+        }
+      } catch (err) {
+        logger.error('Orchestration failed', { error: String(err) });
+        this.saveOrchestrationSession(
+          task,
+          {
+            status: 'failed',
+            stages: [],
+            retries: 0,
+            messages: priorMessages,
+            progressEvents: [],
+          },
+          sessionId,
+        );
+        const checkpoint = this.buildDiff(cp);
+        if (ws.readyState === WebSocket.OPEN) {
+          ws.send(JSON.stringify({
+            type: 'status',
+            payload: { status: 'error', error: String(err) },
+          }));
+          if (checkpoint) {
+            ws.send(JSON.stringify({
+              type: 'result',
+              payload: {
+                status: 'error',
+                rounds: 0,
+                messages: priorMessages,
+                feedbackHistory: [],
+                checkpoint,
+              },
+            }));
+          }
         }
       } finally {
         this.runningLoops.delete(ws);
diff --git a/src/server/session-store.ts b/src/server/session-store.ts
index 1ba8ec9..ffdc300 100644
--- a/src/server/session-store.ts
+++ b/src/server/session-store.ts
@@ -79,6 +79,13 @@ export class SessionStore {
     return this.db.prepare('DELETE FROM sessions WHERE id = ?').run(id).changes > 0;
   }
 
+  update(id: number, input: NewSession): boolean {
+    const info = this.db
+      .prepare('UPDATE sessions SET task = ?, status = ?, rounds = ?, data = ? WHERE id = ?')
+      .run(input.task, input.status, input.rounds, JSON.stringify(input.data), id);
+    return info.changes > 0;
+  }
+
   close(): void {
     this.db.close();
   }
diff --git a/src/server/types.ts b/src/server/types.ts
index 903885d..e25c01d 100644
--- a/src/server/types.ts
+++ b/src/server/types.ts
@@ -1,11 +1,26 @@
 export interface WSMessage {
-  type: 'task' | 'cancel' | 'hitl_response' | 'hitl_request' | 'status' | 'result' | 'log' | 'progress';
+  type:
+    | 'task'
+    | 'orchestrate'
+    | 'cancel'
+    | 'hitl_response'
+    | 'hitl_request'
+    | 'status'
+    | 'orchestrator_status'
+    | 'result'
+    | 'log'
+    | 'progress';
   payload: unknown;
 }
 
 export interface TaskMessage {
   type: 'task';
-  payload: { task: string };
+  payload: { task: string; sessionId?: number };
+}
+
+export interface OrchestrateMessage {
+  type: 'orchestrate';
+  payload: { task: string; maxRetries?: number; sessionId?: number };
 }
 
 export interface HITLResponse {
diff --git a/src/tools/dispatcher.ts b/src/tools/dispatcher.ts
index bbadf05..7e74356 100644
--- a/src/tools/dispatcher.ts
+++ b/src/tools/dispatcher.ts
@@ -28,4 +28,8 @@ export class ToolDispatcher {
       },
     }));
   }
-}
\ No newline at end of file
+
+  listTools(): Tool[] {
+    return Array.from(this.tools.values());
+  }
+}
diff --git a/src/tools/file-tools.ts b/src/tools/file-tools.ts
index 7f801e4..c3fc701 100644
--- a/src/tools/file-tools.ts
+++ b/src/tools/file-tools.ts
@@ -8,15 +8,19 @@ export function setWorkspaceRoot(root: string): void {
   workspaceRoot = root;
 }
 
-function resolvePath(inputPath: string): string {
-  const resolved = path.resolve(workspaceRoot, inputPath);
-  const relative = path.relative(path.resolve(workspaceRoot), resolved);
+export function resolveWorkspacePath(inputPath: string, root: string = workspaceRoot): string {
+  const resolved = path.resolve(root, inputPath);
+  const relative = path.relative(path.resolve(root), resolved);
   if (relative.startsWith('..') || path.isAbsolute(relative)) {
     throw new Error(`Path traversal blocked: ${inputPath}`);
   }
   return resolved;
 }
 
+function resolvePath(inputPath: string): string {
+  return resolveWorkspacePath(inputPath);
+}
+
 export const readFileTool: Tool = {
   name: 'read_file',
   description: 'Read the contents of a file',
diff --git a/src/workspace/read-file.ts b/src/workspace/read-file.ts
new file mode 100644
index 0000000..b9f1e9c
--- /dev/null
+++ b/src/workspace/read-file.ts
@@ -0,0 +1,26 @@
+import { readFileSync, statSync } from 'node:fs';
+import { relative } from 'node:path';
+import { resolveWorkspacePath } from '../tools/file-tools';
+
+const DEFAULT_MAX = 1 * 1024 * 1024;
+
+export function readWorkspaceFile(
+  root: string,
+  relativePath: string,
+  maxBytes: number = DEFAULT_MAX,
+): { path: string; content: string; size: number } {
+  const abs = resolveWorkspacePath(relativePath, root);
+  let st;
+  try {
+    st = statSync(abs);
+  } catch {
+    throw new Error(`File not found: ${relativePath}`);
+  }
+  if (!st.isFile()) throw new Error(`Not a file: ${relativePath}`);
+  if (st.size > maxBytes) throw new Error(`File too large: ${relativePath}`);
+  const buf = readFileSync(abs);
+  if (buf.includes(0)) throw new Error(`binary file not supported: ${relativePath}`);
+  const content = buf.toString('utf-8');
+  const rel = relative(root, abs).replace(/\\/g, '/');
+  return { path: rel, content, size: st.size };
+}
diff --git a/webui/src/api/workspace.ts b/webui/src/api/workspace.ts
new file mode 100644
index 0000000..6be6bf5
--- /dev/null
+++ b/webui/src/api/workspace.ts
@@ -0,0 +1,19 @@
+import type { FileTreeNode, WorkspaceFile } from '../types';
+
+function authHeaders(): HeadersInit {
+  const token = new URLSearchParams(window.location.search).get('token') || '';
+  return token ? { Authorization: `Bearer ${token}` } : {};
+}
+
+export async function listWorkspaceFiles(): Promise<FileTreeNode[]> {
+  const res = await fetch('/api/workspace/files', { headers: authHeaders() });
+  if (!res.ok) throw new Error(`HTTP ${res.status}`);
+  return res.json() as Promise<FileTreeNode[]>;
+}
+
+export async function getWorkspaceFile(path: string): Promise<WorkspaceFile> {
+  const q = new URLSearchParams({ path });
+  const res = await fetch(`/api/workspace/file?${q}`, { headers: authHeaders() });
+  if (!res.ok) throw new Error(`HTTP ${res.status}`);
+  return res.json() as Promise<WorkspaceFile>;
+}
diff --git a/webui/src/hooks/useWebSocket.ts b/webui/src/hooks/useWebSocket.ts
index 44434f1..4d1181d 100644
--- a/webui/src/hooks/useWebSocket.ts
+++ b/webui/src/hooks/useWebSocket.ts
@@ -1,5 +1,13 @@
 import { useState, useEffect, useRef, useCallback } from 'react';
-import type { WSMessage, AgentResult, HITLRequestPayload, RoundProgress, ChatItem } from '../types';
+import type {
+  WSMessage,
+  AgentResult,
+  HITLRequestPayload,
+  RoundProgress,
+  ChatItem,
+  CheckpointDiffPayload,
+  OrchestratorStatus,
+} from '../types';
 
 export function useWebSocket(url: string) {
   const wsRef = useRef<WebSocket | null>(null);
@@ -9,6 +17,8 @@ export function useWebSocket(url: string) {
   const [status, setStatus] = useState<string>('idle');
   const [hitlRequest, setHitlRequest] = useState<HITLRequestPayload | null>(null);
   const [chat, setChat] = useState<ChatItem[]>([]);
+  const [checkpoint, setCheckpoint] = useState<CheckpointDiffPayload | null>(null);
+  const [orchestratorStatus, setOrchestratorStatus] = useState<OrchestratorStatus | null>(null);
   const idRef = useRef(0);
   const retryRef = useRef(0);
   const timerRef = useRef<number | null>(null);
@@ -44,6 +54,8 @@ export function useWebSocket(url: string) {
           if (next === 'error' || next === 'cancelled') {
             setHitlRequest(null);
           }
+        } else if (msg.type === 'orchestrator_status') {
+          setOrchestratorStatus(msg.payload as OrchestratorStatus);
         } else if (msg.type === 'progress') {
           const p = msg.payload as RoundProgress;
           setChat((prev) => [
@@ -55,6 +67,7 @@ export function useWebSocket(url: string) {
               text: p.assistantContent,
               actions: p.actions,
               feedbackStatus: p.feedbackStatus,
+              ...(p.agentRole ? { agentRole: p.agentRole } : {}),
             },
           ]);
         } else if (msg.type === 'result') {
@@ -62,6 +75,7 @@ export function useWebSocket(url: string) {
           setResult(payload);
           setStatus(payload.status || 'idle');
           setHitlRequest(null);
+          setCheckpoint(payload.checkpoint ?? null);
         } else if (msg.type === 'hitl_request') {
           setHitlRequest(msg.payload as HITLRequestPayload);
         }
@@ -78,14 +92,55 @@ export function useWebSocket(url: string) {
     };
   }, [url]);
 
-  const sendTask = useCallback((task: string) => {
-    wsRef.current?.send(JSON.stringify({ type: 'task', payload: { task } }));
+  const seedChat = useCallback((items: ChatItem[]) => {
+    setChat(items);
+    idRef.current = items.length;
+  }, []);
+
+  const sendTask = useCallback((task: string, opts?: { sessionId?: number }) => {
+    const payload: { task: string; sessionId?: number } = { task };
+    if (opts?.sessionId != null) payload.sessionId = opts.sessionId;
+    wsRef.current?.send(JSON.stringify({ type: 'task', payload }));
     setStatus('running');
     setResult(null);
     setHitlRequest(null);
-    setChat([{ id: `user-${++idRef.current}`, kind: 'user', text: task }]);
+    setCheckpoint(null);
+    setOrchestratorStatus(null);
+    const userItem: ChatItem = { id: `user-${++idRef.current}`, kind: 'user', text: task };
+    if (opts?.sessionId != null) {
+      setChat((prev) => [...prev, userItem]);
+    } else {
+      setChat([userItem]);
+    }
   }, []);
 
+  const sendOrchestrate = useCallback(
+    (task: string, opts?: { maxRetries?: number; sessionId?: number }) => {
+      const payload: { task: string; maxRetries?: number; sessionId?: number } = { task };
+      if (opts?.maxRetries != null) payload.maxRetries = opts.maxRetries;
+      if (opts?.sessionId != null) payload.sessionId = opts.sessionId;
+      wsRef.current?.send(JSON.stringify({ type: 'orchestrate', payload }));
+      setStatus('running');
+      setResult(null);
+      setHitlRequest(null);
+      setCheckpoint(null);
+      setOrchestratorStatus(null);
+      const userItem: ChatItem = { id: `user-${++idRef.current}`, kind: 'user', text: task };
+      if (opts?.sessionId != null) {
+        setChat((prev) => [...prev, userItem]);
+      } else {
+        setChat([userItem]);
+      }
+    },
+    [],
+  );
+
+  const clearOrchestratorStatus = useCallback(() => setOrchestratorStatus(null), []);
+
+  const clearResult = useCallback(() => setResult(null), []);
+
+  const clearCheckpoint = useCallback(() => setCheckpoint(null), []);
+
   const cancel = useCallback(() => {
     wsRef.current?.send(JSON.stringify({ type: 'cancel' }));
   }, []);
@@ -104,5 +159,22 @@ export function useWebSocket(url: string) {
     [hitlRequest],
   );
 
-  return { connected, reconnecting, status, result, hitlRequest, chat, sendTask, cancel, respondHITL };
+  return {
+    connected,
+    reconnecting,
+    status,
+    result,
+    hitlRequest,
+    chat,
+    checkpoint,
+    orchestratorStatus,
+    sendTask,
+    sendOrchestrate,
+    seedChat,
+    cancel,
+    respondHITL,
+    clearCheckpoint,
+    clearOrchestratorStatus,
+    clearResult,
+  };
 }
diff --git a/webui/src/types.ts b/webui/src/types.ts
index 7a99893..353be53 100644
--- a/webui/src/types.ts
+++ b/webui/src/types.ts
@@ -1,5 +1,17 @@
+export type AgentRole = 'coder' | 'reviewer' | 'tester';
+
+export type RoleStatus = 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error';
+
+export interface OrchestratorStatus {
+  phase: string;
+  roles: Record<AgentRole, RoleStatus>;
+  retryCount: number;
+  maxRetries: number;
+  lastGate?: { from: string; reason: string };
+}
+
 export interface WSMessage {
-  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress';
+  type: 'status' | 'result' | 'hitl_request' | 'log' | 'progress' | 'orchestrator_status';
   payload: unknown;
 }
 
@@ -8,6 +20,7 @@ export interface RoundProgress {
   assistantContent: string;
   actions: Array<{ tool: string; result: string }>;
   feedbackStatus?: string;
+  agentRole?: string;
 }
 
 export interface ChatItem {
@@ -18,6 +31,19 @@ export interface ChatItem {
   round?: number;
   actions?: Array<{ tool: string; result: string }>;
   feedbackStatus?: string;
+  agentRole?: string;
+}
+
+export interface WorkspaceFile {
+  path: string;
+  content: string;
+  size: number;
+}
+
+export interface CheckpointDiffPayload {
+  id: string;
+  files: string[];
+  patch: string;
 }
 
 export interface AgentResult {
@@ -25,6 +51,14 @@ export interface AgentResult {
   rounds: number;
   messages: Array<{ role: string; content: string; tool_calls?: unknown[] }>;
   feedbackHistory: Array<{ round: number; status: string }>;
+  checkpoint?: CheckpointDiffPayload | null;
+}
+
+export interface FileTreeNode {
+  name: string;
+  path: string;
+  type: 'file' | 'folder';
+  children?: FileTreeNode[];
 }
 
 export interface HITLRequestPayload {

