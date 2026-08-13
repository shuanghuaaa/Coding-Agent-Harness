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
