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
    expect(message).toContain('[assertion]');
  });

  it('includes WARNING when repeatedFailure is set', () => {
    const feedback: Feedback = {
      status: 'fail',
      round: 3,
      summary: '1 test failed',
      failures: [{
        testName: 'add',
        expected: '3',
        received: '-1',
        file: 't.ts',
        line: 1,
        type: 'assertion',
        raw: '',
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

  it('inject pushes feedback message into the array', () => {
    const feedback: Feedback = {
      status: 'pass',
      round: 1,
      summary: 'All tests passed',
      failures: [],
    };
    const messages = [{ role: 'user' as const, content: 'hi' }];
    const before = messages.length;
    injector.inject(messages, feedback);
    expect(messages.length).toBe(before + 1);
    expect(messages[messages.length - 1].role).toBe('system');
  });
});