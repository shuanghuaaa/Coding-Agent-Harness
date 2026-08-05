import type { Tool } from './base';
import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';

const execAsync = promisify(exec);

export const searchTool: Tool = {
  name: 'search',
  description: 'Search for a pattern in files using grep',
  parameters: {
    type: 'object',
    properties: {
      pattern: { type: 'string', description: 'Search pattern (regex)' },
      path: { type: 'string', description: 'Directory to search in' },
    },
    required: ['pattern'],
  },
  execute: async (args) => {
    const { pattern, path: searchPath = '.' } = args as { pattern: string; path?: string };
    try {
      const { stdout } = await execAsync(`rg "${pattern}" "${searchPath}" --no-heading -n`, {
        timeout: 10000,
      });
      return { tool_call_id: '', content: stdout };
    } catch (_rgError: unknown) {
      try {
        const results = searchInDirectory(searchPath, pattern);
        return { tool_call_id: '', content: results.join('\n') };
      } catch (err: unknown) {
        const e = err as { message: string };
        return { tool_call_id: '', content: '', error: e.message || 'Search failed' };
      }
    }
  },
};

function searchInDirectory(dir: string, pattern: string): string[] {
  const results: string[] = [];
  const regex = new RegExp(pattern);
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory() && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
      results.push(...searchInDirectory(fullPath, pattern));
    } else if (entry.isFile()) {
      try {
        const content = fs.readFileSync(fullPath, 'utf-8');
        const lines = content.split('\n');
        lines.forEach((line, i) => {
          if (regex.test(line)) {
            results.push(`${fullPath}:${i + 1}:${line.trim()}`);
          }
        });
      } catch {
        // Skip binary/unreadable files
      }
    }
  }
  return results;
}

export const gitDiffTool: Tool = {
  name: 'git_diff',
  description: 'Show git working tree changes',
  parameters: {
    type: 'object',
    properties: {},
  },
  execute: async () => {
    try {
      const { stdout } = await execAsync('git diff', { timeout: 10000 });
      return { tool_call_id: '', content: stdout || '(no changes)' };
    } catch (error: unknown) {
      const err = error as { message: string };
      return { tool_call_id: '', content: '', error: err.message };
    }
  },
};

export const runTestTool: Tool = {
  name: 'run_test',
  description: 'Run tests and return the results',
  parameters: {
    type: 'object',
    properties: {
      command: { type: 'string', description: 'Test command to run (e.g. npm test)' },
    },
    required: ['command'],
  },
  execute: async (args) => {
    const { command } = args as { command: string };
    try {
      const { stdout } = await execAsync(command, {
        timeout: 60000,
        maxBuffer: 10 * 1024 * 1024,
      });
      return { tool_call_id: '', content: stdout };
    } catch (error: unknown) {
      const err = error as { message: string; stdout?: string; stderr?: string };
      return {
        tool_call_id: '',
        content: err.stdout || '',
        error: err.stderr || err.message || 'Tests failed',
      };
    }
  },
};