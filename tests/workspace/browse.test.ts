import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { assertDirectory, browseDirectory, listFilesystemRoots } from '../../src/workspace/browse';

describe('browseDirectory', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'browse-'));
    mkdirSync(join(root, 'src'));
    writeFileSync(join(root, 'readme.md'), 'hi');
  });

  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists folders and files', () => {
    const result = browseDirectory(root);
    expect(result.path).toBe(root);
    expect(result.entries.some((e) => e.name === 'src' && e.type === 'folder')).toBe(true);
    expect(result.entries.some((e) => e.name === 'readme.md' && e.type === 'file')).toBe(true);
  });

  it('returns roots when path empty', () => {
    const result = browseDirectory('');
    expect(result.parent).toBeNull();
    expect(result.entries.length).toBeGreaterThan(0);
    expect(result.entries.every((e) => e.type === 'folder')).toBe(true);
  });

  it('rejects missing paths', () => {
    expect(() => browseDirectory(join(root, 'nope'))).toThrow(/not found/i);
  });
});

describe('assertDirectory', () => {
  it('returns absolute path for existing dir', () => {
    const roots = listFilesystemRoots();
    expect(roots.length).toBeGreaterThan(0);
    const abs = assertDirectory(roots[0].path);
    expect(abs.length).toBeGreaterThan(0);
  });
});
