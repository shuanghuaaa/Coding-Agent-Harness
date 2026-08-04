import type { Message, LLMResponse } from '../agent/types';

export interface LLMProvider {
  chat(messages: Message[]): Promise<LLMResponse>;
}