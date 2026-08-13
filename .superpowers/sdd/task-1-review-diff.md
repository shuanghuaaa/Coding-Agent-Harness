# Review package Task 1
Base: working tree before task (uncommitted)
Head: current working tree
Commits: none (user asked to skip commits)

## Stat
 src/feedback/types.ts | 17 +++++++++++++++++
 1 file changed, 17 insertions(+)

## Diff

diff --git a/src/feedback/summary.ts b/src/feedback/summary.ts
new file mode 100644
index 0000000..c1cddc5
--- /dev/null
+++ b/src/feedback/summary.ts
@@ -0,0 +1,22 @@
+import type { Feedback, FeedbackHistoryEntry, TestFailure } from './types';
+
+export function failureFingerprint(f: Pick<TestFailure, 'testName' | 'file' | 'line'>): string {
+  const name = f.testName?.trim();
+  if (name && name !== '(unknown test)') return name;
+  if (f.file && f.file !== '(unknown)' && f.line > 0) return `${f.file}:${f.line}`;
+  if (f.file && f.file !== '(unknown)') return f.file;
+  return 'unknown';
+}
+
+export function toFeedbackHistoryEntry(feedback: Feedback): FeedbackHistoryEntry {
+  return {
+    round: feedback.round,
+    status: feedback.status,
+    summary: feedback.summary,
+    failureTypes: feedback.failureTypes ?? [...new Set(feedback.failures.map((x) => x.type))],
+    failures: feedback.failures.map(({ testName, type, file, line, expected, received }) => ({
+      testName, type, file, line, expected, received,
+    })),
+    repeatedFailure: feedback.repeatedFailure,
+  };
+}
diff --git a/src/feedback/types.ts b/src/feedback/types.ts
index 0442089..3293f5c 100644
--- a/src/feedback/types.ts
+++ b/src/feedback/types.ts
@@ -12,9 +12,26 @@ export interface TestFailure {
 
 export type FeedbackStatus = 'pass' | 'fail';
 
+export interface RepeatedFailure {
+  testName: string;
+  streak: number;
+  message: string;
+}
+
 export interface Feedback {
   status: FeedbackStatus;
   failures: TestFailure[];
   round: number;
   summary: string;
+  failureTypes?: FailureType[];
+  repeatedFailure?: RepeatedFailure;
+}
+
+export interface FeedbackHistoryEntry {
+  round: number;
+  status: FeedbackStatus;
+  summary?: string;
+  failureTypes?: FailureType[];
+  failures?: Array<Pick<TestFailure, 'testName' | 'type' | 'file' | 'line' | 'expected' | 'received'>>;
+  repeatedFailure?: RepeatedFailure;
 }
\ No newline at end of file
diff --git a/tests/feedback/summary.test.ts b/tests/feedback/summary.test.ts
new file mode 100644
index 0000000..9ea9990
--- /dev/null
+++ b/tests/feedback/summary.test.ts
@@ -0,0 +1,32 @@
+import { describe, it, expect } from 'vitest';
+import { toFeedbackHistoryEntry, failureFingerprint } from '../../src/feedback/summary';
+import type { Feedback } from '../../src/feedback/types';
+
+describe('feedback summary', () => {
+  it('toFeedbackHistoryEntry drops raw and sets failureTypes', () => {
+    const feedback: Feedback = {
+      status: 'fail',
+      round: 2,
+      summary: '1 test failed',
+      failureTypes: ['assertion'],
+      failures: [{
+        testName: 'add',
+        expected: '3',
+        received: '-1',
+        file: 'src/math.test.ts',
+        line: 10,
+        type: 'assertion',
+        raw: 'HUGE RAW',
+      }],
+    };
+    const entry = toFeedbackHistoryEntry(feedback);
+    expect(entry.failures?.[0]).not.toHaveProperty('raw');
+    expect(entry.failureTypes).toEqual(['assertion']);
+    expect(JSON.stringify(entry)).not.toContain('HUGE RAW');
+  });
+
+  it('failureFingerprint prefers testName', () => {
+    expect(failureFingerprint({ testName: 'add', file: 'a.ts', line: 1 })).toBe('add');
+    expect(failureFingerprint({ testName: '(unknown test)', file: 'a.ts', line: 3 })).toBe('a.ts:3');
+  });
+});
