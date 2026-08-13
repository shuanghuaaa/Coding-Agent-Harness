### Task 4: Validator stdout priority + failureTypes

**Files:**
- Modify: `src/feedback/validator.ts`
- Modify: `tests/feedback/validator.test.ts`

**Interfaces:**
- Produces: `Feedback` with `failureTypes` always set; when `error` present but `testOutput` parses failures, use parsed failures (status fail)

- [ ] **Step 1: Add test**

```ts
it('prefers parseable stdout over generic stderr error', () => {
  const output = 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12';
  const result = validator.validate(output, 1, 'Command failed with exit code 1');
  expect(result.status).toBe('fail');
  expect(result.failures[0].testName).toBe('add(1, 2)');
  expect(result.failureTypes).toContain('assertion');
});
```

- [ ] **Step 2: Run — expect FAIL (current code uses error-only path)**

- [ ] **Step 3: Implement**

Reorder `validate`: if `testOutput` has FAIL/fail content, parse chain first; only if no failures from stdout, fall back to classifying `error`. Always set:

```ts
failureTypes: [...new Set(failures.map((f) => f.type))]
```

on both pass (empty) and fail.

- [ ] **Step 4: Run — expect PASS**

---
