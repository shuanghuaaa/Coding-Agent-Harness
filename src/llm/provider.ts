import type { Message, LLMResponse } from '../agent/types';

export interface ToolDefinition {
  type: 'function';
  function: {
    name: string;
    description: string;
    parameters: unknown;
  };
}

export interface LLMProvider {
  chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse>;
}