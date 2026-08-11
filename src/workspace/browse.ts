import { existsSync, readdirSync, statSync } from 'node:fs';
import { basename, dirname, join, resolve } from 'node:path';
import { homedir } from 'node:os';

export interface BrowseEntry {
  name: string;
  path: string;
  type: 'file' | 'folder';
}

export interface BrowseResult {
  path: string;
  parent: string | null;
  entries: BrowseEntry[];
}

/** List Windows drive roots, or home on non-Windows. */
export function listFilesystemRoots(): BrowseEntry[] {
  if (process.platform === 'win32') {
    const drives: BrowseEntry[] = [];
    for (let i = 65; i <= 90; i++) {
      const letter = String.fromCharCode(i);
      const root = `${letter}:\\`;
      if (existsSync(root)) {
        drives.push({ name: `${letter}:`, path: root, type: 'folder' });
      }
    }
    return drives;
  }
  const home = homedir();
  return [
    { name: '/', path: '/', type: 'folder' },
    { name: 'Home', path: home, type: 'folder' },
  ];
}

/**
 * Browse a directory for the folder picker.
 * When path is empty, returns filesystem roots.
 */
export function browseDirectory(dirPath: string): BrowseResult {
  const trimmed = dirPath.trim();
  if (!trimmed) {
    return { path: '', parent: null, entries: listFilesystemRoots() };
  }

  const abs = resolve(trimmed);
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${abs}`);
  }
  const st = statSync(abs);
  if (!st.isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }

  let entries: BrowseEntry[] = [];
  try {
    const names = readdirSync(abs);
    for (const name of names) {
      if (name === '.' || name === '..') continue;
      // Skip heavy / hidden system dirs in listing UX
      if (name === 'node_modules' || name === '.git' || name === '$Recycle.Bin' || name === 'System Volume Information') {
        continue;
      }
      const full = join(abs, name);
      try {
        const info = statSync(full);
        entries.push({
          name,
          path: full,
          type: info.isDirectory() ? 'folder' : 'file',
        });
      } catch {
        // skip unreadable
      }
    }
  } catch (err) {
    throw new Error(`Cannot read directory: ${(err as Error).message}`);
  }

  entries.sort((a, b) => {
    if (a.type !== b.type) return a.type === 'folder' ? -1 : 1;
    return a.name.localeCompare(b.name);
  });

  const parent = dirname(abs);
  const parentOrNull = parent === abs ? null : parent;

  return {
    path: abs,
    parent: parentOrNull,
    entries,
  };
}

export function assertDirectory(dirPath: string): string {
  const abs = resolve(dirPath.trim());
  if (!existsSync(abs)) {
    throw new Error(`Path not found: ${abs}`);
  }
  if (!statSync(abs).isDirectory()) {
    throw new Error(`Not a directory: ${abs}`);
  }
  return abs;
}

export function displayName(dirPath: string): string {
  const abs = resolve(dirPath);
  return basename(abs) || abs;
}
