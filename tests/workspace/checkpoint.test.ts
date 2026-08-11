import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { WorkspaceCheckpoint } from '../../src/workspace/checkpoint';

function git(cwd: string, args: string[]): string {
  return execFileSync('git', args, { cwd, encoding: 'utf8' }).trim();
}

describe('WorkspaceCheckpoint', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(join(tmpdir(), 'harness-cp-'));
    git(dir, ['init']);
    git(dir, ['config', 'user.email', 'test@example.com']);
    git(dir, ['config', 'user.name', 'Test']);
    git(dir, ['config', 'core.autocrlf', 'false']);
    writeFileSync(join(dir, 'a.txt'), 'hello\n');
    git(dir, ['add', '.']);
    git(dir, ['commit', '-m', 'init']);
  });

  afterEach(() => {
    rmSync(dir, { recursive: true, force: true });
  });

  it('creates a checkpoint with base commit', () => {
    const cp = new WorkspaceCheckpoint(dir);
    const checkpoint = cp.create();
    expect(checkpoint.id).toBeTruthy();
    expect(checkpoint.baseCommit).toMatch(/^[0-9a-f]{40}$/);
  });

  it('diffs modified and untracked files', () => {
    const cp = new WorkspaceCheckpoint(dir);
    const checkpoint = cp.create();
    writeFileSync(join(dir, 'a.txt'), 'changed\n');
    writeFileSync(join(dir, 'b.txt'), 'new\n');
    const diff = cp.diff(checkpoint);
    expect(diff.files).toContain('a.txt');
    expect(diff.files).toContain('b.txt');
    expect(diff.patch).toContain('changed');
  });

  it('rollbacks workspace to checkpoint', () => {
    const cp = new WorkspaceCheckpoint(dir);
    const checkpoint = cp.create();
    writeFileSync(join(dir, 'a.txt'), 'changed\n');
    writeFileSync(join(dir, 'b.txt'), 'new\n');
    cp.rollback(checkpoint);
    expect(readFileSync(join(dir, 'a.txt'), 'utf8')).toBe('hello\n');
    expect(() => readFileSync(join(dir, 'b.txt'))).toThrow();
  });

  it('throws when workspace is not a git repository', () => {
    const bare = mkdtempSync(join(tmpdir(), 'harness-bare-'));
    try {
      const cp = new WorkspaceCheckpoint(bare);
      expect(() => cp.create()).toThrow(/not a git repository/i);
    } finally {
      rmSync(bare, { recursive: true, force: true });
    }
  });
});
