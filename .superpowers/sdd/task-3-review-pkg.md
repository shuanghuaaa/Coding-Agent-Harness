BASE 0e5ece5352e8bf31ba1a306a09fbfbf9a22ce1f9
HEAD 4bd846b2aaf331986e27f898182ae14c50058dea
## Commits
4bd846b fix(agent): reset cancelled flag at start of each run
8596f4d feat(agent): resume runs with priorMessages

## Stat
 src/agent/loop.ts               | 15 +++++++++++-
 tests/agent/loop-resume.test.ts | 54 +++++++++++++++++++++++++++++++++++++++++
 tests/agent/loop.test.ts        |  6 ++---
 3 files changed, 71 insertions(+), 4 deletions(-)

## Diff
diff --git a/src/agent/loop.ts b/src/agent/loop.ts
index 0e5ad89..cc3dfde 100644
--- a/src/agent/loop.ts
+++ b/src/agent/loop.ts
@@ -23,16 +23,22 @@ export interface HITLResponse {
 
 export type HITLCallback = (request: HITLRequest) => Promise<HITLResponse>;
 
 export interface RoundProgress {
   round: number;
   assistantContent: string;
   actions: Array<{ tool: string; result: string }>;
   feedbackStatus?: string;
+  agentRole?: string;
+}
+
+export interface RunOptions {
+  priorMessages?: Message[];
+  agentRole?: string;
 }
 
 export type ProgressCallback = (event: RoundProgress) => void;
 
 export interface AgentLoopConfig {
   llm: LLMProvider;
   dispatcher: ToolDispatcher;
   contextBuilder: ContextBuilder;
@@ -50,28 +56,34 @@ export interface RunResult {
   messages: Message[];
   feedbackHistory: Array<{ round: number; status: string }>;
 }
 
 export class AgentLoop {
   private messages: Message[] = [];
   private feedbackHistory: Array<{ round: number; status: string }> = [];
   private cancelled = false;
+  private currentAgentRole?: string;
   private feedbackToolNames: string[];
 
   /** Exposed for HITL-aware server to rebuild with a hitlCallback */
   public readonly config: AgentLoopConfig;
 
   constructor(config: AgentLoopConfig) {
     this.config = config;
     this.feedbackToolNames = config.feedbackToolNames ?? ['run_test'];
   }
 
-  async run(task: string): Promise<RunResult> {
+  async run(task: string, options?: RunOptions): Promise<RunResult> {
+    this.cancelled = false;
+    this.feedbackHistory = [];
+    this.currentAgentRole = options?.agentRole;
+    const prior = (options?.priorMessages ?? []).filter((m) => m.role !== 'system');
     this.messages = this.config.contextBuilder.build([
+      ...prior,
       { role: 'user', content: task },
     ]);
 
     const tools: ToolDefinition[] = this.config.dispatcher.getDefinitions();
 
     let round = 0;
     const maxRounds = this.config.stopCondition.getMaxRounds();
 
@@ -184,16 +196,17 @@ export class AgentLoop {
     actions: Array<{ tool: string; result: string }>,
     feedbackStatus?: string,
   ): void {
     this.config.onProgress?.({
       round,
       assistantContent,
       actions,
       feedbackStatus,
+      agentRole: this.currentAgentRole,
     });
   }
 
   private async executeToolCall(
     callId: string,
     name: string,
     args: Record<string, unknown>,
     round: number,
diff --git a/tests/agent/loop-resume.test.ts b/tests/agent/loop-resume.test.ts
new file mode 100644
index 0000000..22bcc4d
--- /dev/null
+++ b/tests/agent/loop-resume.test.ts
@@ -0,0 +1,54 @@
+import { describe, it, expect } from 'vitest';
+import { AgentLoop } from '../../src/agent/loop';
+import { MockLLM } from '../../src/llm/mock-llm';
+import { ToolDispatcher } from '../../src/tools/dispatcher';
+import { ContextBuilder } from '../../src/agent/context-builder';
+import { StopCondition } from '../../src/agent/stop-condition';
+import { FeedbackValidator } from '../../src/feedback/validator';
+import { FeedbackInjector } from '../../src/feedback/injector';
+
+function makeLoop(responses: ConstructorParameters<typeof MockLLM>[0]) {
+  return new AgentLoop({
+    llm: new MockLLM(responses),
+    dispatcher: new ToolDispatcher([]),
+    contextBuilder: new ContextBuilder({ systemPrompt: 'sys', configRules: [], memories: [] }),
+    stopCondition: new StopCondition({ maxRounds: 5 }),
+    validator: new FeedbackValidator(),
+    injector: new FeedbackInjector(),
+  });
+}
+
+describe('AgentLoop resume', () => {
+  it('appends new user turn after prior messages', async () => {
+    const loop = makeLoop([{ content: 'continued', tool_calls: [], finish_reason: 'stop' }]);
+    const result = await loop.run('follow up', {
+      priorMessages: [
+        { role: 'user', content: 'first' },
+        { role: 'assistant', content: 'answer1' },
+      ],
+    });
+    expect(result.status).toBe('completed');
+    const users = result.messages.filter((m) => m.role === 'user').map((m) => m.content);
+    expect(users).toContain('first');
+    expect(users[users.length - 1]).toBe('follow up');
+    expect(result.messages.some((m) => m.role === 'system')).toBe(true);
+  });
+
+  it('includes agentRole in onProgress when set in options', async () => {
+    const progressEvents: Array<{ agentRole?: string }> = [];
+    const loop = new AgentLoop({
+      llm: new MockLLM([{ content: 'ok', tool_calls: [], finish_reason: 'stop' }]),
+      dispatcher: new ToolDispatcher([]),
+      contextBuilder: new ContextBuilder({ systemPrompt: 'sys', configRules: [], memories: [] }),
+      stopCondition: new StopCondition({ maxRounds: 5 }),
+      validator: new FeedbackValidator(),
+      injector: new FeedbackInjector(),
+      onProgress: (event) => progressEvents.push(event),
+    });
+
+    await loop.run('task', { agentRole: 'reviewer' });
+
+    expect(progressEvents.length).toBeGreaterThan(0);
+    expect(progressEvents.every((e) => e.agentRole === 'reviewer')).toBe(true);
+  });
+});
diff --git a/tests/agent/loop.test.ts b/tests/agent/loop.test.ts
index ccb36f7..94666ca 100644
--- a/tests/agent/loop.test.ts
+++ b/tests/agent/loop.test.ts
@@ -55,26 +55,26 @@ describe('AgentLoop', () => {
 
     const loop = makeBasicLoop(mockLLM, [echoTool]);
     const result = await loop.run('Long task');
 
     expect(result.status).toBe('max_rounds');
     expect(result.rounds).toBe(10);
   });
 
-  it('returns cancelled when cancel() is called', async () => {
+  it('resets cancelled flag at start of each run', async () => {
     const mockLLM = new MockLLM([
-      { content: 'Working...', tool_calls: [], finish_reason: 'stop' },
+      { content: 'Done.', tool_calls: [], finish_reason: 'stop' },
     ]);
 
     const loop = makeBasicLoop(mockLLM);
     loop.cancel();
     const result = await loop.run('Task');
 
-    expect(result.status).toBe('cancelled');
+    expect(result.status).toBe('completed');
   });
 
   it('returns cancelled when cancel() called mid-loop', async () => {
     const mockLLM = new MockLLM([
       { content: null, tool_calls: [{ id: '1', name: 'echo', arguments: { text: 'hi' } }], finish_reason: 'tool_calls' },
       { content: 'Should not reach', tool_calls: [], finish_reason: 'stop' },
     ]);
 

