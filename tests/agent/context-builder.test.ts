import { describe, it, expect } from 'vitest';
import { ContextBuilder } from '../../src/agent/context-builder';
import type { MemoryEntry } from '../../src/memory/types';

describe('ContextBuilder', () => {
  it('builds messages with system prompt, config, and memory', () => {
    const memories: MemoryEntry[] = [
      { id: 1, key: 'test-framework', value: 'Project uses vitest', category: 'convention', created_at: '', updated_at: '' },
      { id: 2, key: 'code-style', value: 'Prefer arrow functions', category: 'preference', created_at: '', updated_at: '' },
    ];

    const builder = new ContextBuilder({
      systemPrompt: 'You are a coding agent.',
      configRules: ['Use TypeScript', 'No any types'],
      memoryEntries: memories,
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
