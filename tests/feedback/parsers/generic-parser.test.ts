import { describe, it, expect } from 'vitest';
import { GenericParser } from '../../src/feedback/parsers/generic-parser';

describe('GenericParser', () => {
  const parser = new GenericParser();

  it('canParse always returns true', () => {
    expect(parser.canParse('anything')).toBe(true);
    expect(parser.canParse('')).toBe(true);
    expect(parser.canParse('some random output')).toBe(true);
  });

  it('parses FAIL lines', () => {
    const output = 'FAIL: test_foo expected true got false at test.ts:1:1';
    const result = parser.parse(output);
    expect(result).toHaveLength(1);
    expect(result[0].testName).toBeDefined();
    expect(result[0].raw).toBe(output);
  });

  it('parses multiple FAIL lines', () => {
    const output = [
      'FAIL: test_foo expected true got false at test.ts:1:1',
      'FAIL: test_bar expected 3 got 5 at test.ts:2:1',
    ].join('\n');
    const result = parser.parse(output);
    expect(result).toHaveLength(2);
  });

  it('falls back to error lines when no FAIL present', () => {
    const output = 'Some error occurred\nassertion failed\n';
    const result = parser.parse(output);
    expect(result.length).toBeGreaterThanOrEqual(1);
  });

  it('returns empty array for clean output', () => {
    const result = parser.parse('All tests passed\n3 tests, 3 passed');
    expect(result).toHaveLength(0);
  });

  it('filters out lines starting with at or pipe', () => {
    const output = 'at stack trace line\nerror: something broke\n| code snippet';
    const result = parser.parse(output);
    expect(result.length).toBe(1);
    expect(result[0].raw).toBe('error: something broke');
  });
});