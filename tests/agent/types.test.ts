// tests/agent/types-test.ts
import { describe, it, expect } from 'vitest';
import type { Message, ToolCall, AgentState } from '../../src/agent/types';

describe('Agent types', () => {
  it('Message type compiles with correct shape', () => {
    const msg: Message = {
      role: 'user',
      content: 'hello',
    };
    expect(msg.role).toBe('user');
    expect(msg.content).toBe('hello');
  });

  it('ToolCall type compiles with correct shape', () => {
    const tc: ToolCall = {
      id: 'call_1',
      name: 'write_file',
      arguments: { path: 'test.ts', content: 'const x = 1;' },
    };
    expect(tc.name).toBe('write_file');
    expect(tc.arguments.path).toBe('test.ts');
  });

  it('AgentState type compiles with correct shape', () => {
    const state: AgentState = {
      messages: [{ role: 'user', content: 'hello' }],
      currentRound: 0,
      maxRounds: 10,
      status: 'running',
    };
    expect(state.currentRound).toBe(0);
    expect(state.maxRounds).toBe(10);
    expect(state.status).toBe('running');
  });
});