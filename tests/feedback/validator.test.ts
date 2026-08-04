import { describe, it, expect } from 'vitest';
import { FeedbackValidator } from '../../src/feedback/validator';

describe('FeedbackValidator', () => {
  const validator = new FeedbackValidator();

  it('returns pass for successful test output', () => {
    const result = validator.validate(
      'Tests: 3 passed, 3 total',
      1
    );
    expect(result.status).toBe('pass');
    expect(result.failures).toHaveLength(0);
  });

  it('returns fail and parses failures', () => {
    const output = 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12';
    const result = validator.validate(output, 1);
    expect(result.status).toBe('fail');
    expect(result.failures).toHaveLength(1);
    expect(result.failures[0].testName).toBe('add(1, 2)');
    expect(result.failures[0].type).toBe('assertion');
  });

  it('returns fail for command error output', () => {
    const result = validator.validate('', 1, 'Command failed with exit code 1');
    expect(result.status).toBe('fail');
    expect(result.failures.length).toBeGreaterThan(0);
    expect(result.failures[0].type).toBe('runtime');
  });
});