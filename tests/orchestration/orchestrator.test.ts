import { describe, it, expect } from 'vitest';
import { Orchestrator } from '../../src/orchestration/orchestrator';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import { ROLE_DEFINITIONS } from '../../src/orchestration/roles';
import type { AgentRole } from '../../src/orchestration/roles';
import type { Message, LLMResponse } from '../../src/agent/types';
import type { ProgressCallback } from '../../src/agent/loop';
import type { ToolDefinition } from '../../src/llm/provider';

function artifactResponse(payload: Record<string, unknown>): LLMResponse {
  return {
    content: `Done.\nARTIFACT: ${JSON.stringify(payload)}`,
    tool_calls: [],
    finish_reason: 'stop',
  };
}

class SlowMockLLM extends MockLLM {
  constructor(
    responses: LLMResponse[],
    private delayMs: number,
  ) {
    super(responses);
  }

  override async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
    return super.chat(messages, tools);
  }
}

function makeLoopFactory(responses: LLMResponse[], llm?: MockLLM) {
  const mockLLM = llm ?? new MockLLM(responses);

  const createLoop = (role: AgentRole, onProgress: ProgressCallback) =>
    new AgentLoop({
      llm: mockLLM,
      dispatcher: new ToolDispatcher([]),
      contextBuilder: new ContextBuilder({
        systemPrompt: ROLE_DEFINITIONS[role].systemPrompt,
        configRules: [],
        memoryEntries: [],
      }),
      stopCondition: new StopCondition({ maxRounds: 5 }),
      validator: new FeedbackValidator(),
      injector: new FeedbackInjector(),
      onProgress,
    });

  return { createLoop, mockLLM };
}

describe('Orchestrator', () => {
  it('happy path: coder → reviewer → tester completed', async () => {
    const { createLoop } = makeLoopFactory([
      artifactResponse({ summary: 'Implemented feature' }),
      artifactResponse({ summary: 'Looks good', findings: [] }),
      artifactResponse({ summary: 'All green', testStatus: 'pass' }),
    ]);

    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
    const result = await orch.run('Add foo');

    expect(result.status).toBe('completed');
    expect(result.retries).toBe(0);
    expect(result.stages).toHaveLength(3);
    expect(result.stages.map((s) => s.role)).toEqual(['coder', 'reviewer', 'tester']);
    expect(result.stages[2].testStatus).toBe('pass');
    expect(result.progressEvents.some((e) => e.agentRole === 'coder')).toBe(true);
    expect(result.progressEvents.some((e) => e.agentRole === 'reviewer')).toBe(true);
    expect(result.progressEvents.some((e) => e.agentRole === 'tester')).toBe(true);
  });

  it('review block then retry coder then success', async () => {
    const { createLoop } = makeLoopFactory([
      artifactResponse({ summary: 'First attempt' }),
      artifactResponse({
        summary: 'Issues found',
        findings: [{ severity: 'block', message: 'unsafe API' }],
      }),
      artifactResponse({ summary: 'Fixed issue' }),
      artifactResponse({ summary: 'Approved', findings: [] }),
      artifactResponse({ summary: 'Tests pass', testStatus: 'pass' }),
    ]);

    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
    const result = await orch.run('Fix bar');

    expect(result.status).toBe('completed');
    expect(result.retries).toBe(1);
    expect(result.stages.filter((s) => s.role === 'coder')).toHaveLength(2);
    expect(result.messages.some((m) => m.role === 'user' && m.content.includes('unsafe API'))).toBe(
      true,
    );
  });

  it('test fail until maxRetries exhausted → failed', async () => {
    const responses: LLMResponse[] = [];
    for (let attempt = 0; attempt < 3; attempt++) {
      responses.push(artifactResponse({ summary: `code v${attempt}` }));
      responses.push(artifactResponse({ summary: 'Review ok', findings: [] }));
      responses.push(artifactResponse({ summary: 'Tests failed', testStatus: 'fail' }));
    }

    const { createLoop } = makeLoopFactory(responses);
    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
    const result = await orch.run('Ship baz');

    expect(result.status).toBe('failed');
    expect(result.retries).toBe(2);
    expect(result.stages.filter((s) => s.role === 'tester')).toHaveLength(3);
    expect(result.stages.filter((s) => s.role === 'tester' && s.testStatus === 'fail')).toHaveLength(
      3,
    );
  });

  it('cancel mid-run returns cancelled', async () => {
    const slowLLM = new SlowMockLLM(
      [
        artifactResponse({ summary: 'Still working' }),
        artifactResponse({ summary: 'Should not reach' }),
      ],
      50,
    );
    const { createLoop } = makeLoopFactory([], slowLLM);

    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
    const runPromise = orch.run('Cancel me');
    orch.cancel();
    const result = await runPromise;

    expect(result.status).toBe('cancelled');
    expect(result.stages).toHaveLength(0);
  });

  it('pipeline with unparseable output fails after maxRetries', async () => {
    const unparseable: LLMResponse = {
      content: 'Just a plain text response without any artifact structure.',
      tool_calls: [],
      finish_reason: 'stop',
    };

    const responses: LLMResponse[] = [unparseable, unparseable, unparseable];

    const { createLoop } = makeLoopFactory(responses);
    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
    const result = await orch.run('Fix qux');

    expect(result.status).toBe('failed');
    expect(result.retries).toBe(2);
    expect(result.messages.some((m) => m.role === 'user' && m.content.includes('could not be parsed'))).toBe(true);
  });
});
