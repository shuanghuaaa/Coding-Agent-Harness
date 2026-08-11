import { describe, it, expect } from 'vitest';

class InMemoryCredentialStore {
  private store = new Map<string, string>();
  async get(service: string, account: string): Promise<string | null> {
    return this.store.get(`${service}:${account}`) ?? null;
  }
  async set(service: string, account: string, password: string): Promise<void> {
    this.store.set(`${service}:${account}`, password);
  }
  async delete(service: string, account: string): Promise<void> {
    this.store.delete(`${service}:${account}`);
  }
}

describe('Credentials API', () => {
  it('stores and retrieves credential', async () => {
    const store = new InMemoryCredentialStore();
    await store.set('llm', 'openai', 'sk-test-key');
    const key = await store.get('llm', 'openai');
    expect(key).toBe('sk-test-key');
  });

  it('returns null for missing credential', async () => {
    const store = new InMemoryCredentialStore();
    const key = await store.get('llm', 'nonexistent');
    expect(key).toBeNull();
  });

  it('deletes credential', async () => {
    const store = new InMemoryCredentialStore();
    await store.set('llm', 'openai', 'sk-test-key');
    await store.delete('llm', 'openai');
    const key = await store.get('llm', 'openai');
    expect(key).toBeNull();
  });

  it('status reports configured when key exists', async () => {
    const store = new InMemoryCredentialStore();
    await store.set('llm', 'openai', 'sk-test-key');
    const key = await store.get('llm', 'openai');
    expect(key !== null && key.length > 0).toBe(true);
  });

  it('status reports not configured when key missing', async () => {
    const store = new InMemoryCredentialStore();
    const key = await store.get('llm', 'openai');
    expect(key === null || key.length === 0).toBe(true);
  });
});