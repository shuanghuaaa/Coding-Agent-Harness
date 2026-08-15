import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { HarnessServer } from '../../src/server/http-server';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';

function makeLoop(): AgentLoop {
  return new AgentLoop({
    llm: new MockLLM([{ content: 'done', tool_calls: [], finish_reason: 'stop' }]),
    dispatcher: new ToolDispatcher([]),
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

describe('POST /api/workspace/import', () => {
  let server: HarnessServer;
  let base: string;
  const imported: string[] = [];

  beforeEach(async () => {
    server = new HarnessServer(makeLoop(), 0);
    await server.ready;
    base = `http://127.0.0.1:${server.port}`;
  });

  afterEach(() => {
    server.close();
    for (const dir of imported) {
      rmSync(dir, { recursive: true, force: true });
    }
    imported.length = 0;
  });

  it('uploads files onto the server and switches the workspace', async () => {
    const res = await fetch(`${base}/api/workspace/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'demo',
        files: [
          { path: 'demo/hello.ts', content: 'export const hi = 1;\n' },
          { path: 'demo/readme.md', content: '# demo\n' },
        ],
      }),
    });

    expect(res.status).toBe(200);
    const body = (await res.json()) as { path: string; written: number };
    expect(body.written).toBe(2);
    expect(body.path.length).toBeGreaterThan(0);
    imported.push(body.path);

    expect(readFileSync(join(body.path, 'hello.ts'), 'utf8')).toBe('export const hi = 1;\n');

    const root = await (await fetch(`${base}/api/workspace/root`)).json();
    expect(root.path).toBe(body.path);
  });

  it('writes a file back into the imported workspace', async () => {
    const created = await fetch(`${base}/api/workspace/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'edit',
        files: [{ path: 'edit/a.ts', content: 'const a = 1;\n' }],
      }),
    });
    const body = (await created.json()) as { path: string };
    imported.push(body.path);

    const put = await fetch(`${base}/api/workspace/file`, {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ path: 'a.ts', content: 'const a = 2;\n' }),
    });
    expect(put.status).toBe(200);
    expect(readFileSync(join(body.path, 'a.ts'), 'utf8')).toBe('const a = 2;\n');
  });

  it('rejects an empty upload', async () => {
    const res = await fetch(`${base}/api/workspace/import`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'empty', files: [] }),
    });
    expect(res.status).toBe(400);
  });
});
