BASE 70158baed7d2f570a606beecde07ca5dcf427c64
HEAD 0e7d56565d9ba45577ef880aad1c9809edb43af9
## Commits
0e7d565 feat(orchestration): stage artifacts and gate decisions

## Stat
 src/orchestration/artifacts.ts        | 139 ++++++++++++++++++++++++++++++++++
 tests/orchestration/artifacts.test.ts |  94 +++++++++++++++++++++++
 2 files changed, 233 insertions(+)

## Diff
diff --git a/src/orchestration/artifacts.ts b/src/orchestration/artifacts.ts
new file mode 100644
index 0000000..c62b17c
--- /dev/null
+++ b/src/orchestration/artifacts.ts
@@ -0,0 +1,139 @@
+import type { AgentRole } from './roles';
+
+export interface StageArtifact {
+  role: AgentRole;
+  summary: string;
+  changedFiles: string[];
+  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
+  testStatus?: 'pass' | 'fail' | 'skipped';
+  rawExcerpt?: string;
+}
+
+export type GateDecision =
+  | { action: 'continue' }
+  | { action: 'retry_coder'; reason: string }
+  | { action: 'warn'; reason: string };
+
+const SUMMARY_MAX = 500;
+
+interface ParsedPayload {
+  summary?: string;
+  findings?: Array<{ severity: 'info' | 'warn' | 'block'; message: string }>;
+  testStatus?: 'pass' | 'fail' | 'skipped';
+}
+
+function truncate(text: string, max = SUMMARY_MAX): string {
+  return text.length <= max ? text : text.slice(0, max);
+}
+
+function extractJsonSource(content: string): { json: string; excerpt: string } | null {
+  const fenceMatch = content.match(/```json\s*([\s\S]*?)```/i);
+  if (fenceMatch) {
+    return { json: fenceMatch[1].trim(), excerpt: fenceMatch[0] };
+  }
+
+  const lineMatch = content.match(/^ARTIFACT:\s*(.+)$/m);
+  if (lineMatch) {
+    return { json: lineMatch[1].trim(), excerpt: lineMatch[0] };
+  }
+
+  return null;
+}
+
+function parsePayload(json: string): ParsedPayload | null {
+  try {
+    const data = JSON.parse(json) as Record<string, unknown>;
+    if (typeof data !== 'object' || data === null) {
+      return null;
+    }
+
+    const payload: ParsedPayload = {};
+
+    if (typeof data.summary === 'string') {
+      payload.summary = data.summary;
+    }
+
+    if (Array.isArray(data.findings)) {
+      payload.findings = data.findings.filter(
+        (f): f is { severity: 'info' | 'warn' | 'block'; message: string } =>
+          typeof f === 'object' &&
+          f !== null &&
+          (f.severity === 'info' || f.severity === 'warn' || f.severity === 'block') &&
+          typeof f.message === 'string',
+      );
+    }
+
+    if (data.testStatus === 'pass' || data.testStatus === 'fail' || data.testStatus === 'skipped') {
+      payload.testStatus = data.testStatus;
+    }
+
+    return payload;
+  } catch {
+    return null;
+  }
+}
+
+function fallbackArtifact(role: AgentRole, content: string, changedFiles: string[]): StageArtifact {
+  return {
+    role,
+    summary: truncate(content),
+    changedFiles,
+    findings: [],
+    testStatus: 'skipped',
+  };
+}
+
+export function parseStageOutput(
+  role: AgentRole,
+  content: string,
+  changedFiles: string[],
+): { artifact: StageArtifact; parseOk: boolean } {
+  const source = extractJsonSource(content);
+  if (!source) {
+    return { artifact: fallbackArtifact(role, content, changedFiles), parseOk: false };
+  }
+
+  const payload = parsePayload(source.json);
+  if (!payload) {
+    return { artifact: fallbackArtifact(role, content, changedFiles), parseOk: false };
+  }
+
+  const artifact: StageArtifact = {
+    role,
+    summary: payload.summary ?? truncate(content),
+    changedFiles,
+    rawExcerpt: source.excerpt,
+  };
+
+  if (payload.findings !== undefined) {
+    artifact.findings = payload.findings;
+  }
+  if (payload.testStatus !== undefined) {
+    artifact.testStatus = payload.testStatus;
+  }
+
+  return { artifact, parseOk: true };
+}
+
+export function parseArtifactFromAssistant(
+  role: AgentRole,
+  content: string,
+  changedFiles: string[],
+): StageArtifact {
+  return parseStageOutput(role, content, changedFiles).artifact;
+}
+
+export function decideGate(artifact: StageArtifact): GateDecision {
+  if (artifact.role === 'reviewer') {
+    const block = artifact.findings?.find((f) => f.severity === 'block');
+    if (block) {
+      return { action: 'retry_coder', reason: block.message };
+    }
+  }
+
+  if (artifact.role === 'tester' && artifact.testStatus === 'fail') {
+    return { action: 'retry_coder', reason: artifact.summary };
+  }
+
+  return { action: 'continue' };
+}
diff --git a/tests/orchestration/artifacts.test.ts b/tests/orchestration/artifacts.test.ts
new file mode 100644
index 0000000..320f909
--- /dev/null
+++ b/tests/orchestration/artifacts.test.ts
@@ -0,0 +1,94 @@
+import { describe, it, expect } from 'vitest';
+import { parseStageOutput, decideGate } from '../../src/orchestration/artifacts';
+
+const changedFiles = ['src/foo.ts'];
+
+describe('parseStageOutput', () => {
+  it('parses fenced json block', () => {
+    const content = 'Done.\n```json\n{"summary":"Implemented foo","findings":[]}\n```';
+    const { artifact, parseOk } = parseStageOutput('coder', content, changedFiles);
+    expect(parseOk).toBe(true);
+    expect(artifact.summary).toBe('Implemented foo');
+    expect(artifact.role).toBe('coder');
+    expect(artifact.changedFiles).toEqual(changedFiles);
+    expect(artifact.rawExcerpt).toContain('```json');
+  });
+
+  it('parses ARTIFACT: line', () => {
+    const content =
+      'Review complete.\nARTIFACT: {"summary":"Looks good","findings":[{"severity":"info","message":"nit"}]}';
+    const { artifact, parseOk } = parseStageOutput('reviewer', content, changedFiles);
+    expect(parseOk).toBe(true);
+    expect(artifact.summary).toBe('Looks good');
+    expect(artifact.findings).toEqual([{ severity: 'info', message: 'nit' }]);
+  });
+
+  it('returns parseOk=false on missing artifact', () => {
+    const content = 'Plain assistant reply without structured output.';
+    const { artifact, parseOk } = parseStageOutput('reviewer', content, changedFiles);
+    expect(parseOk).toBe(false);
+    expect(artifact.findings).toEqual([]);
+    expect(artifact.testStatus).toBe('skipped');
+    expect(artifact.summary).toBe(content);
+    expect(artifact.role).toBe('reviewer');
+    expect(artifact.changedFiles).toEqual(changedFiles);
+  });
+
+  it('returns parseOk=false on invalid json and truncates long summary', () => {
+    const content = 'x'.repeat(600) + '\n```json\n{not json}\n```';
+    const { artifact, parseOk } = parseStageOutput('tester', content, changedFiles);
+    expect(parseOk).toBe(false);
+    expect(artifact.findings).toEqual([]);
+    expect(artifact.testStatus).toBe('skipped');
+    expect(artifact.summary.length).toBeLessThanOrEqual(500);
+  });
+});
+
+describe('decideGate', () => {
+  it('retry_coder when reviewer has block finding', () => {
+    const { artifact } = parseStageOutput(
+      'reviewer',
+      '```json\n{"summary":"Issues","findings":[{"severity":"block","message":"unsafe API"}]}\n```',
+      changedFiles,
+    );
+    expect(decideGate(artifact)).toEqual({
+      action: 'retry_coder',
+      reason: 'unsafe API',
+    });
+  });
+
+  it('continue when reviewer has only warn findings', () => {
+    const { artifact } = parseStageOutput(
+      'reviewer',
+      '```json\n{"summary":"Minor notes","findings":[{"severity":"warn","message":"style"}]}\n```',
+      changedFiles,
+    );
+    expect(decideGate(artifact)).toEqual({ action: 'continue' });
+  });
+
+  it('retry_coder when tester reports fail', () => {
+    const { artifact } = parseStageOutput(
+      'tester',
+      '```json\n{"summary":"Tests failed","testStatus":"fail"}\n```',
+      changedFiles,
+    );
+    expect(decideGate(artifact)).toEqual({
+      action: 'retry_coder',
+      reason: 'Tests failed',
+    });
+  });
+
+  it('continue when tester reports pass', () => {
+    const { artifact } = parseStageOutput(
+      'tester',
+      '```json\n{"summary":"All green","testStatus":"pass"}\n```',
+      changedFiles,
+    );
+    expect(decideGate(artifact)).toEqual({ action: 'continue' });
+  });
+
+  it('continue when parse failed (malformed artifact)', () => {
+    const { artifact } = parseStageOutput('reviewer', 'no structured output', changedFiles);
+    expect(decideGate(artifact)).toEqual({ action: 'continue' });
+  });
+});

