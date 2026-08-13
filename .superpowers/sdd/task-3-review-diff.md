## Diff

diff --git a/src/feedback/injector.ts b/src/feedback/injector.ts
index 4061b71..7f69793 100644
--- a/src/feedback/injector.ts
+++ b/src/feedback/injector.ts
@@ -12,8 +12,11 @@ export class FeedbackInjector {
       '',
       ...feedback.failures.map(
         (f) =>
-          `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.file}:${f.line}]`
+          `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.type}] [${f.file}:${f.line}]`
       ),
+      ...(feedback.repeatedFailure
+        ? ['', `WARNING: ${feedback.repeatedFailure.message}`]
+        : []),
       '',
       'Please analyze the failures and fix the code. Run the tests again after making changes.',
     ];
diff --git a/tests/feedback/injector.test.ts b/tests/feedback/injector.test.ts
index 04509fc..36af41f 100644
--- a/tests/feedback/injector.test.ts
+++ b/tests/feedback/injector.test.ts
@@ -28,6 +28,32 @@ describe('FeedbackInjector', () => {
     expect(message).toContain('expected 3');
     expect(message).toContain('got -1');
     expect(message).toContain('src/math.ts:3');
+    expect(message).toContain('[assertion]');
+  });
+
+  it('includes WARNING when repeatedFailure is set', () => {
+    const feedback: Feedback = {
+      status: 'fail',
+      round: 3,
+      summary: '1 test failed',
+      failures: [{
+        testName: 'add',
+        expected: '3',
+        received: '-1',
+        file: 't.ts',
+        line: 1,
+        type: 'assertion',
+        raw: '',
+      }],
+      repeatedFailure: {
+        testName: 'add',
+        streak: 3,
+        message: '"add" failed 3 times in a row. Try a different fix.',
+      },
+    };
+    const message = injector.buildMessage(feedback);
+    expect(message).toContain('WARNING:');
+    expect(message).toContain('3 times');
   });
 
   it('builds pass feedback message', () => {
