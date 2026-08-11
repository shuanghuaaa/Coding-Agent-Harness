import { describe, it, expect } from 'vitest';
import { JestParser } from '../../../src/feedback/parsers/jest-parser';

const jestOutput = `● add function › adds two numbers correctly

    expect(received).toBe(expected)

    Expected: 3
    Received: 5

      3 | test('adds two numbers correctly', () => {
      4 |   const result = add(1, 2);
    > 5 |   expect(result).toBe(3);
        |                  ^
      6 | });`;

const jestOutputMultiple = `● add function › adds two numbers correctly

    Expected: 3
    Received: 5

      3 | test('adds two numbers correctly', () => {
      4 |   const result = add(1, 2);
    > 5 |   expect(result).toBe(3);
        |                  ^
      6 | });

● subtract function › subtracts correctly

    Expected: 1
    Received: 3

      9 | test('subtracts correctly', () => {
     10 |   const result = subtract(5, 2);
    > 11 |   expect(result).toBe(1);
         |                  ^
     12 | });`;

describe('JestParser', () => {
  const parser = new JestParser();

  describe('canParse', () => {
    it('returns true for Jest output containing ● and expect(', () => {
      expect(parser.canParse(jestOutput)).toBe(true);
    });

    it('returns false for output without ● and expect(', () => {
      expect(parser.canParse('All tests passed')).toBe(false);
    });
  });

  describe('parse', () => {
    it('extracts test name from Jest failure output', () => {
      const failures = parser.parse(jestOutput);
      expect(failures).toHaveLength(1);
      expect(failures[0].testName).toBe('add function › adds two numbers correctly');
    });

    it('extracts expected and received values', () => {
      const failures = parser.parse(jestOutput);
      expect(failures[0].expected).toBe('3');
      expect(failures[0].received).toBe('5');
    });

    it('classifies as assertion failure', () => {
      const failures = parser.parse(jestOutput);
      expect(failures[0].type).toBe('assertion');
    });

    it('preserves raw output', () => {
      const failures = parser.parse(jestOutput);
      expect(failures[0].raw).toBe(jestOutput);
    });

    it('parses multiple failures', () => {
      const failures = parser.parse(jestOutputMultiple);
      expect(failures).toHaveLength(2);
      expect(failures[0].testName).toBe('add function › adds two numbers correctly');
      expect(failures[1].testName).toBe('subtract function › subtracts correctly');
    });
  });
});