### Task 5: Artifact parsing + gate decisions

**Files:**
- Create: `src/orchestration/artifacts.ts`
- Create: `tests/orchestration/artifacts.test.ts`

**Interfaces:**
- Produces:
  ```ts
  export interface StageArtifact {
    role: AgentRole;
    summary: string;
    changedFiles: string[];
    findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
    testStatus?: 'pass' | 'fail' | 'skipped';
    rawExcerpt?: string;
  }
  export type GateDecision =
    | { action: 'continue' }
    | { action: 'retry_coder'; reason: string }
    | { action: 'warn'; reason: string };

  export function parseArtifactFromAssistant(role: AgentRole, content: string, changedFiles: string[]): StageArtifact;
  export function decideGate(artifact: StageArtifact): GateDecision;
  ```
- Parser: look for fenced JSON block \`\`\`json ... \`\`\` or a line starting with `ARTIFACT:` + JSON; on failure return artifact with empty findings / `testStatus: 'skipped'` and summary = truncated content; `decideGate` then `continue` (warn path can be logged by orchestrator when parse soft-failed — expose `parseOk: boolean` on artifact or return `{ artifact, parseOk }`)

Prefer:

```ts
export function parseStageOutput(role: AgentRole, content: string, changedFiles: string[]): { artifact: StageArtifact; parseOk: boolean }
```

Gate:
- reviewer + any finding severity `block` → `retry_coder`
- tester + `testStatus === 'fail'` → `retry_coder`
- else `continue`

- [ ] **Step 1: Write tests** covering block, fail, pass, malformed → continue

- [ ] **Step 2: Run — FAIL**

- [ ] **Step 3: Implement**

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration/artifacts.ts tests/orchestration/artifacts.test.ts
git commit -m "feat(orchestration): stage artifacts and gate decisions"
```

---


