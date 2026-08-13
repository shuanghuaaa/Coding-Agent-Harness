import type { Feedback, FeedbackHistoryEntry, TestFailure } from './types';

export function failureFingerprint(f: Pick<TestFailure, 'testName' | 'file' | 'line'>): string {
  const name = f.testName?.trim();
  if (name && name !== '(unknown test)') return name;
  if (f.file && f.file !== '(unknown)' && f.line > 0) return `${f.file}:${f.line}`;
  if (f.file && f.file !== '(unknown)') return f.file;
  return 'unknown';
}

export function toFeedbackHistoryEntry(feedback: Feedback): FeedbackHistoryEntry {
  return {
    round: feedback.round,
    status: feedback.status,
    summary: feedback.summary,
    failureTypes: feedback.failureTypes ?? [...new Set(feedback.failures.map((x) => x.type))],
    failures: feedback.failures.map(({ testName, type, file, line, expected, received }) => ({
      testName, type, file, line, expected, received,
    })),
    repeatedFailure: feedback.repeatedFailure,
  };
}
