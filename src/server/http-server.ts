import express from 'express';
import http from 'http';
import path from 'path';
import type { AddressInfo } from 'node:net';
import { WebSocketServer, WebSocket } from 'ws';
import { AgentLoop } from '../agent/loop';
import type { HITLRequest, HITLResponse, RoundProgress, RunResult } from '../agent/loop';
import type { SessionStore, SessionData } from './session-store';
import type { WSMessage } from './types';
import { readWorkspaceFile } from '../workspace/read-file';
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
  private workspaceRoot: string;
  private token: string;
  private pendingHITL: Map<string, PendingHITL> = new Map();
  private runningLoops: Map<WebSocket, AgentLoop> = new Map();
  public readonly ready: Promise<void>;

  constructor(
    loop: AgentLoop,
    port: number = 3000,
    sessionStore?: SessionStore,
    workspaceRoot: string = process.cwd(),
  ) {
    this.loop = loop;
    this.sessionStore = sessionStore;
    this.workspaceRoot = workspaceRoot;
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

    const requireToken: express.RequestHandler = (req, res, next) => {
      if (!this.token) {
        next();
        return;
      }
      const auth = req.headers.authorization;
      const bearer = auth?.startsWith('Bearer ') ? auth.slice(7) : undefined;
      const queryToken = typeof req.query.token === 'string' ? req.query.token : undefined;
      if (bearer === this.token || queryToken === this.token) {
        next();
        return;
      }
      res.status(401).json({ error: 'unauthorized' });
    };

    if (this.sessionStore) {
      const store = this.sessionStore;
      this.app.get('/api/sessions', requireToken, (_req, res) => {
        res.json(store.list());
      });
      this.app.get('/api/sessions/:id', requireToken, (req, res) => {
        const id = Number(req.params.id);
        const record = Number.isInteger(id) ? store.get(id) : undefined;
        if (!record) {
          res.status(404).json({ error: 'session not found' });
          return;
        }
        res.json(record);
      });
      this.app.delete('/api/sessions/:id', requireToken, (req, res) => {
        const id = Number(req.params.id);
        const ok = Number.isInteger(id) ? store.delete(id) : false;
        if (!ok) {
          res.status(404).json({ error: 'session not found' });
          return;
        }
        res.json({ ok: true });
      });
    }

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
