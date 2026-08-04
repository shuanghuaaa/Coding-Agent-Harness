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

export interface Feedback {
  status: FeedbackStatus;
  failures: TestFailure[];
  round: number;
  summary: string;
}