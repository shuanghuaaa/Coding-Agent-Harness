import type { Feedback } from './types';
import type { Message } from '../agent/types';

export class FeedbackInjector {
  buildMessage(feedback: Feedback): string {
    if (feedback.status === 'pass') {
      return `[PASS] ${feedback.summary}`;
    }

    const lines = [
      `[FAIL] ${feedback.summary} (Round ${feedback.round}):`,
      '',
      ...feedback.failures.map(
        (f) =>
          `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.type}] [${f.file}:${f.line}]`
      ),
      ...(feedback.repeatedFailure
        ? ['', `WARNING: ${feedback.repeatedFailure.message}`]
        : []),
      '',
      'Please analyze the failures and fix the code. Run the tests again after making changes.',
    ];

    return lines.join('\n');
  }

  inject(messages: Message[], feedback: Feedback): void {
    const content = this.buildMessage(feedback);
    messages.push({
      role: 'system',
      content,
    });
  }
}