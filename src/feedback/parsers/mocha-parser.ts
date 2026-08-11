import type { TestFailure } from '../types';
import { FailureClassifier } from '../classifier';
import type { TestOutputParser } from './types';

export class MochaParser implements TestOutputParser {
  private classifier = new FailureClassifier();

  canParse(output: string): boolean {
    return /AssertionError/.test(output) && /\+\s+expected|\-\s+expected/.test(output);
  }

  parse(output: string): TestFailure[] {
    const failures: TestFailure[] = [];

    // Split by numbered failure headers: "1) ...\n"
    const blocks = output.split(/\n(?=\d+\))/);

    for (const block of blocks) {
      if (!/^\d+\)/.test(block.trim())) continue;
      failures.push(this.parseBlock(block));
    }

    // If no structured blocks were found, fall back to simple line-based parsing
    if (failures.length === 0) {
      const lines = output.split('\n');
      const failLines = lines
        .filter((line) => line.includes('FAIL') || line.includes('fail'))
        .map((line) => this.classifier.parseFailure(line));
      failures.push(...failLines);
    }

    return failures;
  }

  private parseBlock(block: string): TestFailure {
    const type = this.classifier.classify(block);

    // Extract test name:
    //   1) add function
    //        adds two numbers:
    const lines = block.split('\n').filter((l) => l.trim());
    let testName = '(unknown test)';
    if (lines.length >= 2) {
      // remove the leading "1)" from first line
      const suite = lines[0].replace(/^\d+\)\s*/, '').trim();
      const test = lines[1].replace(/^[:\s]+/, '').replace(/:$/, '').trim();
      testName = `${suite} ${test}`;
    }

    // Extract expected/actual from diff format:
    //   + expected - actual
    //   -5
    //   +3
    // Or: "expected 5 to equal 3"
    const expectedMatch = block.match(/expected\s+([\d.]+)\s+to\s+(?:equal|deeply equal|eql)\s+([\d.]+)/);
    const expected = expectedMatch?.[2] || '(unknown)';
    const received = expectedMatch?.[1] || '(unknown)';

    // Also try diff format: lines starting with + / -
    // If expectedMatch didn't work, try the diff lines
    let expected2 = expected;
    let received2 = received;
    if (expected === '(unknown)' || received === '(unknown)') {
      const diffLines = block.split('\n');
      for (const line of diffLines) {
        if (line.trim().startsWith('-') && !line.trim().startsWith('--')) {
          received2 = line.trim().substring(1).trim();
        }
        if (line.trim().startsWith('+') && !line.trim().startsWith('++')) {
          expected2 = line.trim().substring(1).trim();
        }
      }
    }

    return {
      testName,
      expected: expected2,
      received: received2,
      file: '(unknown)',
      line: 0,
      type,
      raw: block,
    };
  }
}