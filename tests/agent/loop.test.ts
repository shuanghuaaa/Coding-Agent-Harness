import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import type { Tool } from '../../src/tools/base';

function makeBasicLoop(mockLLM: MockLLM, tools: Tool[] = []) {
  const dispatcher = new ToolDispatcher(tools);
  return new AgentLoop({
    llm: mockLLM,
    dispatcher,
    contextBuilder: new ContextBuilder({
      systemPrompt: 'You are a helpful agent.',
      configRules: [],
      memoryEntries: [],
    }),
    stopCondition: new StopCondition({ maxRounds: 10 }),
    validator: new FeedbackValidator(),
    injector: new FeedbackInjector(),
  });
}

describe('AgentLoop', () => {
  it('completes a simple task in one round', async () => {
    const mockLLM = new MockLLM([
      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
    ]);

    const loop = makeBasicLoop(mockLLM);
    const result = await loop.run('Say hello');

    expect(result.status).toBe('completed');
    expect(result.rounds).toBe(1);
    expect(result.messages.length).toBeGreaterThan(0);
  });

  it('returns max_rounds when limit reached', async () => {
    const responses = Array.from({ length: 10 }, () => ({
      content: null,
      tool_calls: [{ id: '1', name: 'echo', arguments: { text: 'hi' } }],
      finish_reason: 'tool_calls' as const,
    }));
    const mockLLM = new MockLLM(responses);

    const echoTool: Tool = {
      name: 'echo',
      description: 'echo',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (args) => ({ tool_call_id: '', content: String((args as { text: string }).text) }),
    };

    const loop = makeBasicLoop(mockLLM, [echoTool]);
    const result = await loop.run('Long task');

    expect(result.status).toBe('max_rounds');
    expect(result.rounds).toBe(10);
  });

  it('resets cancelled flag at start of each run', async () => {
    const mockLLM = new MockLLM([
      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
    ]);

    const loop = makeBasicLoop(mockLLM);
    loop.cancel();
    const result = await loop.run('Task');

    expect(result.status).toBe('completed');
  });

  it('returns cancelled when cancel() called mid-loop', async () => {
    const mockLLM = new MockLLM([
      { content: null, tool_calls: [{ id: '1', name: 'echo', arguments: { text: 'hi' } }], finish_reason: 'tool_calls' },
      { content: 'Should not reach', tool_calls: [], finish_reason: 'stop' },
    ]);

    const echoTool: Tool = {
      name: 'echo',
      description: 'echo',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (args) => {
        loop.cancel();
        return { tool_call_id: '', content: String((args as { text: string }).text) };
      },
    };

    const loop = makeBasicLoop(mockLLM, [echoTool]);
    const result = await loop.run('Task');

    expect(result.status).toBe('cancelled');
  });
});