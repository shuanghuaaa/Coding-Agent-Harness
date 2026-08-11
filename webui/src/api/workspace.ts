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

function authHeaders(): HeadersInit {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function listWorkspaceFiles(): Promise<FileTreeNode[]> {
  const res = await fetch('/api/workspace/files', { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<FileTreeNode[]>;
}

export async function getWorkspaceFile(path: string): Promise<WorkspaceFile> {
  const q = new URLSearchParams({ path });
  const res = await fetch(`/api/workspace/file?${q}`, { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<WorkspaceFile>;
}

export async function getWorkspaceRoot(): Promise<string> {
  const res = await fetch('/api/workspace/root', { headers: authHeaders() });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  const body = (await res.json()) as { path: string };
  return body.path;
}

export async function setWorkspaceRoot(path: string): Promise<string> {
  const res = await fetch('/api/workspace/root', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
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
  const res = await fetch(`/api/workspace/browse?${q}`, { headers: authHeaders() });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
  return res.json() as Promise<BrowseResult>;
}
