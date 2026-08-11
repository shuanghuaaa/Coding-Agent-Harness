BASE 0e7d56565d9ba45577ef880aad1c9809edb43af9
HEAD 992efacbad469bdb109e320c013687da946bc29e
## Commits
992efac fix(orchestration): fail on loop errors and test cancel
2271966 feat(orchestration): coder-reviewer-tester orchestrator with retries

## Stat
 src/orchestration/orchestrator.ts        | 178 +++++++++++++++++++++++++++++++
 tests/orchestration/orchestrator.test.ts | 141 ++++++++++++++++++++++++
 2 files changed, 319 insertions(+)

## Diff
diff --git a/src/orchestration/orchestrator.ts b/src/orchestration/orchestrator.ts
new file mode 100644
index 0000000..2d3dc0f
--- /dev/null
+++ b/src/orchestration/orchestrator.ts
@@ -0,0 +1,178 @@
+import type { AgentLoop, ProgressCallback, RoundProgress } from '../agent/loop';
+import type { Message } from '../agent/types';
+import { parseStageOutput, decideGate } from './artifacts';
+import type { StageArtifact } from './artifacts';
+import type { AgentRole } from './roles';
+
+export interface OrchestratorStatus {
+  phase: string;
+  roles: Record<AgentRole, 'idle' | 'running' | 'waiting' | 'done' | 'blocked' | 'error'>;
+  retryCount: number;
+  maxRetries: number;
+  lastGate?: { from: string; reason: string };
+}
+
+export interface OrchestrationResult {
+  status: 'completed' | 'failed' | 'cancelled';
+  stages: StageArtifact[];
+  retries: number;
+  messages: Message[];
+  progressEvents: RoundProgress[];
+}
+
+const ROLE_ORDER: AgentRole[] = ['coder', 'reviewer', 'tester'];
+
+const ARTIFACT_INSTRUCTION =
+  'When finished, end your reply with a line: ARTIFACT: {"summary":"...","findings":[...],"testStatus":"pass"|"fail"|"skipped"} as appropriate for your role.';
+
+function idleRoles(): OrchestratorStatus['roles'] {
+  return { coder: 'idle', reviewer: 'idle', tester: 'idle' };
+}
+
+function lastAssistantContent(messages: Message[]): string {
+  for (let i = messages.length - 1; i >= 0; i--) {
+    if (messages[i].role === 'assistant') {
+      return messages[i].content;
+    }
+  }
+  return '';
+}
+
+function phaseForRole(role: AgentRole): string {
+  return role === 'reviewer' ? 'review_running' : role === 'tester' ? 'test_running' : 'coder_running';
+}
+
+export class Orchestrator {
+  private cancelled = false;
+  private currentLoop: AgentLoop | null = null;
+
+  constructor(
+    private deps: {
+      createLoop: (role: AgentRole, onProgress: ProgressCallback) => AgentLoop;
+      maxRetries: number;
+      onStatus?: (s: OrchestratorStatus) => void;
+      getChangedFiles?: () => string[];
+    },
+  ) {}
+
+  cancel(): void {
+    this.cancelled = true;
+    this.currentLoop?.cancel();
+  }
+
+  async run(
+    task: string,
+    options?: { priorMessages?: Message[] },
+  ): Promise<OrchestrationResult> {
+    this.cancelled = false;
+    const stages: StageArtifact[] = [];
+    const progressEvents: RoundProgress[] = [];
+    let messages: Message[] = [...(options?.priorMessages ?? [])];
+    let retries = 0;
+    let retryCount = 0;
+    const getChangedFiles = this.deps.getChangedFiles ?? (() => []);
+
+    const emitStatus = (partial: Partial<OrchestratorStatus> & { phase: string }) => {
+      this.deps.onStatus?.({
+        roles: idleRoles(),
+        retryCount,
+        maxRetries: this.deps.maxRetries,
+        ...partial,
+      });
+    };
+
+    emitStatus({ phase: 'idle' });
+
+    while (true) {
+      if (this.cancelled) {
+        return { status: 'cancelled', stages, retries, messages, progressEvents };
+      }
+
+      let pipelineComplete = true;
+
+      for (const role of ROLE_ORDER) {
+        if (this.cancelled) {
+          return { status: 'cancelled', stages, retries, messages, progressEvents };
+        }
+
+        const roles = idleRoles();
+        roles[role] = 'running';
+        emitStatus({ phase: phaseForRole(role), roles });
+
+        const onProgress: ProgressCallback = (event) => {
+          progressEvents.push({ ...event, agentRole: role });
+        };
+
+        this.currentLoop = this.deps.createLoop(role, onProgress);
+        const coderTask =
+          role === 'coder'
+            ? `${task}\n\n${ARTIFACT_INSTRUCTION}`
+            : `Continue the pipeline for: ${task}\n\n${ARTIFACT_INSTRUCTION}`;
+
+        const loopResult = await this.currentLoop.run(coderTask, {
+          priorMessages: messages,
+          agentRole: role,
+        });
+        this.currentLoop = null;
+
+        if (loopResult.status === 'cancelled' || this.cancelled) {
+          messages = loopResult.messages;
+          return { status: 'cancelled', stages, retries, messages, progressEvents };
+        }
+
+        if (loopResult.status !== 'completed') {
+          messages = loopResult.messages;
+          const rolesFailed = idleRoles();
+          rolesFailed[role] = 'error';
+          emitStatus({ phase: 'failed', roles: rolesFailed });
+          return { status: 'failed', stages, retries, messages, progressEvents };
+        }
+
+        messages = loopResult.messages;
+        const changedFiles = getChangedFiles();
+        const content = lastAssistantContent(loopResult.messages);
+        const { artifact } = parseStageOutput(role, content, changedFiles);
+        stages.push(artifact);
+
+        const gate = decideGate(artifact);
+        if (gate.action === 'retry_coder') {
+          const rolesAfter = idleRoles();
+          rolesAfter[role] = 'blocked';
+
+          if (retryCount >= this.deps.maxRetries) {
+            emitStatus({ phase: 'failed', roles: rolesAfter, lastGate: { from: role, reason: gate.reason } });
+            return { status: 'failed', stages, retries, messages, progressEvents };
+          }
+
+          retryCount++;
+          retries++;
+          emitStatus({
+            phase: 'retry',
+            roles: rolesAfter,
+            lastGate: { from: role, reason: gate.reason },
+          });
+          messages = [
+            ...messages,
+            { role: 'user', content: `Gate rejected (${role}): ${gate.reason}. Please fix and resubmit.` },
+          ];
+          pipelineComplete = false;
+          break;
+        }
+
+        const rolesDone = idleRoles();
+        for (const r of ROLE_ORDER) {
+          rolesDone[r] = stages.some((s) => s.role === r) ? 'done' : r === role ? 'done' : 'idle';
+        }
+        emitStatus({ phase: phaseForRole(role), roles: rolesDone });
+      }
+
+      if (pipelineComplete) {
+        emitStatus({
+          phase: 'completed',
+          roles: { coder: 'done', reviewer: 'done', tester: 'done' },
+        });
+        return { status: 'completed', stages, retries, messages, progressEvents };
+      }
+    }
+  }
+}
diff --git a/tests/orchestration/orchestrator.test.ts b/tests/orchestration/orchestrator.test.ts
new file mode 100644
index 0000000..c7d093c
--- /dev/null
+++ b/tests/orchestration/orchestrator.test.ts
@@ -0,0 +1,141 @@
+import { describe, it, expect } from 'vitest';
+import { Orchestrator } from '../../src/orchestration/orchestrator';
+import { AgentLoop } from '../../src/agent/loop';
+import { MockLLM } from '../../src/llm/mock-llm';
+import { ToolDispatcher } from '../../src/tools/dispatcher';
+import { ContextBuilder } from '../../src/agent/context-builder';
+import { StopCondition } from '../../src/agent/stop-condition';
+import { FeedbackValidator } from '../../src/feedback/validator';
+import { FeedbackInjector } from '../../src/feedback/injector';
+import { ROLE_DEFINITIONS } from '../../src/orchestration/roles';
+import type { AgentRole } from '../../src/orchestration/roles';
+import type { Message, LLMResponse } from '../../src/agent/types';
+import type { ProgressCallback } from '../../src/agent/loop';
+import type { ToolDefinition } from '../../src/llm/provider';
+
+function artifactResponse(payload: Record<string, unknown>): LLMResponse {
+  return {
+    content: `Done.\nARTIFACT: ${JSON.stringify(payload)}`,
+    tool_calls: [],
+    finish_reason: 'stop',
+  };
+}
+
+class SlowMockLLM extends MockLLM {
+  constructor(
+    responses: LLMResponse[],
+    private delayMs: number,
+  ) {
+    super(responses);
+  }
+
+  override async chat(messages: Message[], tools?: ToolDefinition[]): Promise<LLMResponse> {
+    await new Promise((resolve) => setTimeout(resolve, this.delayMs));
+    return super.chat(messages, tools);
+  }
+}
+
+function makeLoopFactory(responses: LLMResponse[], llm?: MockLLM) {
+  const mockLLM = llm ?? new MockLLM(responses);
+
+  const createLoop = (role: AgentRole, onProgress: ProgressCallback) =>
+    new AgentLoop({
+      llm: mockLLM,
+      dispatcher: new ToolDispatcher([]),
+      contextBuilder: new ContextBuilder({
+        systemPrompt: ROLE_DEFINITIONS[role].systemPrompt,
+        configRules: [],
+        memories: [],
+      }),
+      stopCondition: new StopCondition({ maxRounds: 5 }),
+      validator: new FeedbackValidator(),
+      injector: new FeedbackInjector(),
+      onProgress,
+    });
+
+  return { createLoop, mockLLM };
+}
+
+describe('Orchestrator', () => {
+  it('happy path: coder → reviewer → tester completed', async () => {
+    const { createLoop } = makeLoopFactory([
+      artifactResponse({ summary: 'Implemented feature' }),
+      artifactResponse({ summary: 'Looks good', findings: [] }),
+      artifactResponse({ summary: 'All green', testStatus: 'pass' }),
+    ]);
+
+    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
+    const result = await orch.run('Add foo');
+
+    expect(result.status).toBe('completed');
+    expect(result.retries).toBe(0);
+    expect(result.stages).toHaveLength(3);
+    expect(result.stages.map((s) => s.role)).toEqual(['coder', 'reviewer', 'tester']);
+    expect(result.stages[2].testStatus).toBe('pass');
+    expect(result.progressEvents.some((e) => e.agentRole === 'coder')).toBe(true);
+    expect(result.progressEvents.some((e) => e.agentRole === 'reviewer')).toBe(true);
+    expect(result.progressEvents.some((e) => e.agentRole === 'tester')).toBe(true);
+  });
+
+  it('review block then retry coder then success', async () => {
+    const { createLoop } = makeLoopFactory([
+      artifactResponse({ summary: 'First attempt' }),
+      artifactResponse({
+        summary: 'Issues found',
+        findings: [{ severity: 'block', message: 'unsafe API' }],
+      }),
+      artifactResponse({ summary: 'Fixed issue' }),
+      artifactResponse({ summary: 'Approved', findings: [] }),
+      artifactResponse({ summary: 'Tests pass', testStatus: 'pass' }),
+    ]);
+
+    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
+    const result = await orch.run('Fix bar');
+
+    expect(result.status).toBe('completed');
+    expect(result.retries).toBe(1);
+    expect(result.stages.filter((s) => s.role === 'coder')).toHaveLength(2);
+    expect(result.messages.some((m) => m.role === 'user' && m.content.includes('unsafe API'))).toBe(
+      true,
+    );
+  });
+
+  it('test fail until maxRetries exhausted → failed', async () => {
+    const responses: LLMResponse[] = [];
+    for (let attempt = 0; attempt < 3; attempt++) {
+      responses.push(artifactResponse({ summary: `code v${attempt}` }));
+      responses.push(artifactResponse({ summary: 'Review ok', findings: [] }));
+      responses.push(artifactResponse({ summary: 'Tests failed', testStatus: 'fail' }));
+    }
+
+    const { createLoop } = makeLoopFactory(responses);
+    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
+    const result = await orch.run('Ship baz');
+
+    expect(result.status).toBe('failed');
+    expect(result.retries).toBe(2);
+    expect(result.stages.filter((s) => s.role === 'tester')).toHaveLength(3);
+    expect(result.stages.filter((s) => s.role === 'tester' && s.testStatus === 'fail')).toHaveLength(
+      3,
+    );
+  });
+
+  it('cancel mid-run returns cancelled', async () => {
+    const slowLLM = new SlowMockLLM(
+      [
+        artifactResponse({ summary: 'Still working' }),
+        artifactResponse({ summary: 'Should not reach' }),
+      ],
+      50,
+    );
+    const { createLoop } = makeLoopFactory([], slowLLM);
+
+    const orch = new Orchestrator({ createLoop, maxRetries: 2 });
+    const runPromise = orch.run('Cancel me');
+    orch.cancel();
+    const result = await runPromise;
+
+    expect(result.status).toBe('cancelled');
+    expect(result.stages).toHaveLength(0);
+  });
+});

