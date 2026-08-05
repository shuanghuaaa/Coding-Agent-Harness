import type { LLMProvider, ToolDefinition } from '../llm/provider';
import type { ToolDispatcher } from '../tools/dispatcher';
import type { ContextBuilder } from './context-builder';
import type { StopCondition } from './stop-condition';
import type { FeedbackValidator } from '../feedback/validator';
import type { FeedbackInjector } from '../feedback/injector';
import { guardrail } from '../guard/guardrail';
import type { Message } from './types';

export interface HITLRequest {
  toolCallId: string;
  toolName: string;
  arguments: Record<string, unknown>;
  reason: string;
  severity: 'high' | 'critical';
}

export interface HITLResponse {
  toolCallId: string;
  approved: boolean;
  modifiedArgs?: Record<string, unknown>;
}

export type HITLCallback = (request: HITLRequest) => Promise<HITLResponse>;

export interface AgentLoopConfig {
  llm: LLMProvider;
  dispatcher: ToolDispatcher;
  contextBuilder: ContextBuilder;
  stopCondition: StopCondition;
  validator: FeedbackValidator;
  injector: FeedbackInjector;
  feedbackToolNames?: string[];
  hitlCallback?: HITLCallback;
}

export interface RunResult {
  status: 'completed' | 'max_rounds' | 'error' | 'cancelled';
  rounds: number;
  messages: Message[];
  feedbackHistory: Array<{ round: number; status: string }>;
}

export class AgentLoop {
  private messages: Message[] = [];
  private feedbackHistory: Array<{ round: number; status: string }> = [];
  private cancelled = false;
  private feedbackToolNames: string[];

  /** Exposed for HITL-aware server to rebuild with a hitlCallback */
  public readonly config: AgentLoopConfig;

  constructor(config: AgentLoopConfig) {
    this.config = config;
    this.feedbackToolNames = config.feedbackToolNames ?? ['run_test'];
  }

  async run(task: string): Promise<RunResult> {
    this.messages = this.config.contextBuilder.build([
      { role: 'user', content: task },
    ]);

    const tools: ToolDefinition[] = this.config.dispatcher.getDefinitions();

    let round = 0;
    const maxRounds = this.config.stopCondition.getMaxRounds();

    while (round < maxRounds) {
      round++;

      const response = await this.config.llm.chat(this.messages, tools);
      this.messages.push({
        role: 'assistant',
        content: response.content ?? '',
        tool_calls: response.tool_calls,
      });

      const stopResult = this.config.stopCondition.shouldStop(
        round,
        response.finish_reason,
        this.cancelled
      );

      if (stopResult.stop) {
        return this.buildResult(stopResult.reason, round);
      }

      if (response.tool_calls.length === 0) {
        return {
          status: 'completed',
          rounds: round,
          messages: this.messages,
          feedbackHistory: this.feedbackHistory,
        };
      }

      for (const toolCall of response.tool_calls) {
        const guardResult = guardrail(toolCall.name, toolCall.arguments);

        if (guardResult.blocked) {
          if (this.config.hitlCallback) {
            const hitlResponse = await this.config.hitlCallback({
              toolCallId: toolCall.id,
              toolName: toolCall.name,
              arguments: toolCall.arguments,
              reason: guardResult.reason,
              severity: guardResult.severity,
            });

            if (hitlResponse.approved) {
              const args = hitlResponse.modifiedArgs ?? toolCall.arguments;
              await this.executeToolCall(toolCall.id, toolCall.name, args, round);
            } else {
              this.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: `BLOCKED (user rejected): ${guardResult.reason}`,
              });
            }
          } else {
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: `BLOCKED: ${guardResult.reason}`,
            });
          }
          continue;
        }

        await this.executeToolCall(toolCall.id, toolCall.name, toolCall.arguments, round);
      }

      if (this.cancelled) {
        return {
          status: 'cancelled',
          rounds: round,
          messages: this.messages,
          feedbackHistory: this.feedbackHistory,
        };
      }
    }

    return {
      status: 'max_rounds',
      rounds: round,
      messages: this.messages,
      feedbackHistory: this.feedbackHistory,
    };
  }

  private async executeToolCall(
    callId: string,
    name: string,
    args: Record<string, unknown>,
    round: number,
  ): Promise<void> {
    const result = await this.config.dispatcher.dispatch(name, args);
    this.messages.push({
      role: 'tool',
      tool_call_id: callId,
      content: result.content,
    });

    if (this.feedbackToolNames.includes(name)) {
      const feedback = this.config.validator.validate(
        result.content,
        round,
        result.error
      );
      this.feedbackHistory.push({
        round,
        status: feedback.status,
      });
      this.config.injector.inject(this.messages, feedback);
    }
  }

  private buildResult(reason: string, round: number): RunResult {
    let status: RunResult['status'] = 'completed';
    if (this.cancelled) {
      status = 'cancelled';
    } else if (reason.startsWith('Max rounds')) {
      status = 'max_rounds';
    }
    return {
      status,
      rounds: round,
      messages: this.messages,
      feedbackHistory: this.feedbackHistory,
    };
  }

  cancel(): void {
    this.cancelled = true;
  }
}