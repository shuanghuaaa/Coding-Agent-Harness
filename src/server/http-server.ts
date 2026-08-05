import express from 'express';
import http from 'http';
import path from 'path';
import { WebSocketServer, WebSocket } from 'ws';
import type { AgentLoop } from '../agent/loop';
import type { WSMessage } from './types';
import { logger } from '../utils/logger';

export class HarnessServer {
  private app: express.Application;
  private server: http.Server;
  private wss: WebSocketServer;
  private loop: AgentLoop;
  private token: string;

  constructor(loop: AgentLoop, port: number = 3000) {
    this.loop = loop;
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
        logger.info('WebSocket client disconnected');
      });
    });

    this.server.listen(port, () => {
      logger.info(`Harness server running on port ${port}`);
    });
  }

  private async handleMessage(ws: WebSocket, msg: WSMessage): Promise<void> {
    if (msg.type === 'task') {
      const { task } = msg.payload as { task: string };
      logger.info('Agent task received', { task: task.substring(0, 100) });
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'running' } }));

      try {
        const result = await this.loop.run(task);
        logger.info('Agent task completed', { status: result.status, rounds: result.rounds });

        ws.send(JSON.stringify({
          type: 'result',
          payload: {
            status: result.status,
            rounds: result.rounds,
            messages: result.messages,
            feedbackHistory: result.feedbackHistory,
          },
        }));
      } catch (err) {
        logger.error('Agent task failed', { error: String(err) });
        ws.send(JSON.stringify({
          type: 'status',
          payload: { status: 'error', error: String(err) },
        }));
      }
    } else if (msg.type === 'cancel') {
      logger.info('Agent task cancelled');
      this.loop.cancel();
      ws.send(JSON.stringify({ type: 'status', payload: { status: 'cancelled' } }));
    }
  }
}