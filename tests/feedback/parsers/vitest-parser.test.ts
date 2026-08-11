import { describe, it, expect } from 'vitest';
import { VitestParser } from '../../../src/feedback/parsers/vitest-parser';

const vitestOutput = `FAIL  src/math.test.ts > add > adds two numbers
AssertionError: expected 3 to be 5
 ❯ src/math.test.ts:5:20
     3| test('adds two numbers', () => {
     4|   const result = add(1, 2);
     5|   expect(result).toBe(5);
       |                    ^
     6| });`;

const vitestOutputMultiple = `FAIL  src/math.test.ts > add > adds two numbers
AssertionError: expected 3 to be 5
 ❯ src/math.test.ts:5:20

FAIL  src/string.test.ts > greet > returns greeting
AssertionError: expected 'Hello' to be 'Hi'
 ❯ src/string.test.ts:10:20`;

describe('VitestParser', () => {
  const parser = new VitestParser();

  describe('canParse', () => {
    it('returns true for output containing "FAIL"', () => {
      expect(parser.canParse(vitestOutput)).toBe(true);
    });

    it('returns true for output containing "AssertionError"', () => {
      expect(parser.canParse('AssertionError: something went wrong')).toBe(true);
    });

    it('returns false for unrelated output', () => {
      expect(parser.canParse('All tests passed')).toBe(false);
    });
  });

  describe('parse', () => {
    it('extracts test name from Vitest failure output', () => {
      const failures = parser.parse(vitestOutput);
      expect(failures).toHaveLength(1);
      expect(failures[0].testName).toBe('adds two numbers');
    });

    it('extracts expected and received values', () => {
      const failures = parser.parse(vitestOutput);
      expect(failures[0].expected).toBe('3');
      expect(failures[0].received).toBe('5');
    });

    it('extracts file and line number', () => {
      const failures = parser.parse(vitestOutput);
      expect(failures[0].file).toBe('src/math.test.ts');
      expect(failures[0].line).toBe(5);
    });

    it('classifies as assertion failure', () => {
      const failures = parser.parse(vitestOutput);
      expect(failures[0].type).toBe('assertion');
    });

    it('preserves raw output', () => {
      const failures = parser.parse(vitestOutput);
      expect(failures[0].raw).toBe(vitestOutput);
    });

    it('parses multiple failures', () => {
      const failures = parser.parse(vitestOutputMultiple);
      expect(failures).toHaveLength(2);
      expect(failures[0].testName).toBe('adds two numbers');
      expect(failures[1].testName).toBe('returns greeting');
    });
  });
});