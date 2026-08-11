import type { TestFailure } from '../types';
import { FailureClassifier } from '../classifier';
import type { TestOutputParser } from './types';

export class GenericParser implements TestOutputParser {
  private classifier = new FailureClassifier();

  canParse(_output: string): boolean {
    return true;
  }

  parse(output: string): TestFailure[] {
    const failures: TestFailure[] = [];

    const lines = output.split('\n');
    for (const line of lines) {
      if (line.includes('FAIL') || line.includes('fail')) {
        failures.push(this.classifier.parseFailure(line));
      }
    }

    // If no explicit FAIL lines, check for error patterns
    if (failures.length === 0) {
      const errorLines = lines.filter(
        (line) =>
          /error|Error|assert/i.test(line) &&
          !line.trim().startsWith('at ') &&
          !line.trim().startsWith('|')
      );
      for (const line of errorLines) {
        failures.push(this.classifier.parseFailure(line));
      }
    }

    return failures;
  }
}