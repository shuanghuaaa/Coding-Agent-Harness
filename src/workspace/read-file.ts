import { readFileSync, statSync } from 'node:fs';
import { relative } from 'node:path';
import { resolveWorkspacePath } from '../tools/file-tools';

const DEFAULT_MAX = 1 * 1024 * 1024;

export function readWorkspaceFile(
  root: string,
  relativePath: string,
  maxBytes: number = DEFAULT_MAX,
): { path: string; content: string; size: number } {
  const abs = resolveWorkspacePath(relativePath, root);
  let st;
  try {
    st = statSync(abs);
  } catch {
    throw new Error(`File not found: ${relativePath}`);
  }
  if (!st.isFile()) throw new Error(`Not a file: ${relativePath}`);
  if (st.size > maxBytes) throw new Error(`File too large: ${relativePath}`);
  const buf = readFileSync(abs);
  if (buf.includes(0)) throw new Error(`binary file not supported: ${relativePath}`);
  const content = buf.toString('utf-8');
  const rel = relative(root, abs).replace(/\\/g, '/');
  return { path: rel, content, size: st.size };
}
