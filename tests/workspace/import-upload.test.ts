import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, readFileSync, existsSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  sanitizeRelPath,
  writeImportedFiles,
  createImportRoot,
} from '../../src/workspace/import-upload';

describe('sanitizeRelPath', () => {
  it('normalizes slashes', () => {
    expect(sanitizeRelPath('src\\app.ts')).toBe('src/app.ts');
  });

  it('rejects traversal and absolute paths', () => {
    expect(sanitizeRelPath('../secret')).toBeNull();
    expect(sanitizeRelPath('foo/../bar')).toBeNull();
    expect(sanitizeRelPath('/etc/passwd')).toBeNull();
    expect(sanitizeRelPath('C:\\Windows\\system.ini')).toBeNull();
  });

  it('skips dependency and vcs directories', () => {
    expect(sanitizeRelPath('demo/node_modules/leftpad/index.js')).toBeNull();
    expect(sanitizeRelPath('demo/.git/config')).toBeNull();
    expect(sanitizeRelPath('demo/dist/bundle.js')).toBeNull();
  });
});

describe('writeImportedFiles', () => {
  let dest: string;

  beforeEach(() => {
    dest = mkdtempSync(join(tmpdir(), 'import-'));
  });

  afterEach(() => rmSync(dest, { recursive: true, force: true }));

  it('writes allowed files, strips the selected folder name, skips junk', () => {
    const result = writeImportedFiles(dest, [
      { path: 'app/package.json', content: '{"name":"app"}' },
      { path: 'app/src/main.ts', content: 'export const n = 1;\n' },
      { path: 'app/node_modules/x/index.js', content: 'skip' },
    ]);

    expect(result.written).toBe(2);
    expect(result.skipped).toBe(1);
    expect(readFileSync(join(dest, 'package.json'), 'utf8')).toBe('{"name":"app"}');
    expect(readFileSync(join(dest, 'src/main.ts'), 'utf8')).toBe('export const n = 1;\n');
    expect(existsSync(join(dest, 'node_modules'))).toBe(false);
  });

  it('rejects empty file list', () => {
    expect(() => writeImportedFiles(dest, [])).toThrow(/no files/i);
  });

  it('accepts more than 400 source files', () => {
    const files = Array.from({ length: 500 }, (_, i) => ({
      path: `app/f${i}.txt`,
      content: `n=${i}`,
    }));
    const result = writeImportedFiles(dest, files);
    expect(result.written).toBe(500);
  });
});

describe('createImportRoot', () => {
  let base: string;

  beforeEach(() => {
    base = mkdtempSync(join(tmpdir(), 'imports-'));
  });

  afterEach(() => rmSync(base, { recursive: true, force: true }));

  it('creates a unique directory under the imports base', () => {
    const a = createImportRoot(base, 'My App');
    const b = createImportRoot(base, 'My App');
    expect(a).not.toBe(b);
    expect(a.startsWith(base)).toBe(true);
    expect(existsSync(a)).toBe(true);
  });
});
