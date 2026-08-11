import { FailureClassifier } from './classifier';
import type { Feedback } from './types';
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
    if (error) {
      return {
        status: 'fail',
        round,
        summary: `Tests failed with error: ${error}`,
        failures: [this.classifier.parseFailure(error)],
      };
    }

    if (testOutput.includes('FAIL') || testOutput.includes('fail')) {
      // Try parsers in order; first parser that canParse() wins
      let failures = this.parseWithChain(testOutput);

      if (failures.length === 0) {
        // Fallback: simple line-based parsing
        const failureLines = testOutput
          .split('\n')
          .filter((line) => line.includes('FAIL'));
        failures = failureLines.map((line) =>
          this.classifier.parseFailure(line)
        );
      }

      return {
        status: 'fail',
        round,
        summary: `${failures.length} test(s) failed`,
        failures,
      };
    }

    return {
      status: 'pass',
      round,
      summary: 'All tests passed',
      failures: [],
    };
  }

  private parseWithChain(output: string) {
    for (const parser of this.parsers) {
      if (parser.canParse(output)) {
        return parser.parse(output);
      }
    }
    return [];
  }
}