export type FailureType = 'compile' | 'assertion' | 'timeout' | 'runtime';

export interface TestFailure {
  testName: string;
  expected: string;
  received: string;
  file: string;
  line: number;
  type: FailureType;
  raw: string;
}

export type FeedbackStatus = 'pass' | 'fail';

export interface RepeatedFailure {
  testName: string;
  streak: number;
  message: string;
}

export interface Feedback {
  status: FeedbackStatus;
  failures: TestFailure[];
  round: number;
  summary: string;
  failureTypes?: FailureType[];
  repeatedFailure?: RepeatedFailure;
}

export interface FeedbackHistoryEntry {
  round: number;
  status: FeedbackStatus;
  summary?: string;
  failureTypes?: FailureType[];
  failures?: Array<Pick<TestFailure, 'testName' | 'type' | 'file' | 'line' | 'expected' | 'received'>>;
  repeatedFailure?: RepeatedFailure;
}