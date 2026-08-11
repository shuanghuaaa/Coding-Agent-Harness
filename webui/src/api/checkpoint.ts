function authHeaders(): HeadersInit {
  const token = new URLSearchParams(window.location.search).get('token') || '';
  return token ? { Authorization: `Bearer ${token}` } : {};
}

export async function rollbackCheckpoint(id: string): Promise<void> {
  const res = await fetch('/api/checkpoint/rollback', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...authHeaders() },
    body: JSON.stringify({ id }),
  });
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error((body as { error?: string }).error || `HTTP ${res.status}`);
  }
}
