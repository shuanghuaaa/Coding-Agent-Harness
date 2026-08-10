import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';

function makeLoop(responses: ConstructorParameters<typeof MockLLM>[0]) {
  return new AgentLoop({
    llm: new MockLLM(responses),
    dispatcher: new ToolDispatcher([]),
    contextBuilder: new ContextBuilder({ systemPrompt: 'sys', configRules: [], memories: [] }),
    stopCondition: new StopCondition({ maxRounds: 5 }),
    validator: new FeedbackValidator(),
    injector: new FeedbackInjector(),
  });
}

describe('AgentLoop resume', () => {
  it('appends new user turn after prior messages', async () => {
    const loop = makeLoop([{ content: 'continued', tool_calls: [], finish_reason: 'stop' }]);
    const result = await loop.run('follow up', {
      priorMessages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer1' },
      ],
    });
    expect(result.status).toBe('completed');
    const users = result.messages.filter((m) => m.role === 'user').map((m) => m.content);
    expect(users).toContain('first');
    expect(users[users.length - 1]).toBe('follow up');
    expect(result.messages.some((m) => m.role === 'system')).toBe(true);
  });
});
