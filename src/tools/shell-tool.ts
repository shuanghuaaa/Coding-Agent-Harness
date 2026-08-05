import type { Tool } from './base';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

export const shellTool: Tool = {
  name: 'shell',
  description: 'Execute a shell command and return the output',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'The shell command to execute' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const { command } = args as { command: string };
    try {
      const { stdout } = await execAsync(command, {
        timeout: 30000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { tool_call_id: '', content: stdout };
    } catch (error: unknown) {
      const err = error as { message: string; stdout?: string; stderr?: string };
      return {
        tool_call_id: '',
        content: err.stdout || '',
        error: err.stderr || err.message,
      };
    }
  },
};