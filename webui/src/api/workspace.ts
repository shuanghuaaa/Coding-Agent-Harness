import type { FileTreeNode, WorkspaceFile } from '../types';

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

export async function listWorkspaceFiles(): Promise<FileTreeNode[]> {
  const res = await fetch('/api/workspace/files');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<FileTreeNode[]>;
}

export async function getWorkspaceFile(path: string): Promise<WorkspaceFile> {
  const q = new URLSearchParams({ path });
  const res = await fetch(`/api/workspace/file?${q}`);
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<WorkspaceFile>;
}

export interface ImportWorkspaceResult {
  path: string;
  written: number;
  skipped: number;
}

export async function putWorkspaceFile(path: string, content: string): Promise<{ path: string; size: number }> {
  const res = await fetch('/api/workspace/file', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path, content }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<{ path: string; size: number }>;
}

export async function importWorkspacePayload(
  name: string,
  files: Array<{ path: string; content: string }>,
): Promise<ImportWorkspaceResult> {
  const res = await fetch('/api/workspace/import', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ name, files }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<ImportWorkspaceResult>;
}

export async function getWorkspaceRoot(): Promise<string> {
  const res = await fetch('/api/workspace/root');
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { path: string };
  return body.path;
}

export async function setWorkspaceRoot(path: string): Promise<string> {
  const res = await fetch('/api/workspace/root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { path: string };
  return body.path;
}

export async function clearWorkspaceRoot(): Promise<string> {
  const res = await fetch('/api/workspace/root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ clear: true }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  const body = (await res.json()) as { path: string };
  return body.path;
}

const SKIP_UPLOAD = /(?:^|\/)(node_modules|\.git|dist|coverage|\.next|\.turbo|__pycache__|\.venv|venv)(?:\/|$)/;
const SKIP_BINARY = /\.(png|jpe?g|gif|webp|ico|pdf|zip|gz|woff2?|exe|dll|so|dylib|mp4|mp3|wasm)$/i;
const MAX_UPLOAD_FILE = 512 * 1024;

export function shouldUploadLocalFile(file: File): boolean {
  const rel = (file.webkitRelativePath || file.name).replace(/\\/g, '/');
  if (SKIP_UPLOAD.test(rel)) return false;
  if (SKIP_BINARY.test(file.name)) return false;
  if (file.size > MAX_UPLOAD_FILE) return false;
  return true;
}

export async function importWorkspaceFolder(files: File[]): Promise<ImportWorkspaceResult> {
  const picked = files.filter(shouldUploadLocalFile);
  if (picked.length === 0) {
    throw new Error('没有可上传的文本文件（已跳过 node_modules / 二进制 / 过大文件）');
  }
  const firstRel = (picked[0].webkitRelativePath || picked[0].name).replace(/\\/g, '/');
  const name = firstRel.split('/')[0] || 'project';
  const payload = await Promise.all(
    picked.map(async (file) => ({
      path: (file.webkitRelativePath || file.name).replace(/\\/g, '/'),
      content: await file.text(),
    })),
  );
  return importWorkspacePayload(name, payload);
}

export async function browseWorkspace(path = ''): Promise<BrowseResult> {
  const q = new URLSearchParams();
  if (path) q.set('path', path);
  const res = await fetch(`/api/workspace/browse?${q}`);
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<BrowseResult>;
}
