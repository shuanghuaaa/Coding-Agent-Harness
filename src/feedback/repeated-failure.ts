import type { Feedback, FeedbackHistoryEntry } from './types';
import { failureFingerprint } from './summary';

export function detectRepeatedFailure(
  current: Feedback,
  history: FeedbackHistoryEntry[],
): Feedback {
  if (current.status !== 'fail' || current.failures.length === 0) return current;
  const fp = failureFingerprint(current.failures[0]);
  let streak = 1;
  for (let i = history.length - 1; i >= 0; i--) {
    const h = history[i];
    if (h.status === 'pass') break;
    if (h.status !== 'fail' || !h.failures?.length) break;
    if (failureFingerprint(h.failures[0]) !== fp) break;
    streak += 1;
  }
  if (streak < 2) return current;
  const testName = current.failures[0].testName !== '(unknown test)'
    ? current.failures[0].testName
    : fp;
  return {
    ...current,
    repeatedFailure: {
      testName,
      streak,
      message: `"${testName}" failed ${streak} times in a row. Try a different fix.`,
    },
  };
}
