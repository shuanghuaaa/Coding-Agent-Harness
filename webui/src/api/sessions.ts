import type { SessionRecord, SessionSummary } from '../types';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    throw new Error(`HTTP ${res.status}`);
  }
  return res.json() as Promise<T>;
}

export function listSessions(): Promise<SessionSummary[]> {
  return request<SessionSummary[]>('/api/sessions');
}

export function getSession(id: number): Promise<SessionRecord> {
  return request<SessionRecord>(`/api/sessions/${id}`);
}

export function deleteSession(id: number): Promise<{ ok: true }> {
  return request<{ ok: true }>(`/api/sessions/${id}`, { method: 'DELETE' });
}
