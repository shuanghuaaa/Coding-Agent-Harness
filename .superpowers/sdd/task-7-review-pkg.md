BASE 992efacbad469bdb109e320c013687da946bc29e
HEAD f307f9f2a5d5b263cad275fb2990b65b10fd2faa
## Commits
f307f9f feat(server): session resume and orchestrate WebSocket protocol

## Stat
 src/server/http-server.ts      | 289 +++++++++++++++++++++++++++++++++++++++--
 src/server/types.ts            |  19 ++-
 src/tools/dispatcher.ts        |   6 +-
 tests/tools/dispatcher.test.ts |  19 +++
 4 files changed, 316 insertions(+), 17 deletions(-)

## Diff
diff --git a/src/server/http-server.ts b/src/server/http-server.ts
index 9b2b683..d43bcad 100644
--- a/src/server/http-server.ts
+++ b/src/server/http-server.ts
@@ -2,32 +2,47 @@ import express from 'express';
 import http from 'http';
 import path from 'path';
 import type { AddressInfo } from 'node:net';
 import { WebSocketServer, WebSocket } from 'ws';
 import { AgentLoop } from '../agent/loop';
-import type { HITLRequest, HITLResponse, RoundProgress, RunResult } from '../agent/loop';
+import type { HITLRequest, HITLResponse, ProgressCallback, RoundProgress, RunResult } from '../agent/loop';
 import type { SessionStore, SessionData } from './session-store';
 import type { WSMessage } from './types';
+import { WorkspaceCheckpoint, type Checkpoint, type CheckpointDiff } from '../workspace/checkpoint';
+import { buildFileTree } from '../workspace/file-tree';
 import { readWorkspaceFile } from '../workspace/read-file';
+import { Orchestrator } from '../orchestration/orchestrator';
+import type { OrchestrationResult } from '../orchestration/orchestrator';
+import { filterToolsForRole, ROLE_DEFINITIONS } from '../orchestration/roles';
+import type { AgentRole } from '../orchestration/roles';
+import { ToolDispatcher } from '../tools/dispatcher';
+import { ContextBuilder } from '../agent/context-builder';
+import type { Message } from '../agent/types';
 import { logger } from '../utils/logger';
 
 interface PendingHITL {
   request: HITLRequest;
   resolve: (response: HITLResponse) => void;
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
   private workspaceRoot: string;
   private token: string;
   private pendingHITL: Map<string, PendingHITL> = new Map();
-  private runningLoops: Map<WebSocket, AgentLoop> = new Map();
+  private runningLoops: Map<WebSocket, Cancellable> = new Map();
+  private checkpoints: Map<string, Checkpoint> = new Map();
   public readonly ready: Promise<void>;
 
   constructor(
     loop: AgentLoop,
     port: number = 3000,
@@ -35,10 +50,11 @@ export class HarnessServer {
     workspaceRoot: string = process.cwd(),
   ) {
     this.loop = loop;
     this.sessionStore = sessionStore;
     this.workspaceRoot = workspaceRoot;
+    this.checkpoint = new WorkspaceCheckpoint(workspaceRoot);
     this.token = process.env.HARNESS_TOKEN || '';
 
     this.app = express();
     this.server = http.createServer(this.app);
     this.wss = new WebSocketServer({
@@ -98,10 +114,18 @@ export class HarnessServer {
         }
         res.json({ ok: true });
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
     this.app.get('/api/workspace/file', requireToken, (req, res) => {
       const p = typeof req.query.path === 'string' ? req.query.path : '';
       if (!p) {
         res.status(400).json({ error: 'missing path' });
         return;
@@ -116,10 +140,30 @@ export class HarnessServer {
           : 500;
         res.status(status).json({ error: msg });
       }
     });
 
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
     });
 
@@ -157,10 +201,30 @@ export class HarnessServer {
   close(): void {
     this.wss.close();
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
         pending.resolve({ toolCallId: id, approved: false });
         this.pendingHITL.delete(id);
@@ -189,31 +253,113 @@ export class HarnessServer {
         });
       });
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
         ...this.loop.config,
         hitlCallback,
@@ -225,37 +371,152 @@ export class HarnessServer {
         },
       });
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
             type: 'result',
             payload: {
               status: result.status,
               rounds: result.rounds,
               messages: result.messages,
               feedbackHistory: result.feedbackHistory,
+              checkpoint,
             },
           }));
         }
       } catch (err) {
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
       }
     } else if (msg.type === 'cancel') {
diff --git a/src/server/types.ts b/src/server/types.ts
index 903885d..e25c01d 100644
--- a/src/server/types.ts
+++ b/src/server/types.ts
@@ -1,13 +1,28 @@
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
   type: 'hitl_response';
   payload: { toolCallId: string; approved: boolean; modifiedArgs?: Record<string, unknown> };
diff --git a/src/tools/dispatcher.ts b/src/tools/dispatcher.ts
index bbadf05..7e74356 100644
--- a/src/tools/dispatcher.ts
+++ b/src/tools/dispatcher.ts
@@ -26,6 +26,10 @@ export class ToolDispatcher {
         description: tool.description,
         parameters: tool.parameters,
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
diff --git a/tests/tools/dispatcher.test.ts b/tests/tools/dispatcher.test.ts
index ffac286..e181fa5 100644
--- a/tests/tools/dispatcher.test.ts
+++ b/tests/tools/dispatcher.test.ts
@@ -18,10 +18,29 @@ describe('ToolDispatcher', () => {
   it('throws on unknown tool', async () => {
     const dispatcher = new ToolDispatcher([]);
     await expect(dispatcher.dispatch('unknown', {})).rejects.toThrow('Unknown tool: unknown');
   });
 
+  it('listTools returns registered tools', () => {
+    const readTool: Tool = {
+      name: 'read_file',
+      description: 'Read a file',
+      parameters: { type: 'object', properties: { path: { type: 'string' } } },
+      execute: async () => ({ tool_call_id: '', content: '' }),
+    };
+    const writeTool: Tool = {
+      name: 'write_file',
+      description: 'Write a file',
+      parameters: { type: 'object', properties: { path: { type: 'string' } } },
+      execute: async () => ({ tool_call_id: '', content: '' }),
+    };
+    const dispatcher = new ToolDispatcher([readTool, writeTool]);
+    const tools = dispatcher.listTools();
+    expect(tools).toHaveLength(2);
+    expect(tools.map((t) => t.name).sort()).toEqual(['read_file', 'write_file']);
+  });
+
   it('returns tool definitions for LLM context', () => {
     const readTool: Tool = {
       name: 'read_file',
       description: 'Read a file',
       parameters: {

