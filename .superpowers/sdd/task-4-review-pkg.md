BASE 4bd846b2aaf331986e27f898182ae14c50058dea
HEAD 70158baed7d2f570a606beecde07ca5dcf427c64
## Commits
70158ba feat(orchestration): role registry with tool allowlists

## Stat
 src/orchestration/roles.ts        | 52 +++++++++++++++++++++++++++++++++++++++
 tests/orchestration/roles.test.ts | 34 +++++++++++++++++++++++++
 2 files changed, 86 insertions(+)

## Diff
diff --git a/src/orchestration/roles.ts b/src/orchestration/roles.ts
new file mode 100644
index 0000000..5d13df1
--- /dev/null
+++ b/src/orchestration/roles.ts
@@ -0,0 +1,52 @@
+import type { Tool } from '../tools/base';
+
+export type AgentRole = 'coder' | 'reviewer' | 'tester';
+
+export interface RoleDefinition {
+  role: AgentRole;
+  systemPrompt: string;
+  allowedTools: string[];
+}
+
+const CODER_TOOLS = [
+  'read_file',
+  'write_file',
+  'delete_file',
+  'shell',
+  'search',
+  'git_diff',
+  'run_test',
+] as const;
+
+const REVIEWER_TOOLS = ['read_file', 'search', 'git_diff'] as const;
+
+const TESTER_TOOLS = ['read_file', 'run_test', 'search', 'git_diff'] as const;
+
+export const ROLE_DEFINITIONS: Record<AgentRole, RoleDefinition> = {
+  coder: {
+    role: 'coder',
+    systemPrompt:
+      'You are a coding agent (编码代理). You implement features, fix bugs, and modify the codebase. ' +
+      'You may read, write, and delete files, run shell commands, search code, inspect git diffs, and run tests.',
+    allowedTools: [...CODER_TOOLS],
+  },
+  reviewer: {
+    role: 'reviewer',
+    systemPrompt:
+      'You are a code reviewer (代码审查员). Your job is to review changes for correctness, style, and risks. ' +
+      'You must NOT modify code — use read-only tools to inspect files, search the codebase, and view git diffs.',
+    allowedTools: [...REVIEWER_TOOLS],
+  },
+  tester: {
+    role: 'tester',
+    systemPrompt:
+      'You are a test engineer (测试工程师). Your job is to verify behavior by running tests and inspecting results. ' +
+      'You must NOT modify code — use read_file, run_test, search, and git_diff to validate changes without writing files.',
+    allowedTools: [...TESTER_TOOLS],
+  },
+};
+
+export function filterToolsForRole(role: AgentRole, tools: Tool[]): Tool[] {
+  const allowed = new Set(ROLE_DEFINITIONS[role].allowedTools);
+  return tools.filter((tool) => allowed.has(tool.name));
+}
diff --git a/tests/orchestration/roles.test.ts b/tests/orchestration/roles.test.ts
new file mode 100644
index 0000000..b479bdc
--- /dev/null
+++ b/tests/orchestration/roles.test.ts
@@ -0,0 +1,34 @@
+import { describe, it, expect } from 'vitest';
+import { filterToolsForRole, ROLE_DEFINITIONS } from '../../src/orchestration/roles';
+import type { Tool } from '../../src/tools/base';
+
+const fake = (name: string): Tool => ({
+  name,
+  description: name,
+  parameters: { type: 'object', properties: {} },
+  execute: async () => ({ tool_call_id: '', content: 'ok' }),
+});
+
+describe('role tool isolation', () => {
+  const all = ['read_file', 'write_file', 'delete_file', 'shell', 'search', 'git_diff', 'run_test'].map(fake);
+
+  it('reviewer cannot get write_file', () => {
+    const tools = filterToolsForRole('reviewer', all);
+    expect(tools.map((t) => t.name)).not.toContain('write_file');
+    expect(tools.map((t) => t.name)).not.toContain('delete_file');
+  });
+
+  it('tester cannot get write_file', () => {
+    expect(filterToolsForRole('tester', all).map((t) => t.name)).not.toContain('write_file');
+  });
+
+  it('coder includes write_file', () => {
+    expect(filterToolsForRole('coder', all).map((t) => t.name)).toContain('write_file');
+  });
+
+  it('every role has a non-empty systemPrompt', () => {
+    for (const r of Object.values(ROLE_DEFINITIONS)) {
+      expect(r.systemPrompt.length).toBeGreaterThan(20);
+    }
+  });
+});

