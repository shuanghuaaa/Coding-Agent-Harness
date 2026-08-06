import { describe, it, expect } from 'vitest';
import { WinCredentialStore } from '../../src/credentials/win-credential';

describe('WinCredentialStore', () => {
  it('falls back to in-memory storage when keytar is unavailable', async () => {
    const store = new WinCredentialStore();
    await store.set('llm', 'openai', 'sk-test');
    const password = await store.get('llm', 'openai');
    expect(password).toBe('sk-test');
  });

  it('returns null for missing credential', async () => {
    const store = new WinCredentialStore();
    const password = await store.get('nonexistent', 'account');
    expect(password).toBeNull();
  });

  it('deletes a credential', async () => {
    const store = new WinCredentialStore();
    await store.set('llm', 'openai', 'sk-test');
    await store.delete('llm', 'openai');
    const password = await store.get('llm', 'openai');
    expect(password).toBeNull();
  });

  it('stores multiple credentials', async () => {
    const store = new WinCredentialStore();
    await store.set('llm', 'openai', 'sk-openai');
    await store.set('llm', 'azure', 'sk-azure');
    expect(await store.get('llm', 'openai')).toBe('sk-openai');
    expect(await store.get('llm', 'azure')).toBe('sk-azure');
  });
});