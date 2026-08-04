import type { Message } from './types';

export interface ContextBuilderConfig {
  systemPrompt: string;
  configRules: string[];
  memories: string[];
  toolDefinitions: Array<{
    type: 'function';
    function: { name: string; description: string; parameters: unknown };
  }>;
}

export class ContextBuilder {
  constructor(private config: ContextBuilderConfig) {}

  build(history: Message[]): Message[] {
    const systemContent = [
      this.config.systemPrompt,
      '',
      '## Project Rules',
      ...this.config.configRules.map((r) => `- ${r}`),
      '',
      '## Project Memory',
      ...this.config.memories.map((m) => `- ${m}`),
    ].join('\n');

    const systemMessage: Message = {
      role: 'system',
      content: systemContent,
      tool_calls: undefined,
    };

    const userMessage: Message = {
      role: 'user',
      content: JSON.stringify(this.config.toolDefinitions),
      tool_calls: undefined,
    };

    return [systemMessage, userMessage, ...history];
  }
}