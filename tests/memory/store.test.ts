import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { MemoryStore } from '../../src/memory/store';

describe('MemoryStore', () => {
  const dbPath = ':memory:';
  let store: MemoryStore;

  beforeEach(() => {
    store = new MemoryStore(dbPath);
  });

  afterEach(() => {
    store.close();
  });

  it('sets and gets a memory entry', () => {
    store.set('test-key', 'test-value', 'convention');
    const entry = store.get('test-key');
    expect(entry).toBeDefined();
    expect(entry!.value).toBe('test-value');
    expect(entry!.category).toBe('convention');
  });

  it('returns undefined for missing key', () => {
    expect(store.get('nonexistent')).toBeUndefined();
  });

  it('lists all entries', () => {
    store.set('key1', 'val1', 'convention');
    store.set('key2', 'val2', 'decision');
    const all = store.list();
    expect(all).toHaveLength(2);
  });

  it('deletes an entry', () => {
    store.set('key1', 'val1', 'convention');
    store.delete('key1');
    expect(store.get('key1')).toBeUndefined();
  });
});