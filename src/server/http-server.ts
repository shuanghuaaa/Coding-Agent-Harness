import express from 'express';
import http from 'http';
import path from 'path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentLoop } from '../agent/loop';
import type { HITLRequest, HITLResponse, ProgressCallback, RoundProgress, RunResult } from '../agent/loop';
import type { SessionStore, SessionData } from './session-store';
import type { CredentialStore } from '../credentials/store';
import type { WSMessage } from './types';
import { WorkspaceCheckpoint, type Checkpoint, type CheckpointDiff } from '../workspace/checkpoint';
import { buildFileTree } from '../workspace/file-tree';
import { readWorkspaceFile } from '../workspace/read-file';
import { assertDirectory, browseDirectory } from '../workspace/browse';
import { setWorkspaceRoot } from '../tools/file-tools';
import { Orchestrator } from '../orchestration/orchestrator';
import type { OrchestrationResult } from '../orchestration/orchestrator';
import { filterToolsForRole, ROLE_DEFINITIONS } from '../orchestration/roles';
import type { AgentRole } from '../orchestration/roles';
import { ToolDispatcher } from '../tools/dispatcher';
import { ContextBuilder } from '../agent/context-builder';
import type { Message } from '../agent/types';
import { logger } from '../utils/logger';

interface PendingHITL {
  request: HITLRequest;
  resolve: (response: HITLResponse) => void;
  ws: WebSocket;
}

interface Cancellable {
  cancel(): void;
}

