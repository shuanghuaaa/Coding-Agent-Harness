### Task 3: AgentLoop resume via priorMessages

**Files:**
- Modify: `src/agent/loop.ts` — `run` signature + `RoundProgress.agentRole?`
- Create: `tests/agent/loop-resume.test.ts`

**Interfaces:**
- Consumes: `ContextBuilder.build(history)`
- Produces: `run(task: string, options?: { priorMessages?: Message[]; agentRole?: string }): Promise<RunResult>`
- When `priorMessages` provided: strip any `role==='system'` from prior, then `build([...nonSystemPrior, { role:'user', content: task }])`
- Progress events include `agentRole` when options.agentRole set

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { AgentLoop } from '../../src/agent/loop';
import { MockLLM } from '../../src/llm/mock-llm';
import { ToolDispatcher } from '../../src/tools/dispatcher';
import { ContextBuilder } from '../../src/agent/context-builder';
import { StopCondition } from '../../src/agent/stop-condition';
import { FeedbackValidator } from '../../src/feedback/validator';
import { FeedbackInjector } from '../../src/feedback/injector';

function makeLoop(responses: ConstructorParameters<typeof MockLLM>[0]) {
  return new AgentLoop({
    llm: new MockLLM(responses),
    dispatcher: new ToolDispatcher([]),
    contextBuilder: new ContextBuilder({ systemPrompt: 'sys', configRules: [], memories: [] }),
    stopCondition: new StopCondition({ maxRounds: 5 }),
    validator: new FeedbackValidator(),
    injector: new FeedbackInjector(),
  });
}

describe('AgentLoop resume', () => {
  it('appends new user turn after prior messages', async () => {
    const loop = makeLoop([{ content: 'continued', tool_calls: [], finish_reason: 'stop' }]);
    const result = await loop.run('follow up', {
      priorMessages: [
        { role: 'user', content: 'first' },
        { role: 'assistant', content: 'answer1' },
      ],
    });
    expect(result.status).toBe('completed');
    const users = result.messages.filter((m) => m.role === 'user').map((m) => m.content);
    expect(users).toContain('first');
    expect(users[users.length - 1]).toBe('follow up');
    expect(result.messages.some((m) => m.role === 'system')).toBe(true);
  });
});
```

- [ ] **Step 2: Run — expect FAIL** (run ignores options)

Run: `npm test -- tests/agent/loop-resume.test.ts`

- [ ] **Step 3: Implement minimal change in `loop.ts`**

```ts
export interface RoundProgress {
  round: number;
  assistantContent: string;
  actions: Array<{ tool: string; result: string }>;
  feedbackStatus?: string;
  agentRole?: string;
}

export interface RunOptions {
  priorMessages?: Message[];
  agentRole?: string;
}

async run(task: string, options?: RunOptions): Promise<RunResult> {
  this.cancelled = false;
  this.feedbackHistory = [];
  const prior = (options?.priorMessages ?? []).filter((m) => m.role !== 'system');
  this.messages = this.config.contextBuilder.build([
    ...prior,
    { role: 'user', content: task },
  ]);
  // ... rest unchanged; when emitProgress, pass agentRole: options?.agentRole
}
```

Update `emitProgress` / call sites to attach `agentRole` from a private field set at start of `run`: `this.currentAgentRole = options?.agentRole`.

- [ ] **Step 4: Run — expect PASS** (also run `tests/agent/loop.test.ts` to ensure no regression)

- [ ] **Step 5: Commit**

```powershell
git add src/agent/loop.ts tests/agent/loop-resume.test.ts
git commit -m "feat(agent): resume runs with priorMessages"
```

---


