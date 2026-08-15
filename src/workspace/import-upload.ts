import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { randomBytes } from 'node:crypto';

const SKIP_SEGMENTS = new Set([
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.output',
  '__pycache__',
  '.venv',
  'venv',
  'target',
]);

const MAX_FILES = 5000;
const MAX_FILE_BYTES = 512 * 1024;
const MAX_TOTAL_BYTES = 50 * 1024 * 1024;

export interface ImportFile {
  path: string;
  content: string | Buffer;
}

export interface ImportWriteResult {
  written: number;
  skipped: number;
}

export function sanitizeRelPath(rel: string): string | null {
  if (typeof rel !== 'string' || !rel.trim()) return null;
  const normalized = rel.trim().replace(/\\/g, '/');
  if (normalized.startsWith('/') || /^[a-zA-Z]:/.test(normalized)) return null;

  const parts = normalized.split('/').filter((p) => p && p !== '.');
  if (parts.length === 0) return null;
  if (parts.some((p) => p === '..' || SKIP_SEGMENTS.has(p))) return null;
  return parts.join('/');
}

function commonTopFolder(rels: string[]): string | null {
  const firsts = rels.map((r) => r.split('/')[0]).filter(Boolean);
  if (firsts.length === 0) return null;
  const top = firsts[0];
  if (!firsts.every((f) => f === top)) return null;
  return rels.some((r) => r.includes('/')) ? top : null;
}

export function writeImportedFiles(destRoot: string, files: ImportFile[]): ImportWriteResult {
  if (!Array.isArray(files) || files.length === 0) {
    throw new Error('No files to import');
  }

  const prepared: Array<{ rel: string; buf: Buffer }> = [];
  let skipped = 0;
  let total = 0;

  for (const file of files) {
    const safe = sanitizeRelPath(file.path);
    if (!safe) {
      skipped += 1;
      continue;
    }
    const buf = Buffer.isBuffer(file.content) ? file.content : Buffer.from(String(file.content), 'utf8');
    if (buf.length > MAX_FILE_BYTES) {
      skipped += 1;
      continue;
    }
    total += buf.length;
    if (total > MAX_TOTAL_BYTES) {
      throw new Error('Import too large');
    }
    prepared.push({ rel: safe, buf });
    if (prepared.length > MAX_FILES) {
      throw new Error(`Too many files (max ${MAX_FILES})`);
    }
  }

  if (prepared.length === 0) {
    throw new Error('No files to import');
  }

  const top = commonTopFolder(prepared.map((p) => p.rel));
  const dest = resolve(destRoot);
  mkdirSync(dest, { recursive: true });

  let written = 0;
  for (const item of prepared) {
    const rel = top && item.rel.startsWith(`${top}/`) ? item.rel.slice(top.length + 1) : item.rel;
    if (!rel) {
      skipped += 1;
      continue;
    }
    const abs = resolve(dest, rel);
    if (!abs.startsWith(dest)) {
      skipped += 1;
      continue;
    }
    mkdirSync(dirname(abs), { recursive: true });
    writeFileSync(abs, item.buf);
    written += 1;
  }

  return { written, skipped };
}

export function createImportRoot(importsDir: string, projectName: string): string {
  const slug = (projectName || 'project')
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9._-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40) || 'project';
  const dir = join(resolve(importsDir), `${slug}-${randomBytes(4).toString('hex')}`);
  mkdirSync(dir, { recursive: true });
  return dir;
}
