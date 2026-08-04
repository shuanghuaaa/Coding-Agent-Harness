import type { Feedback } from './types';
import type { Message } from '../agent/types';

export class FeedbackInjector {
  buildMessage(feedback: Feedback): string {
    if (feedback.status === 'pass') {
      return `✅ ${feedback.summary}`;
    }

    const lines = [
      `❌ ${feedback.summary} (Round ${feedback.round}):`,
      '',
      ...feedback.failures.map(
        (f) =>
          `  - ${f.testName}: expected ${f.expected}, got ${f.received} [${f.file}:${f.line}]`
      ),
      '',
      'Please analyze the failures and fix the code. Run the tests again after making changes.',
    ];

    return lines.join('\n');
  }

  inject(
    messages: Message[],
    feedback: Feedback
  ): Message[] {
    const content = this.buildMessage(feedback);
    messages.push({
      role: 'system',
      content,
    });
    return messages;
  }
}