import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import type { CredentialStore } from './store';

const ALGORITHM = 'aes-256-gcm';
const IV_LENGTH = 12;
const TAG_LENGTH = 16;
const DATA_DIR = 'data';
const CREDENTIALS_FILE = 'credentials.enc';

function deriveKey(masterPassword: string): Buffer {
  const hash = require('node:crypto').createHash('sha256');
  hash.update(masterPassword);
  return hash.digest();
}

interface CredentialEntry {
  service: string;
  account: string;
  password: string;
}

interface CredentialData {
  entries: CredentialEntry[];
}

function encrypt(plaintext: string, key: Buffer): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const encrypted = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return Buffer.concat([iv, tag, encrypted]);
}

function decrypt(data: Buffer, key: Buffer): string {
  const iv = data.subarray(0, IV_LENGTH);
  const tag = data.subarray(IV_LENGTH, IV_LENGTH + TAG_LENGTH);
  const encrypted = data.subarray(IV_LENGTH + TAG_LENGTH);
  const decipher = createDecipheriv(ALGORITHM, key, iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString('utf8');
}

export class AESFileCredentialStore implements CredentialStore {
  private key: Buffer;
  private filePath: string;
  private entries: CredentialEntry[];

  constructor(masterPassword: string) {
    this.key = deriveKey(masterPassword);
    this.filePath = join(DATA_DIR, CREDENTIALS_FILE);
    this.entries = this.load();
  }

  private load(): CredentialEntry[] {
    try {
      if (!existsSync(this.filePath)) {
        return [];
      }
      const encrypted = readFileSync(this.filePath);
      const plaintext = decrypt(encrypted, this.key);
      const data: CredentialData = JSON.parse(plaintext);
      return data.entries || [];
    } catch {
      return [];
    }
  }

  private save(): void {
    if (!existsSync(DATA_DIR)) {
      mkdirSync(DATA_DIR, { recursive: true });
    }
    const data: CredentialData = { entries: this.entries };
    const plaintext = JSON.stringify(data);
    const encrypted = encrypt(plaintext, this.key);
    writeFileSync(this.filePath, encrypted);
  }

  async get(service: string, account: string): Promise<string | null> {
    const entry = this.entries.find(
      (e) => e.service === service && e.account === account
    );
    return entry?.password ?? null;
  }

  async set(service: string, account: string, password: string): Promise<void> {
    const idx = this.entries.findIndex(
      (e) => e.service === service && e.account === account
    );
    if (idx >= 0) {
      this.entries[idx].password = password;
    } else {
      this.entries.push({ service, account, password });
    }
    this.save();
  }

  async delete(service: string, account: string): Promise<void> {
    this.entries = this.entries.filter(
      (e) => !(e.service === service && e.account === account)
    );
    this.save();
  }
}