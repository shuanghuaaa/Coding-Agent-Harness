import { FailureClassifier } from './classifier';
import type { Feedback, TestFailure } from './types';
import type { TestOutputParser } from './parsers/types';
import { VitestParser } from './parsers/vitest-parser';
import { JestParser } from './parsers/jest-parser';
import { MochaParser } from './parsers/mocha-parser';
import { GenericParser } from './parsers/generic-parser';

export class FeedbackValidator {
  private classifier = new FailureClassifier();
  private parsers: TestOutputParser[] = [
    new VitestParser(),
    new JestParser(),
    new MochaParser(),
    new GenericParser(),
  ];

  validate(
    testOutput: string,
    round: number,
    error?: string
  ): Feedback {
    let failures: TestFailure[] = [];

    if (testOutput.includes('FAIL') || testOutput.includes('fail')) {
      failures = this.parseWithChain(testOutput);

      if (failures.length === 0) {
        const failureLines = testOutput
          .split('\n')
          .filter((line) => line.includes('FAIL'));
        failures = failureLines.map((line) =>
          this.classifier.parseFailure(line)
        );
      }
    }

    if (failures.length > 0) {
      return {
        status: 'fail',
        round,
        summary: `${failures.length} test(s) failed`,
        failures,
        failureTypes: [...new Set(failures.map((f) => f.type))],
      };
    }

    if (error) {
      failures = [this.classifier.parseFailure(error)];
      return {
        status: 'fail',
        round,
        summary: `Tests failed with error: ${error}`,
        failures,
        failureTypes: [...new Set(failures.map((f) => f.type))],
      };
    }

    return {
      status: 'pass',
      round,
      summary: 'All tests passed',
      failures: [],
      failureTypes: [],
    };
  }

  private parseWithChain(output: string): TestFailure[] {
    for (const parser of this.parsers) {
      if (parser.canParse(output)) {
        const result = parser.parse(output);
        if (result.length > 0) return result;
      }
    }
    return [];
  }
}
