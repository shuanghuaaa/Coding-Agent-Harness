import { describe, it, expect } from 'vitest';
import type { CredentialStore } from '../../src/credentials/store';

class TestCredentialStore implements CredentialStore {
  private data: Record<string, string> = {};

  async set(service: string, account: string, password: string): Promise<void> {
    this.data[`${service}:${account}`] = password;
  }

  async get(service: string, account: string): Promise<string | null> {
    return this.data[`${service}:${account}`] ?? null;
  }

  async delete(service: string, account: string): Promise<void> {
    delete this.data[`${service}:${account}`];
  }
}

describe('CredentialStore', () => {
  it('stores and retrieves credentials', async () => {
    const store = new TestCredentialStore();
    await store.set('harness', 'openai', 'sk-test123');
    const key = await store.get('harness', 'openai');
    expect(key).toBe('sk-test123');
  });

  it('returns null for missing credentials', async () => {
    const store = new TestCredentialStore();
    expect(await store.get('harness', 'nonexistent')).toBeNull();
  });

  it('deletes credentials', async () => {
    const store = new TestCredentialStore();
    await store.set('harness', 'openai', 'sk-test123');
    await store.delete('harness', 'openai');
    expect(await store.get('harness', 'openai')).toBeNull();
  });
});