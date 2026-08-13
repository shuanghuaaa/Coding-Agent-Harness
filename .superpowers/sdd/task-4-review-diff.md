## Diff

diff --git a/src/feedback/validator.ts b/src/feedback/validator.ts
index d579c99..228d2f2 100644
--- a/src/feedback/validator.ts
+++ b/src/feedback/validator.ts
@@ -20,17 +20,10 @@ export class FeedbackValidator {
     round: number,
     error?: string
   ): Feedback {
-    if (error) {
-      return {
-        status: 'fail',
-        round,
-        summary: `Tests failed with error: ${error}`,
-        failures: [this.classifier.parseFailure(error)],
-      };
-    }
+    let failures: TestFailure[] = [];
 
     if (testOutput.includes('FAIL') || testOutput.includes('fail')) {
-      let failures = this.parseWithChain(testOutput);
+      failures = this.parseWithChain(testOutput);
 
       if (failures.length === 0) {
         const failureLines = testOutput
@@ -40,12 +33,26 @@ export class FeedbackValidator {
           this.classifier.parseFailure(line)
         );
       }
+    }
 
+    if (failures.length > 0) {
       return {
         status: 'fail',
         round,
         summary: `${failures.length} test(s) failed`,
         failures,
+        failureTypes: [...new Set(failures.map((f) => f.type))],
+      };
+    }
+
+    if (error) {
+      failures = [this.classifier.parseFailure(error)];
+      return {
+        status: 'fail',
+        round,
+        summary: `Tests failed with error: ${error}`,
+        failures,
+        failureTypes: [...new Set(failures.map((f) => f.type))],
       };
     }
 
@@ -54,6 +61,7 @@ export class FeedbackValidator {
       round,
       summary: 'All tests passed',
       failures: [],
+      failureTypes: [],
     };
   }
 
diff --git a/tests/feedback/validator.test.ts b/tests/feedback/validator.test.ts
index 91e52f8..356350b 100644
--- a/tests/feedback/validator.test.ts
+++ b/tests/feedback/validator.test.ts
@@ -28,4 +28,12 @@ describe('FeedbackValidator', () => {
     expect(result.failures.length).toBeGreaterThan(0);
     expect(result.failures[0].type).toBe('runtime');
   });
+
+  it('prefers parseable stdout over generic stderr error', () => {
+    const output = 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12';
+    const result = validator.validate(output, 1, 'Command failed with exit code 1');
+    expect(result.status).toBe('fail');
+    expect(result.failures[0].testName).toBe('add(1, 2)');
+    expect(result.failureTypes).toContain('assertion');
+  });
 });
\ No newline at end of file
