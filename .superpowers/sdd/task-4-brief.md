### Task 4: Role registry + tool allowlist

**Files:**
- Create: `src/orchestration/roles.ts`
- Create: `tests/orchestration/roles.test.ts`
- Optionally small helper: `createDispatcherForRole(role, allTools: Tool[]): ToolDispatcher`

**Interfaces:**
- Produces:
  ```ts
  export type AgentRole = 'coder' | 'reviewer' | 'tester';
  export interface RoleDefinition {
    role: AgentRole;
    systemPrompt: string;
    allowedTools: string[];
  }
  export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition>;
  export function filterToolsForRole(role: AgentRole, tools: Tool[]): Tool[];
  ```
- reviewer `allowedTools`: `read_file`, `search`, `git_diff` (match actual tool names in repo)
- tester: `read_file`, `run_test`, `search` (and shell only if existing tests use it — prefer `run_test` + `read_file` + `git_diff`)
- coder: full coding set used in `src/index.ts` minus nothing critical

- [ ] **Step 1: Grep actual tool names** from `src/index.ts` / tools, then write test:

```ts
import { describe, it, expect } from 'vitest';
import { filterToolsForRole, ROLE_DEFINITIONS } from '../../src/orchestration/roles';
import type { Tool } from '../../src/tools/base';

const fake = (name: string): Tool => ({
  name,
  description: name,
  parameters: { type: 'object', properties: {} },
  execute: async () => ({ tool_call_id: '', content: 'ok' }),
});

describe('role tool isolation', () => {
  const all = ['read_file', 'write_file', 'delete_file', 'shell', 'search', 'git_diff', 'run_test'].map(fake);

  it('reviewer cannot get write_file', () => {
    const tools = filterToolsForRole('reviewer', all);
    expect(tools.map((t) => t.name)).not.toContain('write_file');
    expect(tools.map((t) => t.name)).not.toContain('delete_file');
  });

  it('tester cannot get write_file', () => {
    expect(filterToolsForRole('tester', all).map((t) => t.name)).not.toContain('write_file');
  });

  it('coder includes write_file', () => {
    expect(filterToolsForRole('coder', all).map((t) => t.name)).toContain('write_file');
  });

  it('every role has a non-empty systemPrompt', () => {
    for (const r of Object.values(ROLE_DEFINITIONS)) {
      expect(r.systemPrompt.length).toBeGreaterThan(20);
    }
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

- [ ] **Step 3: Implement `roles.ts`** with Chinese/English prompts stating role duties and that reviewer/tester must not modify code; `filterToolsForRole` filters by `allowedTools` set.

- [ ] **Step 4: Run — PASS**

- [ ] **Step 5: Commit**

```powershell
git add src/orchestration/roles.ts tests/orchestration/roles.test.ts
git commit -m "feat(orchestration): role registry with tool allowlists"
```

---


