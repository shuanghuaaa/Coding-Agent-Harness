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
      execute: async (args) => ({ tool_call_id: '', content: String(args.text) }),
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