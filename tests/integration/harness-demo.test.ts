import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';
import { guardrail } from '../../src/guard/guardrail';
import type { Tool } from '../../src/tools/base';

describe('Harness Demo (★ core mechanism)', () => {
  it('① Guardrail blocks dangerous action', () => {
    const result = guardrail('shell', { command: 'rm -rf /' });
    expect(result.blocked).toBe(true);
    if (result.blocked) {
      expect(result.reason).toContain('rm_rf');
      expect(result.severity).toBe('critical');
    }
  });

  it('① Guardrail allows safe actions', () => {
    const result = guardrail('write_file', { path: 'src/test.ts', content: 'x' });
    expect(result.blocked).toBe(false);
  });

  it('② Feedback loop: inject failure → agent corrects → passes', async () => {
    const mockLLM = new MockLLM([
      {
        content: null,
        tool_calls: [
          {
            id: 'call_1',
            name: 'write_file',
            arguments: { path: 'src/math.ts', content: 'export function add(a, b) { return a - b; }' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      {
        content: null,
        tool_calls: [
          {
            id: 'call_2',
            name: 'run_test',
            arguments: { command: 'npm test' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      {
        content: null,
        tool_calls: [
          {
            id: 'call_3',
            name: 'write_file',
            arguments: { path: 'src/math.ts', content: 'export function add(a, b) { return a + b; }' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      {
        content: null,
        tool_calls: [
          {
            id: 'call_4',
            name: 'run_test',
            arguments: { command: 'npm test' },
          },
        ],
        finish_reason: 'tool_calls',
      },
      {
        content: 'All tests passing. Task complete.',
        tool_calls: [],
        finish_reason: 'stop',
      },
    ]);

    const writeTool: Tool = {
      name: 'write_file',
      description: 'Write a file',
      parameters: {
        type: 'object',
        properties: {
          path: { type: 'string' },
          content: { type: 'string' },
        },
        required: ['path', 'content'],
      },
      execute: async (args) => {
        const { path: p } = args as { path: string; content: string };
        return { tool_call_id: '', content: `File written: ${p}` };
      },
    };

    let testCallCount = 0;
    const testTool: Tool = {
      name: 'run_test',
      description: 'Run tests',
      parameters: {
        type: 'object',
        properties: { command: { type: 'string' } },
        required: ['command'],
      },
      execute: async () => {
        testCallCount++;
        if (testCallCount === 1) {
          return {
            tool_call_id: '',
            content: 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12',
            error: 'Tests failed',
          };
        }
        return { tool_call_id: '', content: 'Tests: 3 passed, 3 total' };
      },
    };

    const dispatcher = new ToolDispatcher([writeTool, testTool]);
    const contextBuilder = new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: [],
      memoryEntries: [],
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

    const result = await loop.run('Write an add function');

    expect(result.status).toBe('completed');
    expect(result.feedbackHistory.length).toBe(2);
    expect(result.feedbackHistory[0].status).toBe('fail');
    expect(result.feedbackHistory[1].status).toBe('pass');

    const hasFailureFeedback = result.messages.some(
      (m) => m.role === 'system' && m.content.includes('Tests failed')
    );
    expect(hasFailureFeedback).toBe(true);
  });

  it('③ Feedback loop is deterministic with mock LLM', async () => {
    const makeLoop = () => {
      const mockLLM = new MockLLM([
        {
          content: null,
          tool_calls: [{ id: '1', name: 'run_test', arguments: { command: 'npm test' } }],
          finish_reason: 'tool_calls',
        },
        {
          content: 'Fixed.',
          tool_calls: [],
          finish_reason: 'stop',
        },
      ]);

      const testTool: Tool = {
        name: 'run_test',
        description: 'Run tests',
        parameters: {
          type: 'object',
          properties: { command: { type: 'string' } },
          required: ['command'],
        },
        execute: async () => ({
          tool_call_id: '',
          content: 'FAIL: test_foo expected true got false at test.ts:1:1',
          error: 'Tests failed',
        }),
      };

      const dispatcher = new ToolDispatcher([testTool]);
      const contextBuilder = new ContextBuilder({
        systemPrompt: 'You are a coding agent.',
        configRules: [],
        memoryEntries: [],
      });

      return new AgentLoop({
        llm: mockLLM,
        dispatcher,
        contextBuilder,
        stopCondition: new StopCondition({ maxRounds: 10 }),
        validator: new FeedbackValidator(),
        injector: new FeedbackInjector(),
      });
    };

    const result1 = await makeLoop().run('Test task');
    const result2 = await makeLoop().run('Test task');

    expect(result1.rounds).toBe(result2.rounds);
    expect(result1.status).toBe(result2.status);
    expect(result1.feedbackHistory[0].status).toBe(result2.feedbackHistory[0].status);
  });
});