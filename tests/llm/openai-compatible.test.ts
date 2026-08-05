import { describe, it, expect, beforeEach, vi } from 'vitest';
import { OpenAICompatibleProvider } from '../../src/llm/openai-compatible';
import type { ToolDefinition } from '../../src/llm/provider';

function mockFetch(response: unknown, status = 200) {
  global.fetch = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    text: async () => JSON.stringify(response),
    json: async () => response,
  });
}

describe('OpenAICompatibleProvider', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('throws when no API key provided', () => {
    expect(() => new OpenAICompatibleProvider({ apiKey: '' })).toThrow('API key');
  });

  it('calls the OpenAI API with correct payload', async () => {
    mockFetch({
      choices: [
        {
          message: { content: 'Hello!', tool_calls: null },
          finish_reason: 'stop',
        },
      ],
    });

    const provider = new OpenAICompatibleProvider({ apiKey: 'sk-test' });
    const result = await provider.chat([{ role: 'user', content: 'hi' }]);

    expect(result.content).toBe('Hello!');
    expect(result.finish_reason).toBe('stop');
    expect(result.tool_calls).toHaveLength(0);
    expect(global.fetch).toHaveBeenCalledTimes(1);
  });

  it('passes tool definitions to the API', async () => {
    mockFetch({
      choices: [
        {
          message: {
            content: null,
            tool_calls: [
              {
                id: 'call_1',
                function: { name: 'read_file', arguments: JSON.stringify({ path: 'test.ts' }) },
              },
            ],
          },
          finish_reason: 'tool_calls',
        },
      ],
    });

    const tools: ToolDefinition[] = [
      {
        type: 'function',
        function: { name: 'read_file', description: 'Read a file', parameters: { type: 'object', properties: {} } },
      },
    ];

    const provider = new OpenAICompatibleProvider({ apiKey: 'sk-test' });
    const result = await provider.chat([{ role: 'user', content: 'read test.ts' }], tools);

    expect(result.finish_reason).toBe('tool_calls');
    expect(result.tool_calls).toHaveLength(1);
    expect(result.tool_calls[0].name).toBe('read_file');
    expect(result.tool_calls[0].arguments).toEqual({ path: 'test.ts' });
  });

  it('converts tool_call messages to OpenAI format', async () => {
    mockFetch({
      choices: [
        {
          message: { content: 'OK', tool_calls: null },
          finish_reason: 'stop',
        },
      ],
    });

    const provider = new OpenAICompatibleProvider({ apiKey: 'sk-test' });
    await provider.chat([
      { role: 'user', content: 'hi' },
      { role: 'assistant', content: '', tool_calls: [{ id: '1', name: 'echo', arguments: { text: 'hi' } }] },
      { role: 'tool', tool_call_id: '1', content: 'hi' },
    ]);

    const callArg = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(callArg.body);
    const msgs = body.messages;

    expect(msgs[1].tool_calls[0].function.arguments).toBe('{"text":"hi"}');
    expect(msgs[2].tool_call_id).toBe('1');
  });

  it('throws on non-200 API response', async () => {
    mockFetch({ error: 'Invalid API key' }, 401);

    const provider = new OpenAICompatibleProvider({ apiKey: 'sk-bad' });
    await expect(provider.chat([{ role: 'user', content: 'hi' }])).rejects.toThrow('401');
  });

  it('supports custom baseURL', async () => {
    mockFetch({
      choices: [{ message: { content: 'OK', tool_calls: null }, finish_reason: 'stop' }],
    });

    const provider = new OpenAICompatibleProvider({
      apiKey: 'sk-test',
      baseURL: 'https://custom.api.com/v1',
    });
    await provider.chat([{ role: 'user', content: 'hi' }]);

    const url = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(url).toBe('https://custom.api.com/v1/chat/completions');
  });

  it('supports custom model', async () => {
    mockFetch({
      choices: [{ message: { content: 'OK', tool_calls: null }, finish_reason: 'stop' }],
    });

    const provider = new OpenAICompatibleProvider({ apiKey: 'sk-test', model: 'gpt-4o-mini' });
    await provider.chat([{ role: 'user', content: 'hi' }]);

    const callArg = (global.fetch as ReturnType<typeof vi.fn>).mock.calls[0][1];
    const body = JSON.parse(callArg.body);
    expect(body.model).toBe('gpt-4o-mini');
  });
});