import type { LLMProvider, ToolDefinition } from './provider';
import type { Message, LLMResponse, ToolCall } from '../agent/types';
import { logger } from '../utils/logger';

export interface OpenAIConfig {
  apiKey: string;
  baseURL?: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

const DEFAULT_MODEL = 'gpt-4o';
const DEFAULT_MAX_TOKENS = 4096;

export class OpenAICompatibleProvider implements LLMProvider {
  private config: OpenAIConfig;
  private baseURL: string;
  private model: string;

  constructor(config: OpenAIConfig) {
    this.config = config;
    this.baseURL = config.baseURL || 'https://api.openai.com/v1';
    this.model = config.model || DEFAULT_MODEL;

    if (!config.apiKey) {
      throw new Error('OpenAICompatibleProvider requires an API key');
    }
  }

  async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(this.convertMessage),
      max_tokens: this.config.maxTokens ?? DEFAULT_MAX_TOKENS,
      temperature: this.config.temperature ?? 0.2,
    };

    if (tools && tools.length > 0) {
      body.tools = tools;
      body.tool_choice = 'auto';
    }

    const url = `${this.baseURL}/chat/completions`;
    logger.debug('LLM request', { model: this.model, messageCount: messages.length, toolCount: tools?.length ?? 0 });

    const response = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const errorText = await response.text();
      logger.error('LLM API error', { status: response.status, body: errorText });
      throw new Error(`LLM API error (${response.status}): ${errorText}`);
    }

    const data = await response.json() as {
      choices: Array<{
        message: {
          content: string | null;
          tool_calls?: Array<{
            id: string;
            function: { name: string; arguments: string };
          }>;
        };
        finish_reason: string;
      }>;
    };

    const choice = data.choices?.[0];
    if (!choice) {
      throw new Error('LLM API returned no choices');
    }

    const finishReason = this.mapFinishReason(choice.finish_reason);
    const toolCalls: ToolCall[] = (choice.message.tool_calls || []).map((tc) => ({
      id: tc.id,
      name: tc.function.name,
      arguments: JSON.parse(tc.function.arguments),
    }));

    return {
      content: choice.message.content,
      tool_calls: toolCalls,
      finish_reason: finishReason,
    };
  }

  private convertMessage(msg: Message): Record<string, unknown> {
    const base: Record<string, unknown> = {
      role: msg.role,
      content: msg.content,
    };

    if (msg.tool_calls && msg.tool_calls.length > 0) {
      base.tool_calls = msg.tool_calls.map((tc) => ({
        id: tc.id,
        type: 'function',
        function: {
          name: tc.name,
          arguments: JSON.stringify(tc.arguments),
        },
      }));
    }

    if (msg.tool_call_id) {
      base.tool_call_id = msg.tool_call_id;
    }

    return base;
  }

  private mapFinishReason(reason: string): 'stop' | 'tool_calls' | 'length' {
    if (reason === 'tool_calls') return 'tool_calls';
    if (reason === 'length') return 'length';
    return 'stop';
  }
}