### Task 3: Injector includes type + WARNING

**Files:**
- Modify: `src/feedback/injector.ts`
- Modify: `tests/feedback/injector.test.ts`

**Interfaces:**
- Consumes: `Feedback.repeatedFailure`, `TestFailure.type`
- Produces: `buildMessage` string containing `[type]` and optional `WARNING:`

- [ ] **Step 1: Extend failing assertions in injector.test.ts**

Add to existing fail test:

```ts
expect(message).toContain('[assertion]');
```

Add new test:

```ts
it('includes WARNING when repeatedFailure is set', () => {
  const feedback: Feedback = {
    status: 'fail',
    round: 3,
    summary: '1 test failed',
    failures: [{
      testName: 'add', expected: '3', received: '-1', file: 't.ts', line: 1, type: 'assertion', raw: '',
    }],
    repeatedFailure: {
      testName: 'add',
      streak: 3,
      message: '"add" failed 3 times in a row. Try a different fix.',
    },
  };
  const message = injector.buildMessage(feedback);
  expect(message).toContain('WARNING:');
  expect(message).toContain('3 times');
});
```

- [ ] **Step 2: Run — expect FAIL on missing type/WARNING**

Run: `npx vitest run tests/feedback/injector.test.ts`

- [ ] **Step 3: Update buildMessage**

```ts
...feedback.failures.map(
  (f) =>
    `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.type}] [${f.file}:${f.line}]`
),
...(feedback.repeatedFailure
  ? ['', `WARNING: ${feedback.repeatedFailure.message}`]
  : []),
'',
'Please analyze the failures and fix the code. Run the tests again after making changes.',
```

- [ ] **Step 4: Run — expect PASS**

---
