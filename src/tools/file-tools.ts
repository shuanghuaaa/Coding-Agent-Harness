import type { Tool } from './base';
import * as fs from 'fs';
import * as path from 'path';

let workspaceRoot = process.cwd();

export function setWorkspaceRoot(root: string): void {
  workspaceRoot = root;
}

export function resolveWorkspacePath(inputPath: string, root: string = workspaceRoot): string {
  const resolved = path.resolve(root, inputPath);
  const relative = path.relative(path.resolve(root), resolved);
  if (relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`Path traversal blocked: ${inputPath}`);
  }
  return resolved;
}

function resolvePath(inputPath: string): string {
  return resolveWorkspacePath(inputPath);
}

export const readFileTool: Tool = {
  name: 'read_file',
  description: 'Read the contents of a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to read' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const raw = (args as { path: string }).path;
    try {
      const safePath = resolvePath(raw);
      const content = fs.readFileSync(safePath, 'utf-8');
      return { tool_call_id: '', content };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { tool_call_id: '', content: '', error: `Failed to read file: ${err.message}` };
    }
  },
};

export const writeFileTool: Tool = {
  name: 'write_file',
  description: 'Create or overwrite a file with content',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to write' },
      content: { type: 'string', description: 'The content to write' },
    },
    required: ['path', 'content'],
  },
  execute: async (args) => {
    const { content } = args as { path: string; content: string };
    const raw = (args as { path: string }).path;
    try {
      const safePath = resolvePath(raw);
      const dir = path.dirname(safePath);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(safePath, content, 'utf-8');
      return { tool_call_id: '', content: `File written: ${safePath}` };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { tool_call_id: '', content: '', error: `Failed to write file: ${err.message}` };
    }
  },
};

export const deleteFileTool: Tool = {
  name: 'delete_file',
  description: 'Delete a file',
  parameters: {
    type: 'object',
    properties: {
      path: { type: 'string', description: 'The file path to delete' },
    },
    required: ['path'],
  },
  execute: async (args) => {
    const raw = (args as { path: string }).path;
    try {
      const safePath = resolvePath(raw);
      fs.unlinkSync(safePath);
      return { tool_call_id: '', content: `File deleted: ${safePath}` };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { tool_call_id: '', content: '', error: `Failed to delete file: ${err.message}` };
    }
  },
};