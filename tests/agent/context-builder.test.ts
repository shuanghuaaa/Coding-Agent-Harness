import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../../src/agent/context-builder';

describe('ContextBuilder', () => {
  it('builds messages with system prompt, config, memory, and tools', () => {
    const builder = new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: ['Use TypeScript', 'No any types'],
      memories: ['Project uses vitest', 'Prefer arrow functions'],
      toolDefinitions: [
        { type: 'function' as const, function: { name: 'read_file', description: 'Read a file', parameters: {} } },
      ],
    });

    const messages = builder.build([{ role: 'user', content: 'Write add function' }]);

    expect(messages).toHaveLength(3);
    const systemMsg = messages[0];
    expect(systemMsg.role).toBe('system');
    expect(systemMsg.content).toContain('You are a coding agent');
    expect(systemMsg.content).toContain('Use TypeScript');
    expect(systemMsg.content).toContain('Project uses vitest');

    const toolMsg = messages[1];
    expect(toolMsg.role).toBe('user');
    expect(toolMsg.content).toContain('read_file');

    const userMsg = messages[2];
    expect(userMsg.role).toBe('user');
    expect(userMsg.content).toBe('Write add function');
  });
});