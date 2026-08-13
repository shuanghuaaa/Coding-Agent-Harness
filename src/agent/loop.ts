import type { LLMProvider, ToolDefinition } from '../llm/provider';
import type { ToolDispatcher } from '../tools/dispatcher';
import type { ContextBuilder } from './context-builder';
import type { StopCondition } from './stop-condition';
import type { FeedbackValidator } from '../feedback/validator';
import type { FeedbackInjector } from '../feedback/injector';
import type { FeedbackHistoryEntry } from '../feedback/types';
import { detectRepeatedFailure } from '../feedback/repeated-failure';
import { toFeedbackHistoryEntry } from '../feedback/summary';
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

export interface RoundProgress {
  round: number;
  assistantContent: string;
  actions: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
  feedback?: FeedbackHistoryEntry;
  agentRole?: string;
}

export interface RunOptions {
  priorMessages?: Message[];
  agentRole?: string;
}

export type ProgressCallback = (event: RoundProgress) => void;

export interface AgentLoopConfig {
  llm: LLMProvider;
  dispatcher: ToolDispatcher;
  contextBuilder: ContextBuilder;
  stopCondition: StopCondition;
  validator: FeedbackValidator;
  injector: FeedbackInjector;
  feedbackToolNames?: string[];
  hitlCallback?: HITLCallback;
  onProgress?: ProgressCallback;
}

export interface RunResult {
  status: 'completed' | 'max_rounds' | 'error' | 'cancelled';
  rounds: number;
  messages: Message[];
  feedbackHistory: FeedbackHistoryEntry[];
}

export class AgentLoop {
  private messages: Message[] = [];
  private feedbackHistory: FeedbackHistoryEntry[] = [];
  private cancelled = false;
  private currentAgentRole?: string;
  private feedbackToolNames: string[];

  /** Exposed for HITL-aware server to rebuild with a hitlCallback */
  public readonly config: AgentLoopConfig;

  constructor(config: AgentLoopConfig) {
    this.config = config;
    this.feedbackToolNames = config.feedbackToolNames ?? ['run_test'];
  }

  async run(task: string, options?: RunOptions): Promise<RunResult> {
    this.cancelled = false;
    this.feedbackHistory = [];
    this.currentAgentRole = options?.agentRole;
    const prior = (options?.priorMessages ?? []).filter((m) => m.role !== 'system');
    this.messages = this.config.contextBuilder.build([
      ...prior,
      { role: 'user', content: task },
    ], task);

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
        this.emitProgress(round, response.content ?? '', []);
        return this.buildResult(stopResult.reason, round);
      }

      if (response.tool_calls.length === 0) {
        this.emitProgress(round, response.content ?? '', []);
        return {
          status: 'completed',
          rounds: round,
          messages: this.messages,
          feedbackHistory: this.feedbackHistory,
        };
      }

      const actions: Array<{ tool: string; result: string }> = [];
      let roundFeedback: string | undefined;
      let roundFeedbackEntry: FeedbackHistoryEntry | undefined;

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
              const executed = await this.executeToolCall(toolCall.id, toolCall.name, args, round);
              actions.push({ tool: toolCall.name, result: executed.content });
              if (executed.feedbackStatus) roundFeedback = executed.feedbackStatus;
              if (executed.feedback) roundFeedbackEntry = executed.feedback;
            } else {
              const blocked = `BLOCKED (user rejected): ${guardResult.reason}`;
              this.messages.push({
                role: 'tool',
                tool_call_id: toolCall.id,
                content: blocked,
              });
              actions.push({ tool: toolCall.name, result: blocked });
            }
          } else {
            const blocked = `BLOCKED: ${guardResult.reason}`;
            this.messages.push({
              role: 'tool',
              tool_call_id: toolCall.id,
              content: blocked,
            });
            actions.push({ tool: toolCall.name, result: blocked });
          }
          continue;
        }

        const executed = await this.executeToolCall(
          toolCall.id,
          toolCall.name,
          toolCall.arguments,
          round,
        );
        actions.push({ tool: toolCall.name, result: executed.content });
        if (executed.feedbackStatus) roundFeedback = executed.feedbackStatus;
        if (executed.feedback) roundFeedbackEntry = executed.feedback;
      }

      this.emitProgress(round, response.content ?? '', actions, roundFeedback, roundFeedbackEntry);

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

  private emitProgress(
    round: number,
    assistantContent: string,
    actions: Array<{ tool: string; result: string }>,
    feedbackStatus?: string,
    feedback?: FeedbackHistoryEntry,
  ): void {
    this.config.onProgress?.({
      round,
      assistantContent,
      actions,
      feedbackStatus,
      feedback,
      agentRole: this.currentAgentRole,
    });
  }

  private async executeToolCall(
    callId: string,
    name: string,
    args: Record<string, unknown>,
    round: number,
  ): Promise<{ content: string; feedbackStatus?: string; feedback?: FeedbackHistoryEntry }> {
    const result = await this.config.dispatcher.dispatch(name, args);
    const content = result.error
      ? `${result.content}\n${result.error}`.trim()
      : result.content;
    this.messages.push({
      role: 'tool',
      tool_call_id: callId,
      content,
    });

    let feedbackStatus: string | undefined;
    let feedbackEntry: FeedbackHistoryEntry | undefined;
    if (this.feedbackToolNames.includes(name)) {
      let feedback = this.config.validator.validate(
        result.content,
        round,
        result.error
      );
      feedback = detectRepeatedFailure(feedback, this.feedbackHistory);
      feedbackEntry = toFeedbackHistoryEntry(feedback);
      this.feedbackHistory.push(feedbackEntry);
      this.config.injector.inject(this.messages, feedback);
      feedbackStatus = feedback.status;
    }
    return { content, feedbackStatus, feedback: feedbackEntry };
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
