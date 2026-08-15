import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { readWorkspaceFile, writeWorkspaceFile } from '../../src/workspace/read-file';

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

describe('writeWorkspaceFile', () => {
  let root: string;
  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'ws-write-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('writes a nested text file inside the workspace', () => {
    const r = writeWorkspaceFile(root, 'src/hello.ts', 'export const n = 1;\n');
    expect(r.path).toBe('src/hello.ts');
    expect(readFileSync(join(root, 'src/hello.ts'), 'utf8')).toBe('export const n = 1;\n');
  });

  it('blocks path traversal', () => {
    expect(() => writeWorkspaceFile(root, '../secret.txt', 'nope')).toThrow(/traversal|blocked/i);
  });
});
