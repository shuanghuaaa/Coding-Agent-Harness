import type { FailureType, TestFailure } from './types';

export class FailureClassifier {
  classify(errorMessage: string): FailureType {
    if (/expected|Expected|assert/i.test(errorMessage)) return 'assertion';
    if (/TS\d{4}|compilation|syntax error|type.*error/i.test(errorMessage)) return 'compile';
    if (/timeout|timed out/i.test(errorMessage)) return 'timeout';
    return 'runtime';
  }

  parseFailure(raw: string): TestFailure {
    const type = this.classify(raw);
    const testMatch = raw.match(/FAIL:\s*(.+?)(?:\s+expected|\s+at)/);
    const expectedMatch = raw.match(/expected\s+(.+?)[,\s]+got/);
    const receivedMatch = raw.match(/got\s+(.+?)(?:\s+at|$)/);
    const fileMatch = raw.match(/at\s+(\S+?):(\d+):\d+/);

    return {
      testName: testMatch?.[1]?.trim() || '(unknown test)',
      expected: expectedMatch?.[1]?.trim() || '(unknown)',
      received: receivedMatch?.[1]?.trim() || '(unknown)',
      file: fileMatch?.[1] || '(unknown)',
      line: fileMatch ? parseInt(fileMatch[2], 10) : 0,
      type,
      raw,
    };
  }
}