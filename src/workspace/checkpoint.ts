import { execFileSync } from 'node:child_process';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { join, resolve } from 'node:path';

export interface Checkpoint {
  id: string;
  baseCommit: string;
}

export interface CheckpointDiff {
  files: string[];
  patch: string;
}

export class WorkspaceCheckpoint {
  constructor(private readonly workspaceRoot: string) {}

  create(): Checkpoint {
    this.assertGitRepo();
    const baseCommit = this.git(['rev-parse', 'HEAD']);
    return { id: randomUUID(), baseCommit };
  }

  diff(checkpoint: Checkpoint): CheckpointDiff {
    this.assertGitRepo();
    const changedTracked = this.git(['diff', '--name-only', checkpoint.baseCommit])
      .split('\n')
      .filter(Boolean);
    const untracked = this.git(['ls-files', '--others', '--exclude-standard'])
      .split('\n')
      .filter(Boolean);
    const files = [...new Set([...changedTracked, ...untracked])];

    let patch = this.git(['diff', checkpoint.baseCommit]);
    for (const file of untracked) {
      try {
        const content = readFileSync(join(this.workspaceRoot, file), 'utf8');
        patch += `\ndiff --git a/${file} b/${file}\n--- /dev/null\n+++ b/${file}\n`;
        const lines = content.split('\n');
        patch += `@@ -0,0 +1,${lines.length} @@\n`;
        for (const line of lines) patch += `+${line}\n`;
      } catch {
        // ignore unreadable untracked files
      }
    }

    return { files, patch };
  }

  rollback(checkpoint: Checkpoint): void {
    this.assertGitRepo();
    this.git(['reset', '--hard', checkpoint.baseCommit]);
    this.git(['clean', '-fd']);
  }

  private git(args: string[]): string {
    return execFileSync('git', args, {
      cwd: this.workspaceRoot,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'pipe'],
    }).trim();
  }

  private assertGitRepo(): void {
    try {
      const toplevel = this.normalizePath(this.git(['rev-parse', '--show-toplevel']));
      const root = this.normalizePath(this.workspaceRoot);
      if (toplevel !== root) {
        throw new Error('not a git repository');
      }
    } catch (err) {
      if (err instanceof Error && /not a git repository/i.test(err.message)) {
        throw err;
      }
      throw new Error('not a git repository');
    }
  }

  private normalizePath(p: string): string {
    return resolve(p).replace(/\\/g, '/').toLowerCase();
  }
}
