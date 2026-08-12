import type { Message } from './types';
import type { MemoryEntry } from '../memory/types';
import type { MemoryRetriever } from '../memory/retriever';

export interface ContextBuilderConfig {
  systemPrompt: string;
  configRules: string[];
  memoryEntries?: MemoryEntry[];
  retriever?: MemoryRetriever;
  maxMemories?: number;
}

export class ContextBuilder {
  constructor(private config: ContextBuilderConfig) {}

  build(history: Message[], task?: string): Message[] {
    const memoryLines = this.resolveMemories(task);
    const systemContent = [
      this.config.systemPrompt,
      '',
      '## Project Rules',
      ...this.config.configRules.map((r) => `- ${r}`),
      '',
      '## Project Memory',
      ...memoryLines.map((m) => `- ${m}`),
    ].join('\n');

    const systemMessage: Message = { role: 'system', content: systemContent };
    return [systemMessage, ...history];
  }

  private resolveMemories(task?: string): string[] {
    const entries = this.config.memoryEntries ?? [];
    if (entries.length === 0) return [];

    if (task && this.config.retriever) {
      const max = this.config.maxMemories ?? 5;
      const relevant = this.config.retriever.retrieve(task, entries, max);
      return relevant.map((e) => `${e.key}: ${e.value}`);
    }

    return entries.map((e) => `${e.key}: ${e.value}`);
  }
}
