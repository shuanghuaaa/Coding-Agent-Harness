### Task 6: Orchestrator state machine

**Files:**
- Create: `src/orchestration/orchestrator.ts`
- Create: `tests/orchestration/orchestrator.test.ts`

**Interfaces:**
- Consumes: `AgentLoop`, `ROLE_DEFINITIONS`, `filterToolsForRole`, `parseStageOutput`, `decideGate`, `Tool[]`, factories for building per-role loops
- Produces:
  ```ts
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

  export class Orchestrator {
    constructor(private deps: {
      createLoop: (role: AgentRole, onProgress: ProgressCallback) => AgentLoop;
      maxRetries: number;
      onStatus?: (s: OrchestratorStatus) => void;
    }) {}
    run(task: string, options?: { priorMessages?: Message[] }): Promise<OrchestrationResult>;
    cancel(): void;
  }
  ```

Behavior sketch for `run`:
1. Emit status idle→coder running
2. `loop.run(coderTask, { priorMessages, agentRole:'coder' })` where coderTask includes user task + instruction to end with ARTIFACT JSON
3. Collect changedFiles from checkpoint diff helper passed in OR from artifact / empty array if unknown — for tests, pass `getChangedFiles: () => string[]` in deps defaulting to `() => []`
4. Parse artifact; gate; if retry and retryCount < maxRetries, increment and goto coder with prior = accumulated messages + gate reason user message
5. Same for reviewer then tester
6. On cancel flag, return cancelled

- [ ] **Step 1: Write mock-LLM orchestrator tests** for happy path, review block then success, test fail until retries exhausted

Use MockLLM queued responses that return stop with ARTIFACT JSON in content (no tools) to keep tests simple.

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement orchestrator.ts**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration/orchestrator.ts tests/orchestration/orchestrator.test.ts
git commit -m "feat(orchestration): coder-reviewer-tester orchestrator with retries"
```

---


