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
import { shellTool } from '../../src/tools/shell-tool';

const emptyData: SessionData = { progressEvents: [], feedbackHistory: [], messages: [] };

function makeLoop(responses: LLMResponse[], tools: Tool[] = []): AgentLoop {
  return new AgentLoop({
    llm: new MockLLM(responses),
    dispatcher: new ToolDispatcher(tools),
    contextBuilder: new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: [],
      memoryEntries: [],
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

  it('cancel during HITL approval wait resolves and saves a cancelled session', async () => {
    store = new SessionStore(':memory:');
    server = new HarnessServer(
      makeLoop([
        {
          content: null,
          tool_calls: [{ id: 'c1', name: 'shell', arguments: { command: 'rm -rf /' } }],
          finish_reason: 'tool_calls',
        },
        { content: 'should not reach', tool_calls: [], finish_reason: 'stop' },
      ], [shellTool]),
      0,
      store,
    );
    await server.ready;

    const ws = new WebSocket(`ws://127.0.0.1:${server.port}`);
    const resultPromise = waitForResult(ws);
    ws.on('open', () => {
      ws.send(JSON.stringify({ type: 'task', payload: { task: 'delete everything' } }));
    });
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString());
      if (msg.type === 'hitl_request') {
        ws.send(JSON.stringify({ type: 'cancel' }));
      }
    });
    const result = await resultPromise;
    ws.close();

    expect(result.status).toBe('cancelled');
    expect(store.list()).toHaveLength(1);
    expect(store.list()[0].status).toBe('cancelled');
  });
});
