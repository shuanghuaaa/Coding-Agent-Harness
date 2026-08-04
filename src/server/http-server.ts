import express from 'express';
import http from 'http';
import path from 'path';
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

    this.app.use(express.static(path.join(__dirname, '../../webui/dist')));
    this.app.get('*', (_req, res) => {
      res.sendFile(path.join(__dirname, '../../webui/dist/index.html'));
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