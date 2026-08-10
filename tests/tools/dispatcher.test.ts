import { describe, it, expect } from 'vitest';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import type { Tool } from '../../src/tools/base';

describe('ToolDispatcher', () => {
  it('dispatches to correct tool by name', async () => {
    const echoTool: Tool = {
      name: 'echo',
      description: 'echoes input',
      parameters: { type: 'object', properties: { text: { type: 'string' } } },
      execute: async (args) => ({ tool_call_id: '', content: `echo: ${args.text}` }),
    };
    const dispatcher = new ToolDispatcher([echoTool]);
    const result = await dispatcher.dispatch('echo', { text: 'hello' });
    expect(result.content).toBe('echo: hello');
  });

  it('throws on unknown tool', async () => {
    const dispatcher = new ToolDispatcher([]);
    await expect(dispatcher.dispatch('unknown', {})).rejects.toThrow('Unknown tool: unknown');
  });

  it('listTools returns registered tools', () => {
    const readTool: Tool = {
      name: 'read_file',
      description: 'Read a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: async () => ({ tool_call_id: '', content: '' }),
    };
    const writeTool: Tool = {
      name: 'write_file',
      description: 'Write a file',
      parameters: { type: 'object', properties: { path: { type: 'string' } } },
      execute: async () => ({ tool_call_id: '', content: '' }),
    };
    const dispatcher = new ToolDispatcher([readTool, writeTool]);
    const tools = dispatcher.listTools();
    expect(tools).toHaveLength(2);
    expect(tools.map((t) => t.name).sort()).toEqual(['read_file', 'write_file']);
  });

  it('returns tool definitions for LLM context', () => {
    const readTool: Tool = {
      name: 'read_file',
      description: 'Read a file',
      parameters: {
        type: 'object',
        properties: { path: { type: 'string', description: 'File path' } },
        required: ['path'],
      },
      execute: async () => ({ tool_call_id: '', content: '' }),
    };
    const dispatcher = new ToolDispatcher([readTool]);
    const defs = dispatcher.getDefinitions();
    expect(defs).toHaveLength(1);
    expect(defs[0].type).toBe('function');
    expect(defs[0].function.name).toBe('read_file');
  });
});