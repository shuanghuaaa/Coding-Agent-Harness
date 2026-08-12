import { describe, it, expect } from 'vitest';
import { KeywordRetriever } from '../../src/memory/retriever';
import type { MemoryEntry } from '../../src/memory/types';

const entries: MemoryEntry[] = [
  { id: 1, key: 'test-framework', value: 'Use vitest for testing', category: 'convention', created_at: '', updated_at: '' },
  { id: 2, key: 'code-style', value: 'Prefer arrow functions', category: 'preference', created_at: '', updated_at: '' },
  { id: 3, key: 'math-utils', value: 'Math functions in src/math.ts', category: 'decision', created_at: '', updated_at: '' },
  { id: 4, key: 'api-design', value: 'Use REST for all endpoints', category: 'convention', created_at: '', updated_at: '' },
];

describe('KeywordRetriever', () => {
  const retriever = new KeywordRetriever();

  it('returns relevant memories matching task keywords', () => {
    const result = retriever.retrieve('write an add function in math', entries, 5);
    expect(result).toHaveLength(2);
    expect(result[0].key).toBe('math-utils');
  });

  it('returns empty array when no keywords match', () => {
    const result = retriever.retrieve('deploy to production', entries, 5);
    expect(result).toHaveLength(0);
  });

  it('respects maxResults limit', () => {
    const many: MemoryEntry[] = entries.map((e, i) => ({ ...e, key: `test-${i}`, value: 'add function' }));
    const result = retriever.retrieve('write an add function', many, 2);
    expect(result.length).toBeLessThanOrEqual(2);
  });

  it('handles empty task text', () => {
    const result = retriever.retrieve('', entries, 5);
    expect(result).toHaveLength(0);
  });

  it('handles empty entries', () => {
    const result = retriever.retrieve('write add function', [], 5);
    expect(result).toHaveLength(0);
  });
});
