import type { ToolResult } from '../agent/types';

export interface ToolParameter {
  type: string;
  description?: string;
  properties?: Record<string, ToolParameter>;
  required?: string[];
  enum?: string[];
}

export interface Tool {
  name: string;
  description: string;
  parameters: ToolParameter;
  execute(args: Record<string, unknown>): Promise<ToolResult>;
}