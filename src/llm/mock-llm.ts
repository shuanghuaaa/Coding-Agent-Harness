import type { LLMProvider } from './provider';
import type { Message, LLMResponse } from '../agent/types';

export class MockLLM implements LLMProvider {
  private responses: LLMResponse[];
  private index: number = 0;
  public receivedMessages: Message[][] = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(messages: Message[]): Promise<LLMResponse> {
    this.receivedMessages.push([...messages]);
    if (this.index >= this.responses.length) {
      throw new Error('No more mock responses available');
    }
    return this.responses[this.index++];
  }
}