export class HarnessServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private loop: AgentLoop;
  private sessionStore?: SessionStore;
  private credentialStore?: CredentialStore;
  private checkpoint: WorkspaceCheckpoint;
  private workspaceRoot: string;
  private initialWorkspaceRoot: string;
  private pendingHITL: Map<string, PendingHITL> = new Map();
  private runningLoops: Map<WebSocket, Cancellable> = new Map();
  private checkpoints: Map<string, Checkpoint> = new Map();
  public readonly ready: Promise<void>;

  constructor(
    loop: AgentLoop,
    port: number = 3000,
    sessionStore?: SessionStore,
    workspaceRoot: string = process.cwd(),
    credentialStore?: CredentialStore,
  ) {
    this.loop = loop;
    this.sessionStore = sessionStore;
    this.credentialStore = credentialStore;
    this.workspaceRoot = workspaceRoot;
    this.initialWorkspaceRoot = workspaceRoot;
    this.checkpoint = new WorkspaceCheckpoint(workspaceRoot);

    this.app = express();
    this.server = http.createServer(this.app);
    this.wss = new WebSocketServer({ server: this.server });

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

    this.app.post('/api/credentials', async (req, res) => {
      if (!this.credentialStore) {
        res.status(501).json({ error: 'credential store not available' });
        return;
      }
      try {
        const { service, account, password } = req.body;
        if (!service || !account || !password) {
          res.status(400).json({ error: 'missing service, account, or password' });
          return;
        }
        await this.credentialStore.set(service, account, password);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get('/api/credentials/status', async (req, res) => {
      if (!this.credentialStore) {
        res.json({ configured: false });
        return;
      }
      try {
        const service = typeof req.query.service === 'string' ? req.query.service : 'llm';
        const account = typeof req.query.account === 'string' ? req.query.account : 'openai';
        const key = await this.credentialStore.get(service, account);
        res.json({ configured: key !== null && key.length > 0 });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.delete('/api/credentials', async (req, res) => {
      if (!this.credentialStore) {
        res.status(501).json({ error: 'credential store not available' });
        return;
      }
      try {
        const { service, account } = req.body;
        if (!service || !account) {
          res.status(400).json({ error: 'missing service or account' });
          return;
        }
        await this.credentialStore.delete(service, account);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get('/api/workspace/files', (_req, res) => {
      try {
        res.json(buildFileTree(this.workspaceRoot));
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

    this.app.get('/api/workspace/file', (req, res) => {
      const p = typeof req.query.path === 'string' ? req.query.path : '';
      if (!p) {
        res.status(400).json({ error: 'missing path' });
        return;
      }
      try {
        res.json(readWorkspaceFile(this.workspaceRoot, p));
      } catch (err) {
        const msg = String(err);
        const status = /traversal|blocked|not a file/i.test(msg) ? 400
          : /not found/i.test(msg) ? 404
          : /too large|binary/i.test(msg) ? 415
          : 500;
        res.status(status).json({ error: msg });
      }
    });

    this.app.get('/api/workspace/root', (_req, res) => {
      res.json({ path: this.workspaceRoot });
    });

    this.app.post('/api/workspace/root', (req, res) => {
      if (req.body?.clear === true) {
        this.setWorkspace(this.initialWorkspaceRoot);
        res.json({ path: this.workspaceRoot, cleared: true });
        return;
      }
      const raw = typeof req.body?.path === 'string' ? req.body.path : '';
      if (!raw.trim()) {
        res.status(400).json({ error: 'missing path' });
        return;
      }
      try {
        const abs = assertDirectory(raw);
        this.setWorkspace(abs);
        res.json({ path: this.workspaceRoot });
      } catch (err) {
        const msg = String(err);
        const status = /not found|not a directory/i.test(msg) ? 400 : 500;
        res.status(status).json({ error: msg });
      }
    });

    this.app.get('/api/workspace/browse', (req, res) => {
      const p = typeof req.query.path === 'string' ? req.query.path : '';
      try {
        res.json(browseDirectory(p));
      } catch (err) {
        const msg = String(err);
        const status = /not found|not a directory|cannot read/i.test(msg) ? 400 : 500;
        res.status(status).json({ error: msg });
      }
    });

    this.app.post('/api/checkpoint/rollback', (req, res) => {
      const id = req.body?.id as string | undefined;
      if (!id) {
        res.status(400).json({ error: 'missing checkpoint id' });
        return;
      }
      const cp = this.checkpoints.get(id);
      if (!cp) {
        res.status(404).json({ error: 'checkpoint not found' });
        return;
      }
      try {
        this.checkpoint.rollback(cp);
        this.checkpoints.delete(id);
        res.json({ ok: true });
      } catch (err) {
        res.status(500).json({ error: String(err) });
      }
    });

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

  private setWorkspace(absPath: string): void {
    this.workspaceRoot = absPath;
    setWorkspaceRoot(absPath);
    this.checkpoint = new WorkspaceCheckpoint(absPath);
    this.checkpoints.clear();
    logger.info('Workspace root changed', { path: absPath });
  }

  private tryCreateCheckpoint(): Checkpoint | null {
    try {
      return this.checkpoint.create();
    } catch (err) {
      logger.warn('Failed to create checkpoint', { error: String(err) });
      return null;
    }
  }

  private buildDiff(cp: Checkpoint | null): (CheckpointDiff & { id: string }) | null {
    if (!cp) return null;
    try {
      const diff = this.checkpoint.diff(cp);
      return { id: cp.id, ...diff };
    } catch (err) {
      logger.warn('Failed to build checkpoint diff', { error: String(err) });
      return null;
    }
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

  private loadPriorMessages(sessionId?: number): Message[] {
    if (sessionId === undefined || !this.sessionStore) return [];
    const record = this.sessionStore.get(sessionId);
    return record?.data.messages ?? [];
  }

  private persistSession(
    task: string,
    status: string,
    rounds: number,
    data: SessionData,
    sessionId?: number,
  ): number | undefined {
    if (!this.sessionStore) return undefined;
    try {
      const id = this.sessionStore.saveOrUpdate(sessionId, { task, status, rounds, data });
      logger.info(sessionId !== undefined ? 'Session updated' : 'Session saved', { id, status, rounds });
      return id;
    } catch (err) {
      logger.error('Failed to save session', { error: String(err) });
      return undefined;
    }
  }

  private saveSession(
    task: string,
    result: RunResult,
    progressEvents: RoundProgress[],
    sessionId?: number,
  ): number | undefined {
    return this.persistSession(
      task,
      result.status,
      result.rounds,
      {
        progressEvents,
        feedbackHistory: result.feedbackHistory,
        messages: result.messages,
      },
      sessionId,
    );
  }

  private saveOrchestrationSession(
    task: string,
    result: OrchestrationResult,
    sessionId?: number,
  ): number | undefined {
    return this.persistSession(
      task,
      result.status,
      result.progressEvents.length,
      {
        progressEvents: result.progressEvents,
        feedbackHistory: [],
        messages: result.messages,
      },
      sessionId,
    );
  }

  private rejectIfBusy(ws: WebSocket): boolean {
    if (!this.runningLoops.has(ws)) return false;
    if (ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'error', error: 'busy' } }));
    }
    return true;
  }

  private createRoleLoop(
    ws: WebSocket,
    role: AgentRole,
    allTools: ReturnType<ToolDispatcher['listTools']>,
    hitlCallback: (request: HITLRequest) => Promise<HITLResponse>,
    onProgress: ProgressCallback,
  ): AgentLoop {
    return new AgentLoop({
      ...this.loop.config,
      contextBuilder: new ContextBuilder({
        systemPrompt: ROLE_DEFINITIONS[role].systemPrompt,
        configRules: [],
        memoryEntries: [],
      }),
      dispatcher: new ToolDispatcher(filterToolsForRole(role, allTools)),
      hitlCallback,
      onProgress,
    });
  }

  private async handleMessage(ws: WebSocket, msg: WSMessage): Promise<void> {
    if (msg.type === 'task') {
      if (this.rejectIfBusy(ws)) return;

      const { task, sessionId, agentRole } = msg.payload as {
        task: string;
        sessionId?: number;
        agentRole?: AgentRole;
      };
      const priorMessages = this.loadPriorMessages(sessionId);
      logger.info('Agent task received', { task: task.substring(0, 100), sessionId, agentRole });
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));

      const cp = this.tryCreateCheckpoint();
      if (cp) this.checkpoints.set(cp.id, cp);

      const hitlCallback = this.createHITLCallback(ws);
      const progressEvents: RoundProgress[] = [];
      const onProgress: ProgressCallback = (event) => {
        const withRole = agentRole ? { ...event, agentRole } : event;
        progressEvents.push(withRole);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: 'progress', payload: withRole }));
        }
      };

      const allTools = this.loop.config.dispatcher.listTools();
      const loopWithHITL = agentRole
        ? this.createRoleLoop(ws, agentRole, allTools, hitlCallback, onProgress)
        : new AgentLoop({
            ...this.loop.config,
            hitlCallback,
            onProgress,
          });
      this.runningLoops.set(ws, loopWithHITL);

      try {
        const result = await loopWithHITL.run(task, {
          priorMessages,
          ...(agentRole ? { agentRole } : {}),
        });
        logger.info('Agent task completed', { status: result.status, rounds: result.rounds });
        const savedSessionId = this.saveSession(task, result, progressEvents, sessionId);
        const checkpoint = this.buildDiff(cp);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'result',
            payload: {
              status: result.status,
              rounds: result.rounds,
              messages: result.messages,
              feedbackHistory: result.feedbackHistory,
              checkpoint,
              ...(savedSessionId !== undefined ? { sessionId: savedSessionId } : {}),
            },
          }));
        }
      } catch (err) {
        logger.error('Agent task failed', { error: String(err) });
        const savedSessionId = this.saveSession(
          task,
          { status: 'error', rounds: progressEvents.length, messages: priorMessages, feedbackHistory: [] },
          progressEvents,
          sessionId,
        );
        const checkpoint = this.buildDiff(cp);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'status',
            payload: { status: 'error', error: String(err) },
          }));
          if (checkpoint) {
            ws.send(JSON.stringify({
              type: 'result',
              payload: {
                status: 'error',
                rounds: progressEvents.length,
                messages: priorMessages,
                feedbackHistory: [],
                checkpoint,
                ...(savedSessionId !== undefined ? { sessionId: savedSessionId } : {}),
              },
            }));
          }
        }
      } finally {
        this.runningLoops.delete(ws);
      }
    } else if (msg.type === 'orchestrate') {
      if (this.rejectIfBusy(ws)) return;

      const { task, maxRetries, sessionId, roles } = msg.payload as {
        task: string;
        maxRetries?: number;
        sessionId?: number;
        roles?: AgentRole[];
      };
      const resolvedMaxRetries = maxRetries ?? Number(process.env.ORCHESTRATOR_MAX_RETRIES ?? 2);
      const priorMessages = this.loadPriorMessages(sessionId);
      logger.info('Orchestration task received', {
        task: task.substring(0, 100),
        sessionId,
        maxRetries: resolvedMaxRetries,
        roles,
      });
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));

      const cp = this.tryCreateCheckpoint();
      if (cp) this.checkpoints.set(cp.id, cp);

      const hitlCallback = this.createHITLCallback(ws);
      const allTools = this.loop.config.dispatcher.listTools();
      const orchestrator = new Orchestrator({
        maxRetries: resolvedMaxRetries,
        getChangedFiles: () => {
          const d = this.buildDiff(cp);
          return d?.files ?? [];
        },
        onStatus: (status) => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'orchestrator_status', payload: status }));
          }
        },
        createLoop: (role, onProgress) => {
          const roleProgress: ProgressCallback = (event) => {
            onProgress(event);
            if (ws.readyState === WebSocket.OPEN) {
              ws.send(JSON.stringify({ type: 'progress', payload: event }));
            }
          };
          return this.createRoleLoop(ws, role, allTools, hitlCallback, roleProgress);
        },
      });
      this.runningLoops.set(ws, orchestrator);

      try {
        const result = await orchestrator.run(task, {
          priorMessages,
          ...(roles?.length ? { roles } : {}),
        });
        logger.info('Orchestration completed', { status: result.status, retries: result.retries });
        const savedSessionId = this.saveOrchestrationSession(task, result, sessionId);
        const checkpoint = this.buildDiff(cp);

        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'result',
            payload: {
              status: result.status,
              rounds: result.progressEvents.length,
              messages: result.messages,
              feedbackHistory: [],
              checkpoint,
              orchestration: {
                stages: result.stages,
                retries: result.retries,
                status: result.status,
              },
              ...(savedSessionId !== undefined ? { sessionId: savedSessionId } : {}),
            },
          }));
        }
      } catch (err) {
        logger.error('Orchestration failed', { error: String(err) });
        const savedSessionId = this.saveOrchestrationSession(
          task,
          {
            status: 'failed',
            stages: [],
            retries: 0,
            messages: priorMessages,
            progressEvents: [],
          },
          sessionId,
        );
        const checkpoint = this.buildDiff(cp);
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({
            type: 'status',
            payload: { status: 'error', error: String(err) },
          }));
          if (checkpoint) {
            ws.send(JSON.stringify({
              type: 'result',
              payload: {
                status: 'error',
                rounds: 0,
                messages: priorMessages,
                feedbackHistory: [],
                checkpoint,
                ...(savedSessionId !== undefined ? { sessionId: savedSessionId } : {}),
              },
            }));
          }
        }
      } finally {
        this.runningLoops.delete(ws);
      }
    } else if (msg.type === 'cancel') {
      logger.info('Agent task cancelled');
      this.runningLoops.get(ws)?.cancel();
      this.rejectHITLForClient(ws);
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
