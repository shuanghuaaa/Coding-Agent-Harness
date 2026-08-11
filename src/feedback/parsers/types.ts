import type { TestFailure } from '../types';

export interface TestOutputParser {
  canParse(output: string): boolean;
  parse(output: string): TestFailure[];
}