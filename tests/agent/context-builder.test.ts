import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../../src/agent/context-builder';

describe('ContextBuilder', () => {
  it('builds messages with system prompt, config, and memory', () => {
    const builder = new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: ['Use TypeScript', 'No any types'],
      memories: ['Project uses vitest', 'Prefer arrow functions'],
    });

    const messages = builder.build([{ role: 'user', content: 'Write add function' }]);

    expect(messages).toHaveLength(2);
    const systemMsg = messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('You are a coding agent');
    expect(systemMsg.content).toContain('Use TypeScript');
    expect(systemMsg.content).toContain('Project uses vitest');

    const userMsg = messages[1];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Write add function');
  });
});