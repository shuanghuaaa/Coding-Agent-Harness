import type { FileTreeNode, WorkspaceFile } from '../types';

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
