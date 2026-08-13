### Task 1: Extend Feedback types + history entry helper

**Files:**
- Modify: `src/feedback/types.ts`
- Create: `src/feedback/summary.ts`
- Test: `tests/feedback/summary.test.ts`

**Interfaces:**
- Produces:
  - `RepeatedFailure { testName: string; streak: number; message: string }`
  - `Feedback` gains optional `failureTypes?: FailureType[]`, `repeatedFailure?: RepeatedFailure`
  - `FeedbackHistoryEntry` = `{ round, status, summary?, failureTypes?, failures?: Array<Pick<TestFailure,'testName'|'type'|'file'|'line'|'expected'|'received'>>, repeatedFailure? }`
  - `toFeedbackHistoryEntry(feedback: Feedback): FeedbackHistoryEntry` (omits `raw`)
  - `failureFingerprint(f: Pick<TestFailure,'testName'|'file'|'line'>): string`

- [ ] **Step 1: Write failing test**

```ts
// tests/feedback/summary.test.ts
import { describe, it, expect } from 'vitest';
import { toFeedbackHistoryEntry, failureFingerprint } from '../../src/feedback/summary';
import type { Feedback } from '../../src/feedback/types';

describe('feedback summary', () => {
  it('toFeedbackHistoryEntry drops raw and sets failureTypes', () => {
    const feedback: Feedback = {
      status: 'fail',
      round: 2,
      summary: '1 test failed',
      failureTypes: ['assertion'],
      failures: [{
        testName: 'add',
        expected: '3',
        received: '-1',
        file: 'src/math.test.ts',
        line: 10,
        type: 'assertion',
        raw: 'HUGE RAW',
      }],
    };
    const entry = toFeedbackHistoryEntry(feedback);
    expect(entry.failures?.[0]).not.toHaveProperty('raw');
    expect(entry.failureTypes).toEqual(['assertion']);
    expect(JSON.stringify(entry)).not.toContain('HUGE RAW');
  });

  it('failureFingerprint prefers testName', () => {
    expect(failureFingerprint({ testName: 'add', file: 'a.ts', line: 1 })).toBe('add');
    expect(failureFingerprint({ testName: '(unknown test)', file: 'a.ts', line: 3 })).toBe('a.ts:3');
  });
});
```

- [ ] **Step 2: Run test — expect FAIL (module missing)**

Run: `npx vitest run tests/feedback/summary.test.ts`
Expected: FAIL cannot find module

- [ ] **Step 3: Implement types + summary.ts**

Update `types.ts` with `RepeatedFailure`, optional fields on `Feedback`, export `FeedbackHistoryEntry`.

Implement `summary.ts`:

```ts
import type { Feedback, FeedbackHistoryEntry, TestFailure } from './types';

export function failureFingerprint(f: Pick<TestFailure, 'testName' | 'file' | 'line'>): string {
  const name = f.testName?.trim();
  if (name && name !== '(unknown test)') return name;
  if (f.file && f.file !== '(unknown)' && f.line > 0) return `${f.file}:${f.line}`;
  if (f.file && f.file !== '(unknown)') return f.file;
  return 'unknown';
}

export function toFeedbackHistoryEntry(feedback: Feedback): FeedbackHistoryEntry {
  return {
    round: feedback.round,
    status: feedback.status,
    summary: feedback.summary,
    failureTypes: feedback.failureTypes ?? [...new Set(feedback.failures.map((x) => x.type))],
    failures: feedback.failures.map(({ testName, type, file, line, expected, received }) => ({
      testName, type, file, line, expected, received,
    })),
    repeatedFailure: feedback.repeatedFailure,
  };
}
```

When building Feedback in validator later, set `failureTypes`; for now helper derives them.

- [ ] **Step 4: Run test — expect PASS**

Run: `npx vitest run tests/feedback/summary.test.ts`

- [ ] **Step 5: Commit** (skip unless user asked)

---
