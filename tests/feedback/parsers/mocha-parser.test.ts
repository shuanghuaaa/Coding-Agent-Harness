import { describe, it, expect } from 'vitest';
import { MochaParser } from '../../../src/feedback/parsers/mocha-parser';

const mochaOutput = `1) add function
       adds two numbers:
     AssertionError: expected 5 to equal 3
      + expected - actual
      -5
      +3`;

const mochaOutputMultiple = `1) add function
       adds two numbers:
     AssertionError: expected 5 to equal 3
      + expected - actual
      -5
      +3

2) subtract function
       subtracts correctly:
     AssertionError: expected 3 to equal 1
      + expected - actual
      -3
      +1`;

describe('MochaParser', () => {
  const parser = new MochaParser();

  describe('canParse', () => {
    it('returns true for Mocha output with AssertionError and diff', () => {
      expect(parser.canParse(mochaOutput)).toBe(true);
    });

    it('returns false for output without diff pattern', () => {
      expect(parser.canParse('All tests passed')).toBe(false);
    });
  });

  describe('parse', () => {
    it('extracts test name from Mocha failure output', () => {
      const failures = parser.parse(mochaOutput);
      expect(failures).toHaveLength(1);
      expect(failures[0].testName).toBe('add function adds two numbers');
    });

    it('extracts expected and actual from diff format', () => {
      const failures = parser.parse(mochaOutput);
      expect(failures[0].expected).toBe('3');
      expect(failures[0].received).toBe('5');
    });

    it('classifies as assertion failure', () => {
      const failures = parser.parse(mochaOutput);
      expect(failures[0].type).toBe('assertion');
    });

    it('preserves raw output', () => {
      const failures = parser.parse(mochaOutput);
      expect(failures[0].raw).toBe(mochaOutput);
    });

    it('parses multiple failures', () => {
      const failures = parser.parse(mochaOutputMultiple);
      expect(failures).toHaveLength(2);
      expect(failures[0].testName).toBe('add function adds two numbers');
      expect(failures[1].testName).toBe('subtract function subtracts correctly');
    });

    it('returns unknown file and line 0 for Mocha output', () => {
      const failures = parser.parse(mochaOutput);
      expect(failures[0].file).toBe('(unknown)');
      expect(failures[0].line).toBe(0);
    });
  });
});