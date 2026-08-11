import { readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';

export interface FileTreeNode {
  name: string;
  path: string;
  type: 'file' | 'folder';
  children?: FileTreeNode[];
}

const SKIP = new Set(['node_modules', '.git', 'dist', 'data', 'coverage', '.superpowers']);

export function buildFileTree(root: string, maxDepth = 3): FileTreeNode[] {
  return walk(root, root, 0, maxDepth);
}

function walk(root: string, dir: string, depth: number, maxDepth: number): FileTreeNode[] {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return [];
  }

  const nodes: FileTreeNode[] = [];
  for (const entry of entries.sort((a, b) => {
    if (a.isDirectory() !== b.isDirectory()) return a.isDirectory() ? -1 : 1;
    return a.name.localeCompare(b.name);
  })) {
    if (SKIP.has(entry.name) || entry.name.startsWith('.')) continue;
    const abs = join(dir, entry.name);
    const rel = relative(root, abs).replace(/\\/g, '/');
    if (entry.isDirectory()) {
      const node: FileTreeNode = { name: entry.name, path: rel, type: 'folder' };
      if (depth < maxDepth) {
        node.children = walk(root, abs, depth + 1, maxDepth);
      }
      nodes.push(node);
    } else if (entry.isFile()) {
      try {
        if (statSync(abs).size > 2 * 1024 * 1024) continue;
      } catch {
        continue;
      }
      nodes.push({ name: entry.name, path: rel, type: 'file' });
    }
  }
  return nodes;
}
