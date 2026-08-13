import type { AgentLoop, ProgressCallback, RoundProgress } from '../agent/loop';
import type { Message } from '../agent/types';
import { parseStageOutput, decideGate } from './artifacts';
import type { StageArtifact } from './artifacts';
import type { AgentRole } from './roles';

export interface OrchestratorStatus {
  phase: string;
  roles: Record<AgentRole, 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error'>;
  retryCount: number;
  maxRetries: number;
  lastGate?: { from: string; reason: string };
}

export interface OrchestrationResult {
  status: 'completed' | 'failed' | 'cancelled';
  stages: StageArtifact[];
  retries: number;
  messages: Message[];
  progressEvents: RoundProgress[];
}

const ROLE_ORDER: AgentRole[] = ['coder', 'reviewer', 'tester'];

const ARTIFACT_INSTRUCTION =
  'When finished, end your reply with a line: ARTIFACT: {"summary":"...","findings":[...],"testStatus":"pass"|"fail"|"skipped"} as appropriate for your role.';

function idleRoles(): OrchestratorStatus['roles'] {
  return { coder: 'idle', reviewer: 'idle', tester: 'idle' };
}

function lastAssistantContent(messages: Message[]): string {
  for (let i = messages.length - 1; i >= 0; i--) {
    if (messages[i].role === 'assistant') {
      return messages[i].content;
    }
  }
  return '';
}

function phaseForRole(role: AgentRole): string {
  return role === 'reviewer' ? 'review_running' : role === 'tester' ? 'test_running' : 'coder_running';
}

export class Orchestrator {
  private cancelled = false;
  private currentLoop: AgentLoop | null = null;

  constructor(
    private deps: {
      createLoop: (role: AgentRole, onProgress: ProgressCallback) => AgentLoop;
      maxRetries: number;
      onStatus?: (s: OrchestratorStatus) => void;
      getChangedFiles?: () => string[];
    },
  ) {}

  cancel(): void {
    this.cancelled = true;
    this.currentLoop?.cancel();
  }

  async run(
    task: string,
    options?: { priorMessages?: Message[]; roles?: AgentRole[] },
  ): Promise<OrchestrationResult> {
    this.cancelled = false;
    const stages: StageArtifact[] = [];
    const progressEvents: RoundProgress[] = [];
    let messages: Message[] = [...(options?.priorMessages ?? [])];
    let retries = 0;
    let retryCount = 0;
    const getChangedFiles = this.deps.getChangedFiles ?? (() => []);
    const roleOrder: AgentRole[] = (options?.roles?.length
      ? ROLE_ORDER.filter((r) => options.roles!.includes(r))
      : ROLE_ORDER);
    if (roleOrder.length === 0) {
      return { status: 'failed', stages, retries, messages, progressEvents };
    }

    const emitStatus = (partial: Partial<OrchestratorStatus> & { phase: string }) => {
      this.deps.onStatus?.({
        roles: idleRoles(),
        retryCount,
        maxRetries: this.deps.maxRetries,
        ...partial,
      });
    };

    emitStatus({ phase: 'idle' });

    while (true) {
      if (this.cancelled) {
        return { status: 'cancelled', stages, retries, messages, progressEvents };
      }

      let pipelineComplete = true;

      for (const role of roleOrder) {
        if (this.cancelled) {
          return { status: 'cancelled', stages, retries, messages, progressEvents };
        }

        const roles = idleRoles();
        roles[role] = 'running';
        emitStatus({ phase: phaseForRole(role), roles });

        const onProgress: ProgressCallback = (event) => {
          progressEvents.push({ ...event, agentRole: role });
        };

        this.currentLoop = this.deps.createLoop(role, onProgress);
        const coderTask =
          role === roleOrder[0]
            ? `${task}\n\n${ARTIFACT_INSTRUCTION}`
            : `Continue the pipeline for: ${task}\n\n${ARTIFACT_INSTRUCTION}`;

        const loopResult = await this.currentLoop.run(coderTask, {
          priorMessages: messages,
          agentRole: role,
        });
        this.currentLoop = null;

        if (loopResult.status === 'cancelled' || this.cancelled) {
          messages = loopResult.messages;
          return { status: 'cancelled', stages, retries, messages, progressEvents };
        }

        if (loopResult.status !== 'completed') {
          messages = loopResult.messages;
          const rolesFailed = idleRoles();
          rolesFailed[role] = 'error';
          emitStatus({ phase: 'failed', roles: rolesFailed });
          return { status: 'failed', stages, retries, messages, progressEvents };
        }

        messages = loopResult.messages;
        const changedFiles = getChangedFiles();
        const content = lastAssistantContent(loopResult.messages);
        const { artifact, parseOk } = parseStageOutput(role, content, changedFiles);
        stages.push(artifact);

        const gate = decideGate(artifact, parseOk);
        if (gate.action === 'retry_coder' || gate.action === 'retry_artifact') {
          const rolesAfter = idleRoles();
          rolesAfter[role] = 'blocked';

          if (gate.action === 'retry_coder' && !roleOrder.includes('coder')) {
            emitStatus({ phase: 'failed', roles: rolesAfter, lastGate: { from: role, reason: gate.reason } });
            return { status: 'failed', stages, retries, messages, progressEvents };
          }

          if (retryCount >= this.deps.maxRetries) {
            emitStatus({ phase: 'failed', roles: rolesAfter, lastGate: { from: role, reason: gate.reason } });
            return { status: 'failed', stages, retries, messages, progressEvents };
          }

          retryCount++;
          retries++;
          emitStatus({
            phase: 'retry',
            roles: rolesAfter,
            lastGate: { from: role, reason: gate.reason },
          });

          const retryInstruction =
            gate.action === 'retry_artifact'
              ? `Your output could not be parsed. Please provide a valid ARTIFACT line or JSON block.`
              : `Gate rejected (${role}): ${gate.reason}. Please fix and resubmit.`;

          messages = [
            ...messages,
            { role: 'user', content: retryInstruction },
          ];
          pipelineComplete = false;
          break;
        }

        const rolesDone = idleRoles();
        for (const r of roleOrder) {
          rolesDone[r] = stages.some((s) => s.role === r) ? 'done' : r === role ? 'done' : 'idle';
        }
        emitStatus({ phase: phaseForRole(role), roles: rolesDone });
      }

      if (pipelineComplete) {
        const completedRoles = idleRoles();
        for (const r of roleOrder) completedRoles[r] = 'done';
        emitStatus({
          phase: 'completed',
          roles: completedRoles,
        });
        return { status: 'completed', stages, retries, messages, progressEvents };
      }
    }
  }
}
