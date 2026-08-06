import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { AESFileCredentialStore } from '../../src/credentials/aes-file';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';

describe('AESFileCredentialStore', () => {
  let tmpFile: string;

  beforeEach(() => {
    tmpFile = path.join(os.tmpdir(), `harness-creds-${Date.now()}.enc`);
  });

  afterEach(() => {
    try { fs.unlinkSync(tmpFile); } catch { /* ok */ }
  });

  it('stores and retrieves a password', async () => {
    const store = new AESFileCredentialStore('test-master', tmpFile);
    await store.set('llm', 'openai', 'sk-abc123');
    const password = await store.get('llm', 'openai');
    expect(password).toBe('sk-abc123');
  });

  it('returns null for non-existent credential', async () => {
    const store = new AESFileCredentialStore('test-master', tmpFile);
    const password = await store.get('unknown', 'account');
    expect(password).toBeNull();
  });

  it('overwrites existing credential', async () => {
    const store = new AESFileCredentialStore('test-master', tmpFile);
    await store.set('llm', 'openai', 'sk-old');
    await store.set('llm', 'openai', 'sk-new');
    const password = await store.get('llm', 'openai');
    expect(password).toBe('sk-new');
  });

  it('deletes a credential', async () => {
    const store = new AESFileCredentialStore('test-master', tmpFile);
    await store.set('llm', 'openai', 'sk-abc');
    await store.delete('llm', 'openai');
    const password = await store.get('llm', 'openai');
    expect(password).toBeNull();
  });

  it('stores multiple credentials', async () => {
    const store = new AESFileCredentialStore('test-master', tmpFile);
    await store.set('llm', 'openai', 'sk-openai');
    await store.set('llm', 'azure', 'sk-azure');
    expect(await store.get('llm', 'openai')).toBe('sk-openai');
    expect(await store.get('llm', 'azure')).toBe('sk-azure');
  });

  it('different master passwords produce different encryption', async () => {
    const store1 = new AESFileCredentialStore('master1', tmpFile);
    await store1.set('llm', 'openai', 'sk-abc');

    const encrypted = fs.readFileSync(tmpFile);
    const store2 = new AESFileCredentialStore('master2', tmpFile);
    const password = await store2.get('llm', 'openai');
    // With wrong master key, decryption should fail silently (return null)
    expect(password).toBeNull();
  });
});