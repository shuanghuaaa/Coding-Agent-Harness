import type { LLMProvider, ToolDefinition } from '../llm/provider';
import type { ToolDispatcher } from '../tools/dispatcher';
import type { ContextBuilder } from './context-builder';
import type { StopCondition } from './stop-condition';
import type { FeedbackValidator } from '../feedback/validator';
import type { FeedbackInjector } from '../feedback/injector';
import { guardrail } from '../guard/guardrail';
import type { Message } from './types';

export interface AgentLoopConfig {
  llm: LLMProvider;
  dispatcher: ToolDispatcher;
  contextBuilder: ContextBuilder;
  stopCondition: StopCondition;
  validator: FeedbackValidator;
  injector: FeedbackInjector;
  feedbackToolNames?: string[];
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

  constructor(private config: AgentLoopConfig) {
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
        let status: RunResult['status'] = 'completed';
        if (this.cancelled) {
          status = 'cancelled';
        } else if (stopResult.reason.startsWith('Max rounds')) {
          status = 'max_rounds';
        }
        return {
          status,
          rounds: round,
          messages: this.messages,
          feedbackHistory: this.feedbackHistory,
        };
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
          this.messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: `BLOCKED: ${guardResult.reason}`,
          });
          continue;
        }

        const result = await this.config.dispatcher.dispatch(
          toolCall.name,
          toolCall.arguments
        );
        this.messages.push({
          role: 'tool',
          tool_call_id: toolCall.id,
          content: result.content,
        });

        if (this.feedbackToolNames.includes(toolCall.name)) {
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

  cancel(): void {
    this.cancelled = true;
  }
}