import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import type { Tool } from '../../src/tools/base';
import type { HITLRequest, HITLResponse } from '../../src/agent/loop';

function makeHITLLoop(
  mockLLM: MockLLM,
  hitlCallback: (req: HITLRequest) => Promise<HITLResponse>,
  tools: Tool[] = [],
) {
  const dispatcher = new ToolDispatcher(tools);
  return new AgentLoop({
    llm: mockLLM,
    dispatcher,
    contextBuilder: new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: [],
      memoryEntries: [],
    }),
    stopCondition: new StopCondition({ maxRounds: 10 }),
    validator: new FeedbackValidator(),
    injector: new FeedbackInjector(),
    hitlCallback,
  });
}

describe('HITL (Human-in-the-Loop)', () => {
  it('calls hitlCallback when guardrail blocks a dangerous action', async () => {
    let capturedRequest: HITLRequest | null = null;

    const mockLLM = new MockLLM([
      {
        content: null,
        tool_calls: [{ id: '1', name: 'shell', arguments: { command: 'rm -rf /' } }],
        finish_reason: 'tool_calls',
      },
      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
    ]);

    const loop = makeHITLLoop(mockLLM, async (req) => {
      capturedRequest = req;
      return { toolCallId: req.toolCallId, approved: false };
    });

    await loop.run('Delete everything');

    expect(capturedRequest).not.toBeNull();
    expect(capturedRequest!.toolName).toBe('shell');
    expect(capturedRequest!.severity).toBe('critical');
    expect(capturedRequest!.reason).toContain('rm_rf');
  });

  it('executes approved dangerous action', async () => {
    let executed = false;

    const shellTool: Tool = {
      name: 'shell',
      description: 'Execute shell command',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      execute: async () => {
        executed = true;
        return { tool_call_id: '', content: 'ok' };
      },
    };

    const mockLLM = new MockLLM([
      {
        content: null,
        tool_calls: [{ id: '1', name: 'shell', arguments: { command: 'rm -rf /tmp' } }],
        finish_reason: 'tool_calls',
      },
      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
    ]);

    const loop = makeHITLLoop(mockLLM, async (req) => {
      return { toolCallId: req.toolCallId, approved: true };
    }, [shellTool]);

    const result = await loop.run('Clean temp');

    expect(executed).toBe(true);
    expect(result.status).toBe('completed');
  });

  it('blocks rejected dangerous action', async () => {
    const mockLLM = new MockLLM([
      {
        content: null,
        tool_calls: [{ id: '1', name: 'shell', arguments: { command: 'rm -rf /' } }],
        finish_reason: 'tool_calls',
      },
      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
    ]);

    const loop = makeHITLLoop(mockLLM, async (req) => {
      return { toolCallId: req.toolCallId, approved: false };
    });

    const result = await loop.run('Dangerous task');

    const hasBlockedMsg = result.messages.some(
      (m) => m.role === 'tool' && m.content.includes('user rejected')
    );
    expect(hasBlockedMsg).toBe(true);
  });

  it('supports modified arguments on approval', async () => {
    let receivedArgs: Record<string, unknown> = {};

    const shellTool: Tool = {
      name: 'shell',
      description: 'Execute shell command',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      execute: async (args) => {
        receivedArgs = args;
        return { tool_call_id: '', content: 'ok' };
      },
    };

    const mockLLM = new MockLLM([
      {
        content: null,
        tool_calls: [{ id: '1', name: 'shell', arguments: { command: 'sudo rm -rf /' } }],
        finish_reason: 'tool_calls',
      },
      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
    ]);

    const loop = makeHITLLoop(mockLLM, async (req) => {
      return {
        toolCallId: req.toolCallId,
        approved: true,
        modifiedArgs: { command: 'rm -rf /tmp/safe' },
      };
    }, [shellTool]);

    await loop.run('Safe cleanup');

    expect(receivedArgs).toEqual({ command: 'rm -rf /tmp/safe' });
  });
});