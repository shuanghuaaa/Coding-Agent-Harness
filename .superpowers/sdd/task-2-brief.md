### Task 2: Repeated-failure detection (pure)

**Files:**
- Create: `src/feedback/repeated-failure.ts`
- Test: `tests/feedback/repeated-failure.test.ts`

**Interfaces:**
- Consumes: `Feedback`, `FeedbackHistoryEntry`, `failureFingerprint`
- Produces: `detectRepeatedFailure(current: Feedback, history: FeedbackHistoryEntry[]): Feedback` (returns new object with `repeatedFailure` set when streak ≥ 2)

- [ ] **Step 1: Write failing test**

```ts
import { describe, it, expect } from 'vitest';
import { detectRepeatedFailure } from '../../src/feedback/repeated-failure';
import type { Feedback, FeedbackHistoryEntry } from '../../src/feedback/types';

const fail = (round: number, testName: string): Feedback => ({
  status: 'fail',
  round,
  summary: '1 test failed',
  failures: [{
    testName, expected: '3', received: '-1', file: 't.ts', line: 1, type: 'assertion', raw: '',
  }],
});

describe('detectRepeatedFailure', () => {
  it('marks streak when same test failed in previous history entry', () => {
    const history: FeedbackHistoryEntry[] = [
      { round: 1, status: 'fail', failures: [{ testName: 'add', type: 'assertion', file: 't.ts', line: 1, expected: '3', received: '-1' }] },
    ];
    const out = detectRepeatedFailure(fail(2, 'add'), history);
    expect(out.repeatedFailure?.streak).toBe(2);
    expect(out.repeatedFailure?.testName).toBe('add');
    expect(out.repeatedFailure?.message).toMatch(/2 times/i);
  });

  it('does not mark on first failure', () => {
    const out = detectRepeatedFailure(fail(1, 'add'), []);
    expect(out.repeatedFailure).toBeUndefined();
  });

  it('resets when intervening pass', () => {
    const history: FeedbackHistoryEntry[] = [
      { round: 1, status: 'fail', failures: [{ testName: 'add', type: 'assertion', file: 't.ts', line: 1, expected: '3', received: '-1' }] },
      { round: 2, status: 'pass', failures: [] },
    ];
    const out = detectRepeatedFailure(fail(3, 'add'), history);
    expect(out.repeatedFailure).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run — expect FAIL**

Run: `npx vitest run tests/feedback/repeated-failure.test.ts`

- [ ] **Step 3: Implement**

```ts
// src/feedback/repeated-failure.ts
import type { Feedback, FeedbackHistoryEntry } from './types';
import { failureFingerprint } from './summary';

export function detectRepeatedFailure(
  current: Feedback,
  history: FeedbackHistoryEntry[],
): Feedback {
  if (current.status !== 'fail' || current.failures.length === 0) return current;
  const fp = failureFingerprint(current.failures[0]);
  let streak = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.status === 'pass') break;
    if (h.status !== 'fail' || !h.failures?.length) break;
    if (failureFingerprint(h.failures[0]) !== fp) break;
    streak += 1;
  }
  if (streak < 2) return current;
  const testName = current.failures[0].testName !== '(unknown test)'
    ? current.failures[0].testName
    : fp;
  return {
    ...current,
    repeatedFailure: {
      testName,
      streak,
      message: `"${testName}" failed ${streak} times in a row. Try a different fix.`,
    },
  };
}
```

- [ ] **Step 4: Run — expect PASS**

- [ ] **Step 5: Commit** (skip unless user asked)

---
