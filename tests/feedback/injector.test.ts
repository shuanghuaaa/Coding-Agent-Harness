import { describe, it, expect } from 'vitest';
import { FeedbackInjector } from '../../src/feedback/injector';
import type { Feedback } from '../../src/feedback/types';

describe('FeedbackInjector', () => {
  const injector = new FeedbackInjector();

  it('builds failure feedback message', () => {
    const feedback: Feedback = {
      status: 'fail',
      round: 1,
      summary: '1 test failed',
      failures: [
        {
          testName: 'add(1, 2)',
          expected: '3',
          received: '-1',
          file: 'src/math.ts',
          line: 3,
          type: 'assertion',
          raw: 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12',
        },
      ],
    };
    const message = injector.buildMessage(feedback);
    expect(message).toContain('1 test failed (Round 1)');
    expect(message).toContain('add(1, 2)');
    expect(message).toContain('expected 3');
    expect(message).toContain('got -1');
    expect(message).toContain('src/math.ts:3');
  });

  it('builds pass feedback message', () => {
    const feedback: Feedback = {
      status: 'pass',
      round: 2,
      summary: 'All tests passed',
      failures: [],
    };
    const message = injector.buildMessage(feedback);
    expect(message).toContain('All tests passed');
  });
});