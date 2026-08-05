import type { Message } from './types';
import type { ToolDefinition } from '../llm/provider';

export interface ContextBuilderConfig {
  systemPrompt: string;
  configRules: string[];
  memories: string[];
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
    };

    return [systemMessage, ...history];
  }
}