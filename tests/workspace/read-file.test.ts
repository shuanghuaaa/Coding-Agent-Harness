import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWorkspaceFile } from '../../src/workspace/read-file';

describe('readWorkspaceFile', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ws-read-'));
    writeFileSync(join(root, 'hello.txt'), 'hello world', 'utf-8');
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('reads a text file relative to root', () => {
    const r = readWorkspaceFile(root, 'hello.txt');
    expect(r.content).toBe('hello world');
    expect(r.path).toBe('hello.txt');
    expect(r.size).toBeGreaterThan(0);
  });

  it('blocks path traversal', () => {
    expect(() => readWorkspaceFile(root, '../secret')).toThrow(/traversal|blocked/i);
  });

  it('rejects missing files', () => {
    expect(() => readWorkspaceFile(root, 'nope.txt')).toThrow(/not found|ENOENT|Failed/i);
  });

  it('rejects files larger than maxBytes', () => {
    const big = Buffer.alloc(1024 * 1024 + 1, 'a');
    writeFileSync(join(root, 'big.txt'), big);
    expect(() => readWorkspaceFile(root, 'big.txt')).toThrow(/too large/i);
  });

  it('rejects binary files', () => {
    writeFileSync(join(root, 'bin.dat'), Buffer.from([0x48, 0x00, 0x69]));
    expect(() => readWorkspaceFile(root, 'bin.dat')).toThrow(/binary/i);
  });
});
