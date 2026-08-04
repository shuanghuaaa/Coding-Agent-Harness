import type { Tool } from './base';
import type { ToolResult } from '../agent/types';

export class ToolDispatcher {
  private tools: Map<string, Tool> = new Map();

  constructor(tools: Tool[]) {
    for (const tool of tools) {
      this.tools.set(tool.name, tool);
    }
  }

  async dispatch(name: string, args: Record<string, unknown>): Promise<ToolResult> {
    const tool = this.tools.get(name);
    if (!tool) {
      throw new Error(`Unknown tool: ${name}`);
    }
    return tool.execute(args);
  }

  getDefinitions(): Array<{ type: 'function'; function: { name: string; description: string; parameters: unknown } }> {
    return Array.from(this.tools.values()).map((tool) => ({
      type: 'function' as const,
      function: {
        name: tool.name,
        description: tool.description,
        parameters: tool.parameters,
      },
    }));
  }
}