import { describe, it, expect } from 'vitest';
import { FailureClassifier } from '../../src/feedback/classifier';

describe('FailureClassifier', () => {
  const classifier = new FailureClassifier();

  it('classifies assertion failures', () => {
    const type = classifier.classify(
      'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12'
    );
    expect(type).toBe('assertion');
  });

  it('classifies compilation errors', () => {
    const type = classifier.classify(
      "error TS2322: Type 'string' is not assignable to type 'number'"
    );
    expect(type).toBe('compile');
  });

  it('classifies timeout errors', () => {
    const type = classifier.classify(
      'Test timed out after 5000ms'
    );
    expect(type).toBe('timeout');
  });

  it('defaults to runtime for unknown errors', () => {
    const type = classifier.classify(
      'Segmentation fault (core dumped)'
    );
    expect(type).toBe('runtime');
  });

  it('parses test failure details', () => {
    const failure = classifier.parseFailure(
      'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12'
    );
    expect(failure).toEqual({
      testName: 'add(1, 2)',
      expected: '3',
      received: '-1',
      file: 'src/math.ts',
      line: 3,
      type: 'assertion',
      raw: 'FAIL: add(1, 2) expected 3, got -1 at src/math.ts:3:12',
    });
  });
});