import { FailureClassifier } from './classifier';
import type { Feedback } from './types';

export class FeedbackValidator {
  private classifier = new FailureClassifier();

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
      const failureLines = testOutput
        .split('\n')
        .filter((line) => line.includes('FAIL'));
      const failures = failureLines.map((line) =>
        this.classifier.parseFailure(line)
      );
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
}