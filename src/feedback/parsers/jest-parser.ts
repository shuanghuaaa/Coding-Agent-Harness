import type { TestFailure } from '../types';
import { FailureClassifier } from '../classifier';
import type { TestOutputParser } from './types';

export class JestParser implements TestOutputParser {
  private classifier = new FailureClassifier();

  canParse(output: string): boolean {
    return output.includes('\u25CF') && output.includes('expect(');
  }

  parse(output: string): TestFailure[] {
    const failures: TestFailure[] = [];

    // Split by ● blocks
    const blocks = output.split(/\n\s*\n(?=\u25CF)/);

    for (const block of blocks) {
      if (!block.includes('\u25CF')) continue;

      failures.push(this.parseBlock(block));
    }

    // If no blocks were found, try line-based fallback
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

    // Extract test name from: "● add function › adds two numbers correctly"
    const testMatch = block.match(/\u25CF\s+(.+?)(?:\n|$)/);
    const testName = testMatch?.[1]?.trim() || '(unknown test)';

    // Extract expected/received from:
    //   Expected: 3
    //   Received: 5
    const expectedMatch = block.match(/Expected:\s*(.+?)(?:\n|$)/);
    const receivedMatch = block.match(/Received:\s*(.+?)(?:\n|$)/);
    const expected = expectedMatch?.[1]?.trim() || '(unknown)';
    const received = receivedMatch?.[1]?.trim() || '(unknown)';

    // Extract file and line:
    //   > 5 |   expect(result).toBe(3);
    //         |                  ^
    //       at | src/math.test.ts:4:20
    const fileLineMatch = block.match(/at\s+\|\s+(\S+?):(\d+):\d+/);
    // Also try: "at Object.<anonymous> (src/math.test.ts:4:20)"
    const fileLineMatch2 = block.match(/at\s+.*?\((\S+?):(\d+):\d+\)/);
    const fileMatch = fileLineMatch || fileLineMatch2;
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