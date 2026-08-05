import type { LLMProvider, ToolDefinition } from './provider';
import type { Message, LLMResponse } from '../agent/types';

export class MockLLM implements LLMProvider {
  private responses: LLMResponse[];
  private index: number = 0;
  public receivedMessages: Message[][] = [];
  public receivedTools: Array<ToolDefinition[] | undefined> = [];

  constructor(responses: LLMResponse[]) {
    this.responses = responses;
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    this.receivedMessages.push([...messages]);
    this.receivedTools.push(tools);
    if (this.index >= this.responses.length) {
      throw new Error('No more mock responses available');
    }
    return this.responses[this.index++];
  }

  reset(): void {
    this.index = 0;
    this.receivedMessages = [];
    this.receivedTools = [];
  }
}