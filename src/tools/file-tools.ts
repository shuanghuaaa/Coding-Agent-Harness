import type { Tool } from './base';
import * as fs from 'fs';

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
    const { path: filePath } = args as { path: string };
    try {
      const content = fs.readFileSync(filePath, 'utf-8');
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
    const { path: filePath, content } = args as { path: string; content: string };
    try {
      const dir = filePath.includes('/') ? filePath.substring(0, filePath.lastIndexOf('/')) : '';
      if (dir) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(filePath, content, 'utf-8');
      return { tool_call_id: '', content: `File written: ${filePath}` };
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
    const { path: filePath } = args as { path: string };
    try {
      fs.unlinkSync(filePath);
      return { tool_call_id: '', content: `File deleted: ${filePath}` };
    } catch (error: unknown) {
      const err = error as NodeJS.ErrnoException;
      return { tool_call_id: '', content: '', error: `Failed to delete file: ${err.message}` };
    }
  },
};