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
