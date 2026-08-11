import type { TestFailure } from '../types';
import { FailureClassifier } from '../classifier';
import type { TestOutputParser } from './types';

export class VitestParser implements TestOutputParser {
  private classifier = new FailureClassifier();

  canParse(output: string): boolean {
    return /FAIL/.test(output) || /AssertionError/.test(output);
  }

  parse(output: string): TestFailure[] {
    const failures: TestFailure[] = [];

    // Split by blank lines to get individual failure blocks
    const blocks = output.split(/\n\s*\n/).filter((b) => b.trim());

    for (const block of blocks) {
      if (block.startsWith('FAIL ')) {
        failures.push(this.parseBlock(block));
      }
    }

    // If no structured blocks were found, fall back to simple line-based parsing
    if (failures.length === 0) {
      const lines = output.split('\n');
      const failLines = lines
        .filter((line) => line.includes('FAIL'))
        .map((line) => this.classifier.parseFailure(line));
      failures.push(...failLines);
    }

    return failures;
  }

  private parseBlock(block: string): TestFailure {
    const type = this.classifier.classify(block);

    // Extract test name from first line: "FAIL  src/math.test.ts > add > adds two numbers"
    // The test name is after the last ">" in the line
    const firstLine = block.split('\n')[0];
    const testMatch = firstLine.match(/FAIL\s+.*>\s*(.+?)$/);
    const testName = testMatch?.[1]?.trim() || '(unknown test)';

    // Extract expected/received from: "AssertionError: expected 3 to be 5"
    const expectedMatch = block.match(/expected\s+([\d.]+)\s+to\s+be\s+([\d.]+)/);
    const expected = expectedMatch?.[1] || '(unknown)';
    const received = expectedMatch?.[2] || '(unknown)';

    // Extract file and line: " ❯ src/math.test.ts:5:20"
    const fileMatch = block.match(/❯\s+(\S+?):(\d+):\d+/);
    const file = fileMatch?.[1] || '(unknown)';
    const line = fileMatch ? parseInt(fileMatch[2], 10) : 0;

    return {
      testName,
      expected,
      received,
      file,
      line,
      type,
      raw: block,
    };
  }
}