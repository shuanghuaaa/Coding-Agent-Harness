import { describe, it, expect } from 'vitest';
import { MockLLM } from '../../src/llm/mock-llm';
import type { Message } from '../../src/agent/types';

describe('MockLLM', () => {
  it('returns preset responses in order', async () => {
    const responses = [
      {
        content: null,
        tool_calls: [{ id: '1', name: 'read_file', arguments: { path: 'test.ts' } }],
        finish_reason: 'tool_calls' as const,
      },
      {
        content: 'Task complete.',
        tool_calls: [],
        finish_reason: 'stop' as const,
      },
    ];
    const llm = new MockLLM(responses);
    const msgs: Message[] = [{ role: 'user', content: 'hello' }];

    const r1 = await llm.chat(msgs);
    expect(r1.tool_calls).toHaveLength(1);
    expect(r1.tool_calls[0].name).toBe('read_file');

    const r2 = await llm.chat(msgs);
    expect(r2.content).toBe('Task complete.');
    expect(r2.finish_reason).toBe('stop');
  });

  it('throws when no more responses', async () => {
    const llm = new MockLLM([]);
    await expect(llm.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('No more mock responses');
  });

  it('tracks received messages', async () => {
    const llm = new MockLLM([
      { content: 'ok', tool_calls: [], finish_reason: 'stop' },
    ]);
    await llm.chat([{ role: 'user', content: 'test' }]);
    expect(llm.receivedMessages).toHaveLength(1);
    expect(llm.receivedMessages[0][0].content).toBe('test');
  });
});