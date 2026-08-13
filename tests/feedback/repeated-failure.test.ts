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